// packages/core/src/client/utcp_client.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { parse as parseDotEnv } from 'dotenv';
import { CallTemplateBase, CallTemplateBaseSchema } from '@utcp/core/data/call_template';
import { Tool } from '@utcp/core/data/tool';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { ConcurrentToolRepository } from '@utcp/core/interfaces/concurrent_tool_repository';
import { ToolSearchStrategy } from '@utcp/core/interfaces/tool_search_strategy';
import { VariableSubstitutor } from '@utcp/core/interfaces/variable_substitutor';
import { ToolPostProcessor } from '@utcp/core/interfaces/tool_post_processor';
import {
  UtcpClientConfig,
  UtcpClientConfigSchema,
  ToolRepositoryConfig, // Import config types
  ToolSearchStrategyConfig,
  ToolPostProcessorConfig
} from '@utcp/core/client/utcp_client_config';
import { pluginRegistry } from '@utcp/core/plugins/plugin_registry';
import { DefaultVariableSubstitutor } from '@utcp/core/implementations/default_variable_substitutor';
import { ensureCorePluginsInitialized } from '@utcp/core/plugins/plugin_loader'; // Import the initialization function


export interface IUtcpClient {
  readonly config: UtcpClientConfig;
  readonly concurrentToolRepository: ConcurrentToolRepository;
  readonly variableSubstitutor: VariableSubstitutor;

  substituteCallTemplateVariables<T extends CallTemplateBase>(callTemplate: T, namespace?: string): Promise<T>;
}

/**
 * The main client for interacting with the Universal Tool Calling Protocol (UTCP).
 * Orchestrates tool discovery, registration, execution, and searching.
 */
export class UtcpClient implements IUtcpClient {
  private _registeredCommProtocols: Map<string, CommunicationProtocol> = new Map();
  public readonly postProcessors: ToolPostProcessor[];

  private constructor(
    public readonly config: UtcpClientConfig,
    public readonly concurrentToolRepository: ConcurrentToolRepository,
    public readonly searchStrategy: ToolSearchStrategy,
    public readonly variableSubstitutor: VariableSubstitutor,
    private readonly _rootPath: string = process.cwd(),
  ) {
    // Dynamically populate registered protocols from the global registry
    for (const [type, protocol] of pluginRegistry.getAllCommProtocols()) {
      this._registeredCommProtocols.set(type, protocol);
    }
    // Instantiate post-processors dynamically based on registered factories
    this.postProcessors = config.post_processing.map(ppConfig => {
      const factory = pluginRegistry.getToolPostProcessorFactory(ppConfig.tool_post_processor_type);
      if (!factory) {
        throw new Error(`No factory registered for post-processor type: '${ppConfig.tool_post_processor_type}'`);
      }
      return factory(ppConfig);
    });
  }

  /**
   * Creates and initializes a new instance of the UtcpClient.
   * @param config A configuration object, a dictionary, or a file path to a JSON configuration file.
   * @param root_dir The root directory for resolving relative paths (like .env files). Defaults to the current working directory.
   * @returns A promise that resolves to a fully initialized UtcpClient instance.
   */
  public static async create(
    config: Partial<UtcpClientConfig> | string = {},
    root_dir: string = process.cwd()
  ): Promise<UtcpClient> {
    // Ensure core plugins are initialized before parsing config
    ensureCorePluginsInitialized();

    let loadedConfig: Partial<UtcpClientConfig>;
    if (typeof config === 'string') {
        const configPath = path.resolve(root_dir, config);
        const configFileContent = await fs.readFile(configPath, 'utf-8');
        loadedConfig = JSON.parse(configFileContent);
    } else {
        loadedConfig = config;
    }

    const validatedConfig = UtcpClientConfigSchema.parse(loadedConfig);

    // Dynamically instantiate ConcurrentToolRepository
    const repoFactory = pluginRegistry.getToolRepositoryFactory(validatedConfig.tool_repository.tool_repository_type);
    if (!repoFactory) {
        throw new Error(`No factory registered for tool repository type: '${validatedConfig.tool_repository.tool_repository_type}'`);
    }
    const concurrentToolRepository = repoFactory(validatedConfig.tool_repository);

    // Dynamically instantiate ToolSearchStrategy
    const searchStrategyFactory = pluginRegistry.getToolSearchStrategyFactory(validatedConfig.tool_search_strategy.tool_search_strategy_type);
    if (!searchStrategyFactory) {
        throw new Error(`No factory registered for tool search strategy type: '${validatedConfig.tool_search_strategy.tool_search_strategy_type}'`);
    }
    const searchStrategy = searchStrategyFactory(validatedConfig.tool_search_strategy);

    const variableSubstitutor = new DefaultVariableSubstitutor(root_dir);

    const client = new UtcpClient(
      validatedConfig,
      concurrentToolRepository,
      searchStrategy,
      variableSubstitutor,
      root_dir
    );

    // NOTE: For variable loaders, they are processed directly by `DefaultVariableSubstitutor`
    // within its `_getVariable` method, using the schemas. So a dynamic factory system for
    // VariableLoaders is not strictly necessary as it's already integrated.

    // Substitute variables in the initial config's 'variables' field itself
    // We create a temporary config without its own variables to prevent circular dependency during substitution.
    const tempConfigWithoutOwnVars: UtcpClientConfig = { ...client.config, variables: {} };
    client.config.variables = await client.variableSubstitutor.substitute(client.config.variables, tempConfigWithoutOwnVars);

    // Register initial manuals specified in the config
    await client.registerManuals(client.config.manual_call_templates || []);

    return client;
  }

