import { UtcpManual } from '@utcp/core/data/utcp_manual';
interface OpenApiConverterOptions {
    specUrl?: string;
    callTemplateName?: string;
}
/**
 * Converts an OpenAPI JSON/YAML specification into a UtcpManual.
 * Each operation in the OpenAPI spec becomes a UTCP tool.
 */
export declare class OpenApiConverter {
    private spec;
    private specUrl;
    private _convertedCallTemplateName;
    private placeholderCounter;
    /**
     * Creates a new OpenAPI converter instance.
     * @param openapi_spec The OpenAPI specification object.
     * @param options Optional settings, like the specUrl or a custom callTemplateName.
     */
    constructor(openapi_spec: Record<string, any>, options?: OpenApiConverterOptions);
    private _incrementPlaceholderCounter;
    private _getPlaceholder;
    /**
     * Parses the OpenAPI specification and returns a UtcpManual.
     * @returns A UTCP manual containing tools derived from the OpenAPI specification.
     */
    convert(): UtcpManual;
    /**
     * Resolves a local JSON reference within the OpenAPI spec.
     * @param ref The reference string (e.g., '#/components/schemas/Pet').
     * @returns The resolved schema object.
     */
    private _resolveRef;
    /**
     * Recursively resolves all $refs in a schema object, preventing infinite loops.
     * @param schema The schema object that may contain references.
     * @param visitedRefs A set of references already visited to detect cycles.
     * @returns The resolved schema with all references replaced by their actual values.
     */
    private _resolveSchema;
    /**
     * Creates a Tool object from an OpenAPI operation.
     * @param path The API path.
     * @param method The HTTP method (GET, POST, etc.).
     * @param operation The operation definition from OpenAPI.
     * @param baseUrl The base URL for the API.
     * @returns A Tool object or null if operationId is not defined.
     */
    private _createTool;
    /**
     * Extracts the input schema, header fields, and body field from an OpenAPI operation.
     * - Merges path-level and operation-level parameters.
     * - Resolves $ref for parameters.
     * - Supports OpenAPI 2.0 body parameters and 3.0 requestBody.
     * @param path The API path.
     * @param operation The OpenAPI operation object.
     * @returns An object containing the inputs schema, a list of header field names, and the body field name (if any).
     */
    private _extractInputs;
    /**
     * Extracts the output schema from an OpenAPI operation, resolving refs.
     * @param operation The OpenAPI operation object.
     * @returns The output schema.
     */
    private _extractOutputs;
    /**
     * Extracts authentication information from OpenAPI operation and global security schemes.
     * @param operation The OpenAPI operation object.
     * @returns An Auth object or undefined if no authentication is specified.
     */
    private _extractAuth;
    /**
     * Gets security schemes supporting both OpenAPI 2.0 and 3.0.
     * @returns A record of security schemes.
     */
    private _getSecuritySchemes;
    /**
     * Creates an Auth object from an OpenAPI security scheme.
     * @param scheme The security scheme object.
     * @returns An Auth object or undefined if the scheme is not supported.
     */
    private _createAuthFromScheme;
}
declare global {
    interface String {
        lstrip(chars: string): string;
    }
}
export {};
