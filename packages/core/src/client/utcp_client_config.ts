// packages/core/src/client/utcp_client_config.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

/**
 * Custom error for when a variable referenced in a provider configuration is not found.
 */
export class UtcpVariableNotFoundError extends Error {
  public variableName: string;

  constructor(variableName: string) {
    super(
      `Variable '${variableName}' referenced in call template configuration not found. ` +
      `Please ensure it's defined in client.config.variables, environment variables, or a configured variable loader.`
    );
    this.variableName = variableName;
    this.name = 'UtcpVariableNotFoundError';
  }
}

export const UtcpDotEnvLoaderSchema = z.object({
  variable_loader_type: z.literal('dotenv'),
  env_file_path: z.string().describe('Path to the .env file to load variables from.'),
});
export type UtcpDotEnvLoader = z.infer<typeof UtcpDotEnvLoaderSchema>;

/**
 * A discriminated union of all supported variable loader types.
 * This allows for loading variables from different external sources.
 */
export const VariableLoaderSchema = z.discriminatedUnion('variable_loader_type', [
  UtcpDotEnvLoaderSchema,
]);
export type VariableLoader = z.infer<typeof VariableLoaderSchema>;


/**
 * The main configuration schema for the UTCP client.
 * Provides comprehensive options for UTCP clients including
 * variable definitions, manual call templates, and variable loading mechanisms.
 */
export const UtcpClientConfigSchema = z.object({
  /**
   * A dictionary of directly-defined variables for substitution.
   * These take highest precedence.
   */
  variables: z.record(z.string(), z.string()).optional().default({}),
  /**
   * A list of variable loader configurations for loading variables from external
   * sources like .env files. Loaders are processed in order.
   */
  load_variables_from: z.array(VariableLoaderSchema).optional().default([]),
  /**
   * A list of manually defined call templates for registering tools.
   * These are directly embedded in the client's configuration.
   */
  manual_call_templates: z.array(CallTemplateBaseSchema).optional().default([]),
  // Future fields like toolRepositoryConfig, toolSearchStrategyConfig, postProcessingConfig
  // will be added here once their interfaces/implementations are defined.
});
export type UtcpClientConfig = z.infer<typeof UtcpClientConfigSchema>;