  /**
   * Registers a single tool manual.
   * @param manualCallTemplate The call template describing how to discover and connect to the manual.
   * @returns A promise that resolves to a result object indicating success or failure.
   */
  public async registerManual(manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    if (!manualCallTemplate.name) {
      manualCallTemplate.name = crypto.randomUUID();
    }
    manualCallTemplate.name = manualCallTemplate.name.replace(/[^\w]/g, '_');

    if (await this.concurrentToolRepository.getManual(manualCallTemplate.name)) {
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
      await this.concurrentToolRepository.saveManual(processedCallTemplate, result.manual);
      console.log(`Successfully registered manual '${manualCallTemplate.name}' with ${result.manual.tools.length} tools.`);
    } else {
      console.error(`Error registering manual '${manualCallTemplate.name}': ${result.errors.join(', ')}`);
    }

    return result;
  }

  /**
   * Registers a list of tool manuals in parallel.
   * @param manualCallTemplates An array of call templates to register.
   * @returns A promise that resolves to an array of registration results.
   */
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

  /**
   * Deregisters a tool manual and all of its associated tools.
   * @param manualName The name of the manual to deregister.
   * @returns A promise that resolves to true if the manual was found and removed, otherwise false.
   */
  public async deregisterManual(manualName: string): Promise<boolean> {
    const manualCallTemplate = await this.concurrentToolRepository.getManualCallTemplate(manualName);
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

    const removed = await this.concurrentToolRepository.removeManual(manualName);
    if (removed) {
      console.log(`Successfully deregistered manual '${manualName}' from repository.`);
    } else {
      console.warn(`Manual '${manualName}' was not found in the repository during deregistration.`);
    }
    return removed;
  }

  /**
   * Calls a registered tool by its full namespaced name.
   * @param toolName The full name of the tool (e.g., 'my_manual.my_tool').
   * @param toolArgs A JSON object of arguments for the tool call.
   * @returns A promise that resolves to the result of the tool call, with post-processing applied.
   */
  public async callTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
    const manualName = toolName.split('.')[0];
    if (!manualName) {
      throw new Error(`Invalid tool name format for '${toolName}'. Expected 'manual_name.tool_name'.`);
    }

