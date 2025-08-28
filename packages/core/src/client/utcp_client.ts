// packages/core/src/client/utcp_client.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { parse as parseDotEnv } from 'dotenv';
import { CallTemplateBase, CallTemplateBaseSchema } from '@utcp/core/data/call_template';
import { Tool } from '@utcp/core/data/tool';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { ToolRepository } from '@utcp/core/interfaces/tool_repository';
import { ToolSearchStrategy } from '@utcp/core/interfaces/tool_search_strategy';
import { InMemToolRepository } from '@utcp/core/implementations/in_mem_tool_repository';
import { TagSearchStrategy } from '@utcp/core/implementations/tag_search_strategy';
import {
  UtcpClientConfig,
  UtcpClientConfigSchema,
  UtcpVariableNotFoundError,
} from '@utcp/core/client/utcp_client_config';
import { pluginRegistry } from '@utcp/core/plugins/plugin_registry';

export interface IUtcpClient {
  readonly config: UtcpClientConfig;
  readonly toolRepository: ToolRepository;
  readonly searchStrategy: ToolSearchStrategy;
  
  substituteCallTemplateVariables<T extends CallTemplateBase>(callTemplate: T, namespace?: string): Promise<T>;
  // Potentially: log(message: string, isError?: boolean): void;
}

/**
 * The main client for interacting with the Universal Tool Calling Protocol (UTCP).
 * Orchestrates tool discovery, registration, execution, and searching.
 */
export class UtcpClient implements IUtcpClient {
  private _registeredCommProtocols: Map<string, CommunicationProtocol> = new Map();

  private constructor(
    public readonly config: UtcpClientConfig,
    public readonly toolRepository: ToolRepository,
    public readonly searchStrategy: ToolSearchStrategy,
    private readonly _rootPath: string = process.cwd(),
  ) {
    // Dynamically populate registered protocols from the global registry
    for (const [type, protocol] of pluginRegistry.getAllCommProtocols()) {
      this._registeredCommProtocols.set(type, protocol);
    }
  }

  public static async create(
    config: Partial<UtcpClientConfig> = {},
    customToolRepository?: ToolRepository,
    customSearchStrategy?: ToolSearchStrategy,
  ): Promise<UtcpClient> {
    const validatedConfig = UtcpClientConfigSchema.parse(config);
    const toolRepository = customToolRepository ?? new InMemToolRepository();
    const searchStrategy = customSearchStrategy ?? new TagSearchStrategy();
    const client = new UtcpClient(validatedConfig, toolRepository, searchStrategy);

    await client.loadVariables();
    
    // Substitute variables in the initial config's 'variables' field itself
    const tempConfigWithoutOwnVars: UtcpClientConfig = { ...client.config, variables: {} };
    client.config.variables = await client._replaceVarsInObj(client.config.variables, tempConfigWithoutOwnVars);
    await client.registerManuals(client.config.manual_call_templates || []);

    return client;
  }

  public async registerManual(manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    manualCallTemplate.name = manualCallTemplate.name.replace(/[^\w]/g, '_');

    if (await this.toolRepository.getManual(manualCallTemplate.name)) {
      throw new Error(`Manual '${manualCallTemplate.name}' already registered. Please use a different name or deregister the existing manual.`);
    }

    const processedCallTemplate = await this.substituteCallTemplateVariables(manualCallTemplate, manualCallTemplate.name);

    const protocol = this._registeredCommProtocols.get(processedCallTemplate.call_template_type);
    if (!protocol) {
      throw new Error(`No communication protocol registered for type: '${processedCallTemplate.call_template_type}'`);
    }

    const result = await protocol.registerManual(this, processedCallTemplate);

    if (result.success) {
      for (const tool of result.manual.tools) {
        if (!tool.name.startsWith(`${processedCallTemplate.name}.`)) {
          tool.name = `${processedCallTemplate.name}.${tool.name}`;
        }
      }
      await this.toolRepository.saveManual(processedCallTemplate, result.manual);
      console.log(`Successfully registered manual '${manualCallTemplate.name}' with ${result.manual.tools.length} tools.`);
    } else {
      console.error(`Error registering manual '${manualCallTemplate.name}': ${result.errors.join(', ')}`);
    }

    return result;
  }

