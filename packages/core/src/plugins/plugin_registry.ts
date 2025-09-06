// packages/core/src/plugins/plugin_registry.ts
import { z, ZodType, ZodObject, ZodRawShape } from 'zod';
import { CommunicationProtocol } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';
import { ConcurrentToolRepository } from '@utcp/core/interfaces/concurrent_tool_repository';
import { ToolSearchStrategy } from '@utcp/core/interfaces/tool_search_strategy';
import { ToolPostProcessor } from '@utcp/core/interfaces/tool_post_processor';
// Import base schemas for configuration (already defined in utcp_client_config)
import {
  ToolRepositoryConfigBaseSchema,
  ToolSearchStrategyConfigBaseSchema,
  ToolPostProcessorConfigBaseSchema
} from '@utcp/core/client/utcp_client_config';


type CallTemplateSchemaOption = ZodObject<{ call_template_type: z.ZodLiteral<string> } & ZodRawShape>;

// Define factory types for better type safety (using 'any' for config for now, will refine with Zod schemas)
type ToolRepositoryFactory = (config: any) => ConcurrentToolRepository;
type ToolSearchStrategyFactory = (config: any) => ToolSearchStrategy;
type ToolPostProcessorFactory = (config: any) => ToolPostProcessor;

// Define config schema option types
type ToolRepositoryConfigSchemaOption = ZodObject<{ tool_repository_type: z.ZodLiteral<string> } & ZodRawShape>;
type ToolSearchStrategyConfigSchemaOption = ZodObject<{ tool_search_strategy_type: z.ZodLiteral<string> } & ZodRawShape>;
type ToolPostProcessorConfigSchemaOption = ZodObject<{ tool_post_processor_type: z.ZodLiteral<string> } & ZodRawShape>;


class PluginRegistry {
  private _communicationProtocols: Map<string, CommunicationProtocol> = new Map();
  private _callTemplateSchemas: Map<string, CallTemplateSchemaOption> = new Map();

  // Maps for factories
  private _toolRepositoryFactories: Map<string, ToolRepositoryFactory> = new Map();
  private _toolSearchStrategyFactories: Map<string, ToolSearchStrategyFactory> = new Map();
  private _toolPostProcessorFactories: Map<string, ToolPostProcessorFactory> = new Map();

  // NEW: Maps for configuration schemas
  private _toolRepositoryConfigSchemas: Map<string, ToolRepositoryConfigSchemaOption> = new Map();
  private _toolSearchStrategyConfigSchemas: Map<string, ToolSearchStrategyConfigSchemaOption> = new Map();
  private _toolPostProcessorConfigSchemas: Map<string, ToolPostProcessorConfigSchemaOption> = new Map();


  // --- Communication Protocol Registrations ---
  public registerCommProtocol(type: string, protocolInstance: CommunicationProtocol, override: boolean = false): boolean {
    if (this._communicationProtocols.has(type) && !override) {
      console.warn(`Communication protocol '${type}' is already registered.`);
      return false;
    }
    this._communicationProtocols.set(type, protocolInstance);
    return true;
  }

  public getCommProtocol(type: string): CommunicationProtocol | undefined {
    return this._communicationProtocols.get(type);
  }

  public getAllCommProtocols(): Map<string, CommunicationProtocol> {
    return this._communicationProtocols;
  }

  // --- Call Template Schema Registrations ---
  public registerCallTemplateSchema(type: string, schema: ZodType<any>, override: boolean = false): boolean {
    if (schema instanceof ZodObject && schema.shape.call_template_type instanceof z.ZodLiteral) {
      if (this._callTemplateSchemas.has(type) && !override) {
        console.warn(`CallTemplate schema for type '${type}' is already registered.`);
        return false;
      }
      this._callTemplateSchemas.set(type, schema as CallTemplateSchemaOption);
      return true;
    }
    console.error(`Cannot register CallTemplate schema for type '${type}'. It must be a ZodObject with a literal 'call_template_type'.`);
    return false;
  }
  
  public getCallTemplateSchema(type: string): CallTemplateSchemaOption | undefined {
    return this._callTemplateSchemas.get(type);
  }

  public getCallTemplateUnionSchema(): z.ZodDiscriminatedUnion<"call_template_type", [CallTemplateSchemaOption, ...CallTemplateSchemaOption[]]> | z.ZodTypeAny {
    const schemas = Array.from(this._callTemplateSchemas.values());
    if (schemas.length === 0) {
      return CallTemplateBaseSchema; // Fallback to base if no plugins are registered
    }
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    const unionOptions: [CallTemplateSchemaOption, ...CallTemplateSchemaOption[]] = [schemas[0]!, ...schemas.slice(1) as CallTemplateSchemaOption[]];

    return z.discriminatedUnion('call_template_type', unionOptions);
  }


  // --- Tool Repository Factory Registrations ---
  public registerToolRepositoryFactory(type: string, factory: ToolRepositoryFactory, override: boolean = false): boolean {
    if (this._toolRepositoryFactories.has(type) && !override) {
      console.warn(`Tool repository factory for type '${type}' is already registered.`);
      return false;
    }
    this._toolRepositoryFactories.set(type, factory);
    return true;
  }

  public getToolRepositoryFactory(type: string): ToolRepositoryFactory | undefined {
    return this._toolRepositoryFactories.get(type);
  }

