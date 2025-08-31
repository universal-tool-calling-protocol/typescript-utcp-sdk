// packages/http/src/openapi_converter.ts
import { Tool, JsonSchemaZodSchema, JsonSchema } from '@utcp/core/data/tool';
import { UtcpManual, UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { Auth, ApiKeyAuthSchema, BasicAuthSchema, OAuth2AuthSchema } from '@utcp/core/data/auth';
import { HttpCallTemplateSchema } from '@utcp/http/http_call_template';

interface OpenApiConverterOptions {
  specUrl?: string;
  callTemplateName?: string;
}

/**
 * Converts an OpenAPI JSON/YAML specification into a UtcpManual.
 * Each operation in the OpenAPI spec becomes a UTCP tool.
 */
export class OpenApiConverter {
  private spec: Record<string, any>;
  private specUrl: string | undefined;
  private _convertedCallTemplateName: string;
  private placeholderCounter: number = 0;

  /**
   * Creates a new OpenAPI converter instance.
   * @param openapi_spec The OpenAPI specification object.
   * @param options Optional settings, like the specUrl or a custom callTemplateName.
   */
  constructor(openapi_spec: Record<string, any>, options?: OpenApiConverterOptions) {
    this.spec = openapi_spec;
    this.specUrl = options?.specUrl;

    if (!options?.callTemplateName) {
      const title = openapi_spec.info?.title || 'openapi_call_template';
      const invalidCharsRegex = /[^a-zA-Z0-9_]/g;
      this._convertedCallTemplateName = title.replace(invalidCharsRegex, '_');
    } else {
      this._convertedCallTemplateName = options.callTemplateName.replace(/[^\w]/g, '_');
    }
  }

  private _incrementPlaceholderCounter(): number {
    this.placeholderCounter++;
    return this.placeholderCounter;
  }

  private _getPlaceholder(baseName: string): string {
    return `\$\{${this._convertedCallTemplateName.toUpperCase()}__${baseName.toUpperCase()}_${this._incrementPlaceholderCounter()}\}`;
  }

  /**
   * Parses the OpenAPI specification and returns a UtcpManual.
   * @returns A UTCP manual containing tools derived from the OpenAPI specification.
   */
  public convert(): UtcpManual {
    this.placeholderCounter = 0;
    const tools: Tool[] = [];
    let baseUrl = '/';

    const servers = this.spec.servers;
    if (servers && Array.isArray(servers) && servers.length > 0 && servers[0].url) {
      baseUrl = servers[0].url;
    } else if (this.specUrl) {
      try {
        const parsedUrl = new URL(this.specUrl);
        baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      } catch (e) {
        console.error(`[OpenApiConverter] Invalid specUrl provided: ${this.specUrl}`);
      }
    } else {
      console.warn("[OpenApiConverter] No server info or spec URL provided. Using fallback base URL: '/'");
    }

    const paths = this.spec.paths || {};
    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem as Record<string, any>)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          const tool = this._createTool(path, method, operation, baseUrl);
          if (tool) {
            tools.push(tool);
          }
        }
      }
    }

    return UtcpManualSchema.parse({ tools });
  }

  /**
   * Resolves a local JSON reference within the OpenAPI spec.
   * @param ref The reference string (e.g., '#/components/schemas/Pet').
   * @returns The resolved schema object.
   */
  private _resolveRef(ref: string): Record<string, any> {
    if (!ref.startsWith('#/')) {
      // External or non-local references are not fully supported by this simple resolver.
      // For a robust implementation, external fetches would be needed.
      return { $ref: ref }; // Return the ref itself to indicate it's unresolved
    }

    const parts = ref.substring(2).split('/');
    let node: any = this.spec;

    for (const part of parts) {
      // Decode URI components in case the part contains slashes or other special characters
      const decodedPart = decodeURIComponent(part);
      if (node[decodedPart] === undefined) {
        // Reference not found, return the ref to prevent crashing
        return { $ref: ref };
      }
      node = node[decodedPart];
    }

    return node;
  }

  /**
   * Recursively resolves all $refs in a schema object, preventing infinite loops.
   * @param schema The schema object that may contain references.
   * @param visitedRefs A set of references already visited to detect cycles.
   * @returns The resolved schema with all references replaced by their actual values.
   */
  private _resolveSchema(schema: any, visitedRefs: Set<string> = new Set()): any {
    if (schema === null || typeof schema !== 'object') {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this._resolveSchema(item, visitedRefs));
    }

    if ('$ref' in schema && typeof schema.$ref === 'string') {
      const ref = schema.$ref;
      if (visitedRefs.has(ref)) {
        // Cycle detected, return the reference itself to break the loop
        return { $ref: ref };
      }
      visitedRefs.add(ref);
      const resolvedRef = this._resolveRef(ref);
      // Recursively resolve the content of the resolved reference
      return this._resolveSchema(resolvedRef, visitedRefs);
    }

    const newSchema: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema)) {
      newSchema[key] = this._resolveSchema(value, visitedRefs);
    }

    return newSchema;
  }

  /**
   * Creates a Tool object from an OpenAPI operation.
   * @param path The API path.
   * @param method The HTTP method (GET, POST, etc.).
   * @param operation The operation definition from OpenAPI.
   * @param baseUrl The base URL for the API.
   * @returns A Tool object or null if operationId is not defined.
   */
  private _createTool(
    path: string,
    method: string,
    operation: Record<string, any>,
    baseUrl: string
  ): Tool | null {
    const operationId = operation.operationId;
    if (!operationId) {
      return null;
    }

    const description = operation.summary || operation.description || '';
    const tags = operation.tags || [];

    const { inputs, headerFields, bodyField } = this._extractInputs(path, operation);
    const outputs = this._extractOutputs(operation);
    const auth = this._extractAuth(operation);
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${path.lstrip('/')}`;

    const callTemplate = HttpCallTemplateSchema.parse({
      name: this._convertedCallTemplateName,
      call_template_type: 'http',
      http_method: method.toUpperCase(),
      url: fullUrl,
      body_field: bodyField ?? undefined,
      header_fields: headerFields.length > 0 ? headerFields : undefined,
      auth
    });

    return {
      name: operationId,
      description,
      inputs: JsonSchemaZodSchema.parse(inputs),
      outputs: JsonSchemaZodSchema.parse(outputs),
      tags,
      tool_call_template: callTemplate
    };
  }

  /**
   * Extracts the input schema, header fields, and body field from an OpenAPI operation.
   * - Merges path-level and operation-level parameters.
   * - Resolves $ref for parameters.
   * - Supports OpenAPI 2.0 body parameters and 3.0 requestBody.
   * @param path The API path.
   * @param operation The OpenAPI operation object.
   * @returns An object containing the inputs schema, a list of header field names, and the body field name (if any).
   */
  private _extractInputs(path: string, operation: Record<string, any>): { inputs: JsonSchema; headerFields: string[]; bodyField: string | null } {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const headerFields: string[] = [];
    let bodyField: string | null = null;

    // Merge path-level and operation-level parameters
    const pathItem = this.spec.paths?.[path] || {};
    const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];

    for (const param of allParams) {
      const resolvedParam = this._resolveSchema(param);
      const paramName = resolvedParam.name;
      if (!paramName) continue;

      if (resolvedParam.in === 'header') {
        headerFields.push(paramName);
      }

      // OpenAPI 2.0 body parameter (deprecated in 3.0, but still possible)
      if (resolvedParam.in === 'body') {
        bodyField = 'body';
        const jsonSchema = this._resolveSchema(resolvedParam.schema || {});
        properties[bodyField] = {
          description: resolvedParam.description || 'Request body',
          ...jsonSchema,
        };
        if (resolvedParam.required) {
          required.push(bodyField);
        }
        continue;
      }

      // Other parameters (query, path, header, cookie)
      const schema = this._resolveSchema(resolvedParam.schema || {});
      // For OpenAPI 2.0, non-body parameters might have type/items directly on the parameter object
      if (!schema.type && resolvedParam.type) schema.type = resolvedParam.type;
      if (!schema.items && resolvedParam.items) schema.items = resolvedParam.items;
      if (!schema.enum && resolvedParam.enum) schema.enum = resolvedParam.enum;


      properties[paramName] = {
        description: resolvedParam.description || '',
        ...schema,
      };
      if (resolvedParam.required) {
        required.push(paramName);
      }
    }

    // Handle request body (OpenAPI 3.0 equivalent of 'body' parameter)
    const requestBody = operation.requestBody;
    if (requestBody) {
      const resolvedBody = this._resolveSchema(requestBody);
      const content = resolvedBody.content || {};
      const jsonSchema = content['application/json']?.schema || content['application/x-www-form-urlencoded']?.schema;

      if (jsonSchema) {
        bodyField = 'body';
        properties[bodyField] = {
          description: resolvedBody.description || 'Request body',
          ...this._resolveSchema(jsonSchema),
        };
        if (resolvedBody.required) {
          required.push(bodyField);
        }
      }
    }

    const inputs: JsonSchema = {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };

    return { inputs, headerFields, bodyField };
  }

  /**
   * Extracts the output schema from an OpenAPI operation, resolving refs.
   * @param operation The OpenAPI operation object.
   * @returns The output schema.
   */
  private _extractOutputs(operation: Record<string, any>): JsonSchema {
    const responses = operation.responses || {};
    // Prioritize 200/201 responses, then fall back to 'default'
    const successResponse = responses['200'] || responses['201'] || responses['default'];

    if (!successResponse) {
      return {};
    }

    const resolvedResponse = this._resolveSchema(successResponse);
    let jsonSchema: any = null;

    if ('content' in resolvedResponse) { // OpenAPI 3.0
      const content = resolvedResponse.content || {};
      jsonSchema = content['application/json']?.schema || content['text/plain']?.schema;
      if (!jsonSchema && Object.keys(content).length > 0) {
        // Fallback to first content type's schema, with a type guard
        const firstContentTypeValue = Object.values(content)[0];
        if (typeof firstContentTypeValue === 'object' && firstContentTypeValue !== null && 'schema' in firstContentTypeValue) {
          jsonSchema = (firstContentTypeValue as { schema: any }).schema;
        }
      }
    } else if ('schema' in resolvedResponse) { // OpenAPI 2.0
      jsonSchema = resolvedResponse.schema;
    }

    if (!jsonSchema) {
      return {};
    }

    const resolvedJsonSchema = this._resolveSchema(jsonSchema);
    const schemaArgs: JsonSchema = {
      type: resolvedJsonSchema.type || 'object',
      properties: resolvedJsonSchema.properties || undefined,
      required: resolvedJsonSchema.required || undefined,
      description: resolvedJsonSchema.description || undefined,
      title: resolvedJsonSchema.title || undefined,
      items: resolvedJsonSchema.items || undefined,
      enum: resolvedJsonSchema.enum || undefined,
      minimum: resolvedJsonSchema.minimum || undefined,
      maximum: resolvedJsonSchema.maximum || undefined,
      format: resolvedJsonSchema.format || undefined,
    };

    return schemaArgs;
  }

  /**
   * Extracts authentication information from OpenAPI operation and global security schemes.
   * @param operation The OpenAPI operation object.
   * @returns An Auth object or undefined if no authentication is specified.
   */
  private _extractAuth(operation: Record<string, any>): Auth | undefined {
    // First check for operation-level security requirements
    let securityRequirements = operation.security || [];
    // If no operation-level security, check global security requirements
    if (!securityRequirements.length) {
      securityRequirements = this.spec.security || [];
    }
    // If no security requirements, return undefined
    if (!securityRequirements.length) {
      return undefined;
    }
    // Get security schemes - support both OpenAPI 2.0 and 3.0
    const securitySchemes = this._getSecuritySchemes();
    // Process the first security requirement (most common case).
    // Each security requirement is a dictionary with scheme name as key.
    for (const securityReq of securityRequirements) {
      for (const schemeName of Object.keys(securityReq)) {
        if (schemeName in securitySchemes) {
          const scheme = securitySchemes[schemeName];
          return this._createAuthFromScheme(scheme);
        }
      }
    }
    return undefined;
  }

  /**
   * Gets security schemes supporting both OpenAPI 2.0 and 3.0.
   * @returns A record of security schemes.
   */
  private _getSecuritySchemes(): Record<string, any> {
    // OpenAPI 3.0 format
    if ('components' in this.spec) {
      return this.spec.components?.securitySchemes || {};
    }
    // OpenAPI 2.0 format
    return this.spec.securityDefinitions || {};
  }

  /**
   * Creates an Auth object from an OpenAPI security scheme.
   * @param scheme The security scheme object.
   * @returns An Auth object or undefined if the scheme is not supported.
   */
  private _createAuthFromScheme(scheme: Record<string, any>): Auth | undefined {
    const schemeType = (scheme.type || '').toLowerCase();

    if (schemeType === 'apikey') {
      const location = scheme.in || 'header';
      const paramName = scheme.name || 'Authorization';

      const apiKeyPlaceholder = this._getPlaceholder("API_KEY");

      return ApiKeyAuthSchema.parse({
        auth_type: 'api_key',
        api_key: apiKeyPlaceholder,
        var_name: paramName,
        location,
      });
    }

    if (schemeType === 'basic') {
      const usernamePlaceholder = this._getPlaceholder("USERNAME");
      const passwordPlaceholder = this._getPlaceholder("PASSWORD");
      return BasicAuthSchema.parse({
        auth_type: 'basic',
        username: usernamePlaceholder,
        password: passwordPlaceholder,
      });
    }

    if (schemeType === 'http') {
      const httpScheme = (scheme.scheme || '').toLowerCase();
      if (httpScheme === 'basic') {
        const usernamePlaceholder = this._getPlaceholder("USERNAME");
        const passwordPlaceholder = this._getPlaceholder("PASSWORD");
        return BasicAuthSchema.parse({
          auth_type: 'basic',
          username: usernamePlaceholder,
          password: passwordPlaceholder,
        });
      } else if (httpScheme === 'bearer') {
        const apiKeyPlaceholder = this._getPlaceholder("API_KEY");
        return ApiKeyAuthSchema.parse({
          auth_type: 'api_key',
          api_key: `Bearer ${apiKeyPlaceholder}`,
          var_name: 'Authorization',
          location: 'header',
        });
      }
    }

    if (schemeType === 'oauth2') {
      const flows = scheme.flows || {};
      for (const flowConfig of Object.values(flows)) {
        const tokenUrl = (flowConfig as Record<string, any>).tokenUrl;
        if (tokenUrl) {
          const clientIdPlaceholder = this._getPlaceholder("CLIENT_ID");
          const clientSecretPlaceholder = this._getPlaceholder("CLIENT_SECRET");
          const scopes = (flowConfig as Record<string, any>).scopes || {};
          return OAuth2AuthSchema.parse({
            auth_type: 'oauth2',
            token_url: tokenUrl,
            client_id: clientIdPlaceholder,
            client_secret: clientSecretPlaceholder,
            scope: Object.keys(scopes).length > 0 ? Object.keys(scopes).join(' ') : undefined,
          });
        }
      }
    }

    return undefined;
  }
}

declare global {
  interface String {
    lstrip(chars: string): string;
  }
}

if (!String.prototype.lstrip) {
  String.prototype.lstrip = function (this: string, chars: string): string {
    let result = this;
    while (result.startsWith(chars)) {
      result = result.substring(chars.length);
    }
    return result;
  };
}