  public async registerManuals(manualCallTemplates: CallTemplateBase[]): Promise<RegisterManualResult[]> {
    const registrationPromises = manualCallTemplates.map(async (template) => {
      try {
        return await this.registerManual(template);
      } catch (error: any) {
        console.error(`Error during batch registration for manual '${template.name}':`, error.message);
        return {
          manualCallTemplate: template,
          manual: UtcpManualSchema.parse({ tools: [] }),
          success: false,
          errors: [error.message],
        };
      }
    });
    return Promise.all(registrationPromises);
  }

  public async deregisterManual(manualName: string): Promise<boolean> {
    const manualCallTemplate = await this.toolRepository.getManualCallTemplate(manualName);
    if (!manualCallTemplate) {
      console.warn(`Manual '${manualName}' not found for deregistration.`);
      return false;
    }

    const protocol = this._registeredCommProtocols.get(manualCallTemplate.call_template_type);
    if (protocol) {
      await protocol.deregisterManual(this, manualCallTemplate);
      console.log(`Deregistered communication protocol for manual '${manualName}'.`);
    } else {
      console.warn(`No communication protocol found for type '${manualCallTemplate.call_template_type}' of manual '${manualName}'.`);
    }

    const removed = await this.toolRepository.removeManual(manualName);
    if (removed) {
      console.log(`Successfully deregistered manual '${manualName}' from repository.`);
    } else {
      console.warn(`Manual '${manualName}' was not found in the repository during deregistration.`);
    }
    return removed;
  }

  public async callTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
    const manualName = toolName.split('.')[0];
    if (!manualName) {
      throw new Error(`Invalid tool name format for '${toolName}'. Expected 'manual_name.tool_name'.`);
    }