  // NEW: Tool Repository Config Schema Registrations
  public registerToolRepositoryConfigSchema(type: string, schema: ZodType<any>, override: boolean = false): boolean {
    if (schema instanceof ZodObject && schema.shape.tool_repository_type instanceof z.ZodLiteral) {
      if (this._toolRepositoryConfigSchemas.has(type) && !override) {
        console.warn(`Tool repository config schema for type '${type}' is already registered.`);
        return false;
      }
      this._toolRepositoryConfigSchemas.set(type, schema as ToolRepositoryConfigSchemaOption);
      return true;
    }
    console.error(`Cannot register ToolRepositoryConfig schema for type '${type}'. It must be a ZodObject with a literal 'tool_repository_type'.`);
    return false;
  }

  public getToolRepositoryConfigUnionSchema(): z.ZodDiscriminatedUnion<"tool_repository_type", [ToolRepositoryConfigSchemaOption, ...ToolRepositoryConfigSchemaOption[]]> | z.ZodTypeAny {
    const schemas = Array.from(this._toolRepositoryConfigSchemas.values());
    if (schemas.length === 0) {
      return ToolRepositoryConfigBaseSchema;
    }
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    const unionOptions: [ToolRepositoryConfigSchemaOption, ...ToolRepositoryConfigSchemaOption[]] = [schemas[0]!, ...schemas.slice(1) as ToolRepositoryConfigSchemaOption[]];
    return z.discriminatedUnion('tool_repository_type', unionOptions);
  }


  // --- Tool Search Strategy Factory Registrations ---
  public registerToolSearchStrategyFactory(type: string, factory: ToolSearchStrategyFactory, override: boolean = false): boolean {
    if (this._toolSearchStrategyFactories.has(type) && !override) {
      console.warn(`Tool search strategy factory for type '${type}' is already registered.`);
      return false;
    }
    this._toolSearchStrategyFactories.set(type, factory);
    return true;
  }

  public getToolSearchStrategyFactory(type: string): ToolSearchStrategyFactory | undefined {
    return this._toolSearchStrategyFactories.get(type);
  }

  // NEW: Tool Search Strategy Config Schema Registrations
  public registerToolSearchStrategyConfigSchema(type: string, schema: ZodType<any>, override: boolean = false): boolean {
    if (schema instanceof ZodObject && schema.shape.tool_search_strategy_type instanceof z.ZodLiteral) {
      if (this._toolSearchStrategyConfigSchemas.has(type) && !override) {
        console.warn(`Tool search strategy config schema for type '${type}' is already registered.`);
        return false;
      }
      this._toolSearchStrategyConfigSchemas.set(type, schema as ToolSearchStrategyConfigSchemaOption);
      return true;
    }
    console.error(`Cannot register ToolSearchStrategyConfig schema for type '${type}'. It must be a ZodObject with a literal 'tool_search_strategy_type'.`);
    return false;
  }

  public getToolSearchStrategyConfigUnionSchema(): z.ZodDiscriminatedUnion<"tool_search_strategy_type", [ToolSearchStrategyConfigSchemaOption, ...ToolSearchStrategyConfigSchemaOption[]]> | z.ZodTypeAny {
    const schemas = Array.from(this._toolSearchStrategyConfigSchemas.values());
    if (schemas.length === 0) {
      return ToolSearchStrategyConfigBaseSchema;
    }
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    const unionOptions: [ToolSearchStrategyConfigSchemaOption, ...ToolSearchStrategyConfigSchemaOption[]] = [schemas[0]!, ...schemas.slice(1) as ToolSearchStrategyConfigSchemaOption[]];
    return z.discriminatedUnion('tool_search_strategy_type', unionOptions);
  }


  // --- Tool Post-Processor Factory Registrations ---
  public registerToolPostProcessorFactory(type: string, factory: ToolPostProcessorFactory, override: boolean = false): boolean {
    if (this._toolPostProcessorFactories.has(type) && !override) {
      console.warn(`Tool post-processor factory for type '${type}' is already registered.`);
      return false;
    }
    this._toolPostProcessorFactories.set(type, factory);
    return true;
  }

  public getToolPostProcessorFactory(type: string): ToolPostProcessorFactory | undefined {
    return this._toolPostProcessorFactories.get(type);
  }

  // NEW: Tool Post-Processor Config Schema Registrations
  public registerToolPostProcessorConfigSchema(type: string, schema: ZodType<any>, override: boolean = false): boolean {
    if (schema instanceof ZodObject && schema.shape.tool_post_processor_type instanceof z.ZodLiteral) {
      if (this._toolPostProcessorConfigSchemas.has(type) && !override) {
        console.warn(`Tool post-processor config schema for type '${type}' is already registered.`);
        return false;
      }
      this._toolPostProcessorConfigSchemas.set(type, schema as ToolPostProcessorConfigSchemaOption);
      return true;
    }
    console.error(`Cannot register ToolPostProcessorConfig schema for type '${type}'. It must be a ZodObject with a literal 'tool_post_processor_type'.`);
    return false;
  }

  public getToolPostProcessorConfigUnionSchema(): z.ZodDiscriminatedUnion<"tool_post_processor_type", [ToolPostProcessorConfigSchemaOption, ...ToolPostProcessorConfigSchemaOption[]]> | z.ZodTypeAny {
    const schemas = Array.from(this._toolPostProcessorConfigSchemas.values());
    if (schemas.length === 0) {
      return ToolPostProcessorConfigBaseSchema;
    }
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    const unionOptions: [ToolPostProcessorConfigSchemaOption, ...ToolPostProcessorConfigSchemaOption[]] = [schemas[0]!, ...schemas.slice(1) as ToolPostProcessorConfigSchemaOption[]];
    return z.discriminatedUnion('tool_post_processor_type', unionOptions);
  }
}


export const pluginRegistry = new PluginRegistry();