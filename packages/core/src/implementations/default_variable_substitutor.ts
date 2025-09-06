// packages/core/src/implementations/default_variable_substitutor.ts
import { UtcpClientConfig, UtcpVariableNotFoundError, VariableLoaderSchema, UtcpDotEnvLoaderSchema } from '@utcp/core/client/utcp_client_config';
import { VariableSubstitutor } from '@utcp/core/interfaces/variable_substitutor';
import { parse as parseDotEnv } from 'dotenv';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Default implementation of the `VariableSubstitutor` interface.
 * Provides a hierarchical variable resolution system that searches for
 * variables in the following order:
 * 1. Configuration variables (exact match from `config.variables`)
 * 2. Custom variable loaders (in order, from `config.load_variables_from`)
 * 3. Environment variables (`process.env`)
 *
 * It supports variable placeholders using `${VAR_NAME}` or `$VAR_NAME` syntax
 * and applies namespacing (e.g., `manual_name__VAR_NAME`) for isolation.
 */
export class DefaultVariableSubstitutor implements VariableSubstitutor {

  private _rootPath: string; // The root path provided to UtcpClient, used for resolving .env paths

  constructor(rootPath: string = process.cwd()) {
    this._rootPath = rootPath;
  }

  /**
   * Retrieves a variable value from configured sources, respecting namespaces.
   * @param key The variable name to look up (without namespace prefix).
   * @param config The UTCP client configuration.
   * @param namespace An optional namespace to prepend to the variable name for lookup.
   * @returns The resolved variable value.
   * @throws UtcpVariableNotFoundError if the variable cannot be found.
   */
  private async _getVariable(key: string, config: UtcpClientConfig, namespace?: string): Promise<string> {
    const effectiveNamespace = namespace ? namespace.replace(/_/g, '__') : undefined;
    const effectiveVarName = effectiveNamespace ? `${effectiveNamespace}__${key}` : key;

    // 1. Check config.variables (highest precedence for both namespaced and non-namespaced)
    if (config.variables && config.variables[effectiveVarName]) {
      return config.variables[effectiveVarName];
    }
    if (config.variables && config.variables[key]) {
      return config.variables[key];
    }

    // 2. Check custom variable loaders (e.g., .env files)
    if (config.load_variables_from) {
      for (const varLoaderConfig of config.load_variables_from) {
        // We know these are validated by UtcpClientConfigSchema, but for safety:
        const parsedLoader = UtcpDotEnvLoaderSchema.safeParse(varLoaderConfig); 
        if (parsedLoader.success && parsedLoader.data.variable_loader_type === 'dotenv') {
          try {
            const envFilePath = path.resolve(this._rootPath, parsedLoader.data.env_file_path);
            const envContent = await fs.readFile(envFilePath, 'utf-8');
            const envVars = parseDotEnv(envContent);
            if (envVars[effectiveVarName]) {
              return envVars[effectiveVarName];
            }
            if (envVars[key]) {
              return envVars[key];
            }
          } catch (e: any) {
            console.warn(`Could not load .env file from '${parsedLoader.data.env_file_path}' during variable lookup: ${e.message}`);
          }
        }
        // Add logic for other variable_loader_type if implemented
      }
    }

    // 3. Check environment variables (lowest precedence)
    if (process.env[effectiveVarName]) {
      return process.env[effectiveVarName]!;
    }
    if (process.env[key]) {
      return process.env[key]!;
    }

    throw new UtcpVariableNotFoundError(key); // Variable not found after checking all sources
  }

  /**
   * Recursively substitutes variables in the given object.
   * @param obj The object (can be string, array, or object) containing potential variable references to substitute.
   * @param config The UTCP client configuration containing variable definitions and loaders.
   * @param namespace An optional namespace (e.g., manual name) to prefix variable lookups for isolation.
   * @returns The object with all variable references replaced by their values.
   * @throws UtcpVariableNotFoundError if a referenced variable cannot be resolved.
   */
  public async substitute<T>(obj: T, config: UtcpClientConfig, namespace?: string): Promise<T> {
    // Validate namespace format
    if (namespace && !/^[a-zA-Z0-9_]+$/.test(namespace)) {
      throw new Error(`Variable namespace '${namespace}' contains invalid characters. Only alphanumeric characters and underscores are allowed.`);
    }

    if (typeof obj === 'string') {
      let currentString: string = obj;
      const regex = /\$\{([a-zA-Z0-9_]+)\}|\$([a-zA-Z0-9_]+)/g; // Match ${VAR} or $VAR
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      const parts: string[] = [];

      regex.lastIndex = 0; // Reset regex state for global matches

      while ((match = regex.exec(currentString)) !== null) {
        const varNameInTemplate = match[1] || match[2];
        const fullMatch = match[0];

        // Add the part of the string before the current match
        parts.push(currentString.substring(lastIndex, match.index));

        try {
          const replacement = await this._getVariable(varNameInTemplate, config, namespace);
          parts.push(replacement);
        } catch (error: any) {
          if (error instanceof UtcpVariableNotFoundError) {
            // Re-throw the original error with the correct variable name
            throw new UtcpVariableNotFoundError(error.variableName);
          }
          console.warn(`Error substituting variable '${varNameInTemplate}' (namespaced as '${namespace ? namespace.replace(/_/g, '__') + '__' : ''}${varNameInTemplate}'): ${error.message}`);
          throw error; // Re-throw unexpected errors
        }

        lastIndex = match.index + fullMatch.length;
      }
      // Add any remaining part of the string after the last match
      parts.push(currentString.substring(lastIndex));

      return parts.join('') as T; // Join all parts and return as T (which is string in this branch)
    }

    if (Array.isArray(obj)) {
      // Recursively substitute in array elements
      return Promise.all(obj.map(item => this.substitute(item, config, namespace))) as Promise<T>;
    }

    if (obj !== null && typeof obj === 'object') {
      const newObj: { [key: string]: any } = {};
      // Recursively substitute in object properties
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = await this.substitute((obj as any)[key], config, namespace);
        }
      }
      return newObj as T;
    }

    return obj; // Return primitive types unchanged
  }

  /**
   * Recursively finds all variable references in the given object.
   * @param obj The object (can be string, array, or object) to scan for variable references.
   * @param namespace An optional namespace (e.g., manual name) to prefix variable lookups for isolation.
   * @returns A list of fully-qualified variable names found in the object.
   */
  public findRequiredVariables(obj: any, namespace?: string): string[] {
    // Validate namespace format
    if (namespace && !/^[a-zA-Z0-9_]+$/.test(namespace)) {
      throw new Error(`Variable namespace '${namespace}' contains invalid characters. Only alphanumeric characters and underscores are allowed.`);
    }

    const variables: string[] = [];
    const regex = /\$\{([a-zA-Z0-9_]+)\}|\$([a-zA-Z0-9_]+)/g;

    if (typeof obj === 'string') {
      let match;
      while ((match = regex.exec(obj)) !== null) {
        const varNameInTemplate = match[1] || match[2];
        const effectiveNamespace = namespace ? namespace.replace(/_/g, '__') : undefined;
        const prefixedVarName = effectiveNamespace ? `${effectiveNamespace}__${varNameInTemplate}` : varNameInTemplate;
        variables.push(prefixedVarName);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        variables.push(...this.findRequiredVariables(item, namespace));
      }
    } else if (obj !== null && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          variables.push(...this.findRequiredVariables(obj[key], namespace));
        }
      }
    }

    return Array.from(new Set(variables)); // Return unique variable names
  }
}