    const tool = await this.concurrentToolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in the repository.`);
    }
    const manualCallTemplate = await this.concurrentToolRepository.getManualCallTemplate(manualName);
    if (!manualCallTemplate) {
        throw new Error(`Could not find manual call template for manual '${manualName}'.`);
    }

    const processedToolCallTemplate = await this.substituteCallTemplateVariables(tool.tool_call_template, manualName);

    const protocol = this._registeredCommProtocols.get(processedToolCallTemplate.call_template_type);
    if (!protocol) {
      throw new Error(`No communication protocol registered for type: '${processedToolCallTemplate.call_template_type}'.`);
    }

    console.log(`Calling tool '${toolName}' via protocol '${processedToolCallTemplate.call_template_type}'.`);
    let result = await protocol.callTool(this, toolName, toolArgs, processedToolCallTemplate);
    
    // Apply post-processors
    for (const processor of this.postProcessors) {
        result = processor.postProcess(this, tool, manualCallTemplate, result);
    }
    
    return result;
  }

  /**
   * Calls a registered tool and streams the results.
   * @param toolName The full name of the tool (e.g., 'my_manual.my_tool').
   * @param toolArgs A JSON object of arguments for the tool call.
   * @returns An async generator that yields chunks of the tool's response, with post-processing applied to each chunk.
   */
  public async *callToolStreaming(toolName: string, toolArgs: Record<string, any>): AsyncGenerator<any, void, unknown> {
    const manualName = toolName.split('.')[0];
    if (!manualName) {
      throw new Error(`Invalid tool name format for '${toolName}'. Expected 'manual_name.tool_name'.`);
    }

    const tool = await this.concurrentToolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in the repository.`);
    }
    const manualCallTemplate = await this.concurrentToolRepository.getManualCallTemplate(manualName);
    if (!manualCallTemplate) {
        throw new Error(`Could not find manual call template for manual '${manualName}'.`);
    }

    const processedToolCallTemplate = await this.substituteCallTemplateVariables(tool.tool_call_template, manualName);

    const protocol = this._registeredCommProtocols.get(processedToolCallTemplate.call_template_type);
    if (!protocol) {
      throw new Error(`No communication protocol registered for type: '${processedToolCallTemplate.call_template_type}'.`);
    }

    console.log(`Calling tool '${toolName}' streamingly via protocol '${processedToolCallTemplate.call_template_type}'.`);
    for await (let chunk of protocol.callToolStreaming(this, toolName, toolArgs, processedToolCallTemplate)) {
      // Apply post-processors to each chunk
      for (const processor of this.postProcessors) {
        chunk = processor.postProcess(this, tool, manualCallTemplate, chunk);
      }
      yield chunk;
    }
  }

  /**
   * Searches for relevant tools based on a task description.
   * @param query A natural language description of the task.
   * @param limit The maximum number of tools to return.
   * @param anyOfTagsRequired An optional list of tags, where at least one must be present on a tool for it to be included.
   * @returns A promise that resolves to a list of relevant `Tool` objects.
   */
  public async searchTools(query: string, limit?: number, anyOfTagsRequired?: string[]): Promise<Tool[]> {
    console.log(`Searching for tools with query: '${query}'`);
    return this.searchStrategy.searchTools(this.concurrentToolRepository, query, limit, anyOfTagsRequired);
  }

  /**
   * Substitutes variables in a given call template.
   * @param callTemplate The call template to process.
   * @param namespace An optional namespace for variable lookup.
   * @returns A new call template instance with all variables substituted.
   */
  public async substituteCallTemplateVariables<T extends CallTemplateBase>(callTemplate: T, namespace?: string): Promise<T> {
    const unionSchema = pluginRegistry.getCallTemplateUnionSchema();
    
    // Use the variable substitutor to handle the replacement logic
    const rawSubstituted = await this.variableSubstitutor.substitute(callTemplate, this.config, namespace);

    const result = unionSchema.safeParse(rawSubstituted);

    if (!result.success) {
      console.error(`Zod validation failed for call template '${callTemplate.name}' after variable substitution. Falling back to base schema.`, result.error.issues);
      return CallTemplateBaseSchema.parse(rawSubstituted) as T;
    }

    return result.data as T;
  }

  /**
   * Loads variables from sources defined in the client configuration.
   */
  private async loadVariables(): Promise<void> {
    for (const varLoader of this.config.load_variables_from || []) {
        // Here, we directly use the `UtcpDotEnvLoaderSchema` for parsing, as `DefaultVariableSubstitutor`
        // is designed to handle the variable loading logic based on this structure.
        // If other VariableLoader types were added and needed factories, they would be handled here
        // or delegated to the `variableSubstitutor` in a more complex way.
        const parsedLoader = varLoader; // Already validated by UtcpClientConfigSchema.parse
        if (parsedLoader.variable_loader_type === 'dotenv') {
            try {
                const envFilePath = path.resolve(this._rootPath, parsedLoader.env_file_path);
                const envContent = await fs.readFile(envFilePath, 'utf-8');
                const envVars = parseDotEnv(envContent);
                // Merge loaded variables, giving precedence to existing config.variables
                this.config.variables = { ...envVars, ...this.config.variables };
                console.log(`Loaded variables from .env file: ${envFilePath}`);
            } catch (e: any) {
                console.warn(`Could not load .env file from '${parsedLoader.env_file_path}': ${e.message}`);
            }
        }
    }
  }

  /**
   * Closes the UTCP client and releases any resources held by its communication protocols.
   */
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