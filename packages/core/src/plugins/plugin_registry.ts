// packages/core/src/plugins/plugin_registry.ts
import { z, ZodType } from 'zod';
import { CommunicationProtocol } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBaseSchema, CallTemplateBase } from '@utcp/core/data/call_template';

/**
 * Manages the registration of various UTCP components, such as
 * communication protocols and call template schemas.
 * This acts as a central registry for the plugin-based architecture.
 */
class PluginRegistry {
  private _communicationProtocols: Map<string, CommunicationProtocol> = new Map();
  private _callTemplateSchemas: Map<string, ZodType<CallTemplateBase, any, any>> = new Map();

  /**
   * Registers a CommunicationProtocol implementation.
   *
   * @param type The unique identifier for the communication protocol (e.g., 'http', 'cli').
   * @param protocolInstance An instance of the CommunicationProtocol implementation.
   * @param override If true, allows overwriting an existing registration.
   * @returns True if registration was successful, false if a protocol with the same type already exists and override is false.
   */
  public registerCommProtocol(type: string, protocolInstance: CommunicationProtocol, override: boolean = false): boolean {
    if (this._communicationProtocols.has(type) && !override) {
      console.warn(`Communication protocol '${type}' is already registered. Use 'override: true' to force overwrite.`);
      return false;
    }
    this._communicationProtocols.set(type, protocolInstance);
    console.log(`Registered communication protocol: '${type}'`);
    return true;
  }

  /**
   * Retrieves a registered CommunicationProtocol implementation.
   *
   * @param type The unique identifier for the communication protocol.
   * @returns The CommunicationProtocol instance, or undefined if not found.
   */
  public getCommProtocol(type: string): CommunicationProtocol | undefined {
    return this._communicationProtocols.get(type);
  }

  /**
   * Retrieves all registered CommunicationProtocol instances.
   * @returns A Map containing all registered CommunicationProtocols, keyed by their type.
   */
    public getAllCommProtocols(): Map<string, CommunicationProtocol> {
      return this._communicationProtocols;
    }

  /**
   * Registers a Zod schema for a specific CallTemplate type.
   * This allows the client to dynamically validate and parse call template configurations.
   *
   * @param type The unique identifier for the call template type (e.g., 'http', 'cli').
   * @param schema The Zod schema for that CallTemplate type.
   * @param override If true, allows overwriting an existing registration.
   * @returns True if registration was successful, false if a schema with the same type already exists and override is false.
   */
  public registerCallTemplateSchema(type: string, schema: ZodType<CallTemplateBase, any, any>, override: boolean = false): boolean {
    if (this._callTemplateSchemas.has(type) && !override) {
      console.warn(`CallTemplate schema for type '${type}' is already registered. Use 'override: true' to force overwrite.`);
      return false;
    }
    this._callTemplateSchemas.set(type, schema);
    console.log(`Registered CallTemplate schema: '${type}'`);
    return true;
  }

  /**
   * Retrieves a registered Zod schema for a specific CallTemplate type.
   *
   * @param type The unique identifier for the call template type.
   * @returns The Zod schema, or undefined if not found.
   */
  public getCallTemplateSchema(type: string): ZodType<CallTemplateBase, any, any> | undefined {
    return this._callTemplateSchemas.get(type);
  }

  /**
   * Returns a discriminated union schema for all currently registered CallTemplate types.
   * This is used by the UtcpClient to validate incoming CallTemplate configurations.
   * @returns A ZodUnion schema, or CallTemplateBaseSchema if no specific plugins are registered.
   */
  public getCallTemplateUnionSchema(): ZodType<CallTemplateBase> {
    const schemas = Array.from(this._callTemplateSchemas.values());
    if (schemas.length === 0) {
      console.warn("No specific CallTemplate schemas registered. Falling back to CallTemplateBaseSchema.");
      return CallTemplateBaseSchema; // Fallback if no specific plugins registered
    }

    // Zod's discriminatedUnion requires at least two schemas.
    // If only one, return it directly.
    if (schemas.length === 1) {
      return schemas[0];
    }
    
    // The trick for discriminatedUnion with dynamic arrays is often to ensure the array
    // is treated as a 'const' tuple of a specific type.
    // However, the schemas array elements are already typed as ZodType<CallTemplateBase, any, any>,
    // so a direct cast is usually sufficient if the types are structurally compatible.
    // The previous error implied a mismatch in the internal ZodType structure.

    // Let's ensure the schemas are explicitly seen as ZodTypes that output CallTemplateBase,
    // and then let Zod handle the discriminated union's internal typing.
    const schemasForUnion: Array<ZodType<CallTemplateBase, any, any>> = schemas;

    // We still need the `as const` or a similar tuple-assertion, but it's tricky with dynamic arrays.
    // The most robust way is to define a helper that ensures the type for discriminatedUnion.
    // For now, let's keep the explicit array assertion as the most direct path to fix the error.
    return z.discriminatedUnion(
      'call_template_type',
      // This cast asserts the shape that discriminatedUnion expects.
      // We are confident each schema *will* have 'call_template_type' literal.
      schemasForUnion as [ZodType<any, any, any>, ZodType<any, any, any>, ...ZodType<any, any, any>[]]
    ) as ZodType<CallTemplateBase>; // Final cast to ensure the return type is correct
  }

  /**
   * Temporarily sets (or replaces) a CommunicationProtocol implementation.
   * Useful for testing purposes to inject mock implementations.
   * @param type The unique identifier for the communication protocol.
   * @param protocolInstance The CommunicationProtocol instance to set.
   */
  public setCommProtocol(type: string, protocolInstance: CommunicationProtocol): void {
    this._communicationProtocols.set(type, protocolInstance);
    console.log(`[PluginRegistry] Temporarily set communication protocol: '${type}'`);
  }
}

/**
 * Singleton instance of the PluginRegistry.
 * Other parts of the SDK and plugins should import and use this instance.
 */
export const pluginRegistry = new PluginRegistry();