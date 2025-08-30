// packages/core/src/plugins/plugin_registry.ts
import { z, ZodType, ZodObject, ZodRawShape } from 'zod';
import { CommunicationProtocol } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

type CallTemplateSchemaOption = ZodObject<{ call_template_type: z.ZodLiteral<string> } & ZodRawShape>;

class PluginRegistry {
  private _communicationProtocols: Map<string, CommunicationProtocol> = new Map();
  private _callTemplateSchemas: Map<string, CallTemplateSchemaOption> = new Map();

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
  /**
   * Retrieves a specific CallTemplate schema by its type.
   * @param type The call_template_type (e.g., 'http', 'text').
   * @returns The Zod schema for the specified type, or undefined if not found.
   */
  public getCallTemplateSchema(type: string): CallTemplateSchemaOption | undefined {
    return this._callTemplateSchemas.get(type);
  }

  /**
     * Returns a discriminated union schema for all currently registered CallTemplate types.
     * This is the key function for solving our validation problem.
     */
  public getCallTemplateUnionSchema(): z.ZodDiscriminatedUnion<"call_template_type", [CallTemplateSchemaOption, ...CallTemplateSchemaOption[]]> | z.ZodTypeAny {
    const schemas = Array.from(this._callTemplateSchemas.values());
    if (schemas.length === 0) {
      return CallTemplateBaseSchema;
    }
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    const unionOptions: [CallTemplateSchemaOption, ...CallTemplateSchemaOption[]] = [schemas[0]!, ...schemas.slice(1) as CallTemplateSchemaOption[]];

    return z.discriminatedUnion('call_template_type', unionOptions);
  }
}


export const pluginRegistry = new PluginRegistry();