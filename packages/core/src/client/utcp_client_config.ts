// packages/core/src/client/utcp_client_config.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';
import { pluginRegistry } from '@utcp/core/plugins/plugin_registry'; // Import pluginRegistry

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

// --- Base Schemas for extensible components (still needed for default and fallback) ---

/**
 * Base schema for Tool Repository configurations.
 * Real implementations will extend this and register with the plugin registry.
 */
export const ToolRepositoryConfigBaseSchema = z.object({
  tool_repository_type: z.string().describe('The type of the tool repository (e.g., "in_memory").'),
}).passthrough(); // Allow extra fields for specific implementations
export type ToolRepositoryConfig = z.infer<typeof ToolRepositoryConfigBaseSchema>;


/**
 * Base schema for Tool Search Strategy configurations.
 * Real implementations will extend this and register with the plugin registry.
 */
export const ToolSearchStrategyConfigBaseSchema = z.object({
  tool_search_strategy_type: z.string().describe('The type of the tool search strategy (e.g., "tag_and_description_word_match").'),
}).passthrough(); // Allow extra fields for specific implementations
export type ToolSearchStrategyConfig = z.infer<typeof ToolSearchStrategyConfigBaseSchema>;


/**
 * Base schema for Tool Post-Processor configurations.
 * Real implementations will extend this and register with the plugin registry.
 */
export const ToolPostProcessorConfigBaseSchema = z.object({
  tool_post_processor_type: z.string().describe('The type of the tool post-processor (e.g., "filter_dict").'),
}).passthrough(); // Allow extra fields for specific implementations
export type ToolPostProcessorConfig = z.infer<typeof ToolPostProcessorConfigBaseSchema>;


/**
 * The main configuration schema for the UTCP client.
 * Provides comprehensive options for UTCP clients including
 * variable definitions, manual call templates, and variable loading mechanisms,
 * as well as configurable repository, search strategy, and post-processing.
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
   * Configuration for the tool repository.
   * Defaults to an in-memory repository.
   * Dynamically validated using registered plugin schemas.
   */
  tool_repository: z.lazy(() => pluginRegistry.getToolRepositoryConfigUnionSchema()).optional().default({
    tool_repository_type: 'in_memory'
  }),
  /**
   * Configuration for the tool search strategy.
   * Defaults to a tag and description-based search.
   * Dynamically validated using registered plugin schemas.
   */
  tool_search_strategy: z.lazy(() => pluginRegistry.getToolSearchStrategyConfigUnionSchema()).optional().default({
    tool_search_strategy_type: 'tag_and_description_word_match'
  }),
  /**
   * A list of tool post-processor configurations to be applied after a tool call.
   * Dynamically validated using registered plugin schemas.
   */
  post_processing: z.array(z.lazy(() => pluginRegistry.getToolPostProcessorConfigUnionSchema())).optional().default([]),
  /**
   * A list of manually defined call templates for registering tools.
   * These are directly embedded in the client's configuration.
   * Uses the union of all registered CallTemplate schemas from the plugin registry.
   */
  manual_call_templates: z.array(pluginRegistry.getCallTemplateUnionSchema()).optional().default([]),
});
export type UtcpClientConfig = z.infer<typeof UtcpClientConfigSchema>;