    const tool = await this.toolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in the repository.`);
    }

    const processedToolCallTemplate = await this.substituteCallTemplateVariables(tool.tool_call_template, manualName);

    const protocol = this._registeredCommProtocols.get(processedToolCallTemplate.call_template_type);
    if (!protocol) {
      throw new Error(`No communication protocol registered for type: '${processedToolCallTemplate.call_template_type}'.`);
    }

    console.log(`Calling tool '${toolName}' via protocol '${processedToolCallTemplate.call_template_type}'.`);
    const result = await protocol.callTool(this, toolName, toolArgs, processedToolCallTemplate);
    return result;
  }

  public async *callToolStreaming(toolName: string, toolArgs: Record<string, any>): AsyncGenerator<any, void, unknown> {
    const manualName = toolName.split('.')[0];
    if (!manualName) {
      throw new Error(`Invalid tool name format for '${toolName}'. Expected 'manual_name.tool_name'.`);
    }

    const tool = await this.toolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in the repository.`);
    }
    
    const processedToolCallTemplate = await this.substituteCallTemplateVariables(tool.tool_call_template, manualName);

    const protocol = this._registeredCommProtocols.get(processedToolCallTemplate.call_template_type);
    if (!protocol) {
      throw new Error(`No communication protocol registered for type: '${processedToolCallTemplate.call_template_type}'.`);
    }

    console.log(`Calling tool '${toolName}' streamingly via protocol '${processedToolCallTemplate.call_template_type}'.`);
    for await (const chunk of protocol.callToolStreaming(this, toolName, toolArgs, processedToolCallTemplate)) {
      yield chunk;
    }
  }

  public async searchTools(query: string, limit?: number, anyOfTagsRequired?: string[]): Promise<Tool[]> {
    console.log(`Searching for tools with query: '${query}'`);
    return this.searchStrategy.searchTools(this.toolRepository, query, limit, anyOfTagsRequired);
  }

  public async substituteCallTemplateVariables<T extends CallTemplateBase>(callTemplate: T, namespace?: string): Promise<T> {
    const specificCallTemplateSchema = pluginRegistry.getCallTemplateSchema(callTemplate.call_template_type);
    if (!specificCallTemplateSchema) {
      console.warn(`No specific CallTemplate schema registered for type '${callTemplate.call_template_type}'. ` +
                   `Falling back to base schema for variable substitution validation.`);
      const rawSubstituted = await this._replaceVarsInObj(callTemplate, this.config, namespace);
      return CallTemplateBaseSchema.parse(rawSubstituted) as T;
    }

    const rawSubstituted = await this._replaceVarsInObj(callTemplate, this.config, namespace);
    return specificCallTemplateSchema.parse(rawSubstituted) as T;
  }

  private async loadVariables(): Promise<void> {
    for (const varLoader of this.config.load_variables_from || []) {
      if (varLoader.type === 'dotenv') {
        try {
          const envFilePath = path.resolve(this._rootPath, varLoader.env_file_path);
          const envContent = await fs.readFile(envFilePath, 'utf-8');
          const envVars = parseDotEnv(envContent);
          this.config.variables = { ...envVars, ...this.config.variables };
          console.log(`Loaded variables from .env file: ${envFilePath}`);
        } catch (e: any) {
          console.warn(`Could not load .env file from '${varLoader.env_file_path}': ${e.message}`);
        }
      }
    }
  }

  private async _replaceVarsInObj(obj: any, config: UtcpClientConfig, namespace?: string): Promise<any> {
    if (typeof obj === 'string') {
      const regex = /\$\{([^}]+)\}|\$(\w+)/g;
      let result = obj;
      let match;

      regex.lastIndex = 0;

      while ((match = regex.exec(obj)) !== null) {
        const varNameInTemplate = match[1] || match[2];

        let effectiveVarName = varNameInTemplate;
        if (namespace) {
          effectiveVarName = `${namespace.replace(/_/g, '__')}__${varNameInTemplate}`;
        }
        
        try {
          if (config.variables && config.variables[effectiveVarName]) {
            result = result.replace(match[0], config.variables[effectiveVarName]!);
          } else if (config.variables && config.variables[varNameInTemplate]) {
            result = result.replace(match[0], config.variables[varNameInTemplate]!);
          }
          else if (process.env[effectiveVarName]) {
            result = result.replace(match[0], process.env[effectiveVarName]!);
          } else if (process.env[varNameInTemplate]) { 
            result = result.replace(match[0], process.env[varNameInTemplate]!);
          }
          else {
            let foundInLoader = false;
            if (config.load_variables_from) {
              for (const loaderConfig of config.load_variables_from) {
                if (loaderConfig.type === 'dotenv') {
                  const envFilePath = path.resolve(this._rootPath, loaderConfig.env_file_path);
                  const envContent = await fs.readFile(envFilePath, 'utf-8');
                  const envVars = parseDotEnv(envContent);
                  
                  if (envVars[effectiveVarName]) {
                    result = result.replace(match[0], envVars[effectiveVarName]!);
                    foundInLoader = true;
                    break;
                  } else if (envVars[varNameInTemplate]) { 
                    result = result.replace(match[0], envVars[varNameInTemplate]!);
                    foundInLoader = true;
                    break;
                  }
                }
              }
            }
            if (!foundInLoader) {
              throw new UtcpVariableNotFoundError(effectiveVarName);
            }
          }
        } catch (error: any) {
          if (error instanceof UtcpVariableNotFoundError) {
            throw error;
          }
          console.warn(`Error substituting variable '${varNameInTemplate}' (namespaced as '${effectiveVarName}'): ${error.message}`);
        }
      }
      return result;
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this._replaceVarsInObj(item, config, namespace)));
    }

    if (obj !== null && typeof obj === 'object') {
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = await this._replaceVarsInObj(obj[key], config, namespace);
        }
      }
      return newObj;
    }

    return obj;
  }

  public async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const protocol of this._registeredCommProtocols.values()) {
      if (typeof protocol.close === 'function') {
        closePromises.push(protocol.close());
      }
    }
    await Promise.all(closePromises);
    console.log('UTCP Client and all registered protocols closed.');
  }
}