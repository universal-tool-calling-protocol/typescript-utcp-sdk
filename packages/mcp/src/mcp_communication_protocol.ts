// packages/mcp/src/mcp_communication_protocol.ts
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// Infer McpTool structure based on server-side examples and common usage patterns
interface InferredMcpTool {
  name: string;
  description?: string;
  inputSchema: any;
  outputSchema?: any;
  tags?: string[];
  averageResponseSize?: number;
}
// Inferred options for StdioClientTransport constructor
interface InferredStdioClientTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

import axios, { AxiosInstance } from 'axios';
import { URLSearchParams } from 'url';

import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { Tool, JsonSchemaZodSchema } from '@utcp/core/data/tool';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { OAuth2Auth } from '@utcp/core/data/auth';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import { McpCallTemplate, McpCallTemplateSchema, McpStdioServerSchema, McpHttpServerSchema, McpServerConfig } from '@utcp/mcp/mcp_call_template';

/**
 * MCP communication protocol implementation.
 * Connects to MCP servers (stdio or HTTP) for tool discovery and execution.
 * Operates in a session-per-operation mode where each interaction creates a new MCP client.
 */
export class McpCommunicationProtocol implements CommunicationProtocol {
  private _oauthTokens: Map<string, { accessToken: string; expiresAt: number }> = new Map();
  private _axiosInstance: AxiosInstance;

  constructor() {
    this._axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  private _logInfo(message: string): void {
    console.log(`[McpCommunicationProtocol] ${message}`);
  }

  private _logError(message: string, error?: any): void {
    console.error(`[McpCommunicationProtocol Error] ${message}`, error);
  }

  /**
   * Helper to fetch an OAuth2 token, with caching and retry for body/header.
   * Handles token expiry and refetching.
   */
  private async _handleOAuth2(authDetails: OAuth2Auth): Promise<string> {
    const clientId = authDetails.client_id;

    const cachedToken = this._oauthTokens.get(clientId);
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }

    this._logInfo(`Fetching new OAuth2 token for client: '${clientId}'`);

    try {
      const token = await Promise.any([
        // Method 1: Send credentials in the request body (common)
        (async () => {
          const bodyData = new URLSearchParams({
            'grant_type': 'client_credentials',
            'client_id': authDetails.client_id,
            'client_secret': authDetails.client_secret,
            'scope': authDetails.scope || ''
          });
          const response = await this._axiosInstance.post(
            authDetails.token_url,
            bodyData.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );
          if (!response.data.access_token) {
            throw new Error("Access token not found in response.");
          }
          const expiresAt = Date.now() + (response.data.expires_in * 1000 || 3600 * 1000);
          this._oauthTokens.set(clientId, { accessToken: response.data.access_token, expiresAt });
          return response.data.access_token;
        })(),

        // Method 2: Send credentials as Basic Auth header (fallback for some servers)
        (async () => {
          const bodyData = new URLSearchParams({
            'grant_type': 'client_credentials',
            'scope': authDetails.scope || ''
          });
          const response = await this._axiosInstance.post(
            authDetails.token_url,
            bodyData.toString(),
            {
              auth: { username: authDetails.client_id, password: authDetails.client_secret },
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
          );
          if (!response.data.access_token) {
            throw new Error("Access token not found in response.");
          }
          const expiresAt = Date.now() + (response.data.expires_in * 1000 || 3600 * 1000);
          this._oauthTokens.set(clientId, { accessToken: response.data.access_token, expiresAt });
          return response.data.access_token;
        })()
      ]);
      return token;

    } catch (aggregateError: any) {
      const errorMessages = aggregateError.errors ? aggregateError.errors.map((e: Error) => e.message).join('; ') : String(aggregateError);
      throw new Error(`Failed to fetch OAuth2 token for client '${clientId}' after trying all methods. Details: ${errorMessages}`);
    }
  }

  /**
   * Helper to initialize and use an MCP Client for a single operation.
   * This handles both stdio and http transports using the new MCP SDK client API.
   *
   * @param serverConfig The configuration for the specific MCP server.
   * @param auth Optional OAuth2 authentication details.
   * @param operation A callback function that takes an initialized `McpClient` and performs an operation (e.g., `listTools`, `callTool`).
   * @returns The result of the operation.
   */
  private async _withMcpClient<T>(
    serverConfig: McpServerConfig,
    auth: OAuth2Auth | undefined,
    operation: (client: McpClient) => Promise<T>
  ): Promise<T> {
    let mcpClient: McpClient | undefined;
    try {
      if (serverConfig.transport === 'stdio') {
        const stdioConfig = McpStdioServerSchema.parse(serverConfig);
        const transportOptions: InferredStdioClientTransportOptions = {
          command: stdioConfig.command,
          args: stdioConfig.args,
          cwd: (stdioConfig as any).cwd,
          env: stdioConfig.env,
        };
        const transport = new StdioClientTransport(transportOptions);
        mcpClient = new McpClient({ name: 'utcp-mcp-stdio-client', version: '1.0.0' });
        await mcpClient.connect(transport);
        return await operation(mcpClient);
      } else if (serverConfig.transport === 'http') {
        const httpConfig = McpHttpServerSchema.parse(serverConfig);
        
        let authHeader: Record<string, string> = {};
        if (auth) {
          const token = await this._handleOAuth2(auth);
          authHeader['Authorization'] = `Bearer ${token}`;
        }

        const transportOptions: StreamableHTTPClientTransportOptions = {
          requestInit: {
            headers: {
              ...(httpConfig.headers || {}),
              ...authHeader,
            }
          },
        };

        const transport = new StreamableHTTPClientTransport(
          new URL(httpConfig.url),
          transportOptions
        );
        mcpClient = new McpClient({ name: 'utcp-mcp-http-client', version: '1.0.0' });
        await mcpClient.connect(transport);
        return await operation(mcpClient);
      } else {
        throw new Error(`Unsupported MCP transport: '${(serverConfig as any).transport}'`);
      }
    } finally {
      if (mcpClient) {
        await mcpClient.close();
      }
    }
  }

  /**
   * Processes the raw result from an MCP tool call to extract the meaningful output.
   */
  private _processMcpToolResult(result: any, toolName: string): any {
    this._logInfo(`Processing MCP tool result for '${toolName}'. Raw result type: ${typeof result}`);

    if (result && typeof result === 'object' && 'structured_output' in result) {
        this._logInfo(`Found structured_output for '${toolName}'.`);
        return result.structured_output;
    }

    if (result && typeof result === 'object' && 'content' in result && Array.isArray(result.content)) {
        const contentArray = result.content;
        this._logInfo(`Content is an array with ${contentArray.length} items.`);

        const processedList = contentArray.map((item: any) => {
            if (typeof item === 'object' && item !== null) {
                if ('text' in item && typeof item.text === 'string') {
                    return this._parseTextContent(item.text);
                }
                if ('json' in item && typeof item.json === 'object' && item.json !== null) {
                    return item.json;
                }
            }
            return item;
        });

        if (processedList.length === 1) {
            return processedList[0];
        }
        return processedList;
    }

    if (result && typeof result === 'object' && 'content' in result && typeof result.content === 'object' && result.content !== null) {
        const content = result.content;
        if ('text' in content && typeof content.text === 'string') {
            return this._parseTextContent(content.text);
        }
        if ('json' in content && typeof content.json === 'object' && content.json !== null) {
            return content.json;
        }
    }

    if (result && typeof result === 'object' && 'result' in result) {
        return result.result;
    }

    return result;
  }

  /**
   * Parses text content, attempting JSON, numbers, or returning as string.
   */
  private _parseTextContent(text: string): any {
    if (!text) {
      return text;
    }
    try {
      const trimmedText = text.trim();
      if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
        return JSON.parse(trimmedText);
      }
    } catch (e) {}
    try {
      if (!isNaN(Number(text)) && text.trim() !== '') {
        return Number(text);
      }
    } catch (e) {}
    return text;
  }

  /**
   * Registers an MCP manual and discovers its tools.
   */
  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    const mcpCallTemplate = McpCallTemplateSchema.parse(manualCallTemplate);

    const allTools: Tool[] = [];
    const errors: string[] = [];

    if (mcpCallTemplate.config && mcpCallTemplate.config.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(mcpCallTemplate.config.mcpServers)) {
        try {
          this._logInfo(`Discovering tools for MCP server '${serverName}' via '${serverConfig.transport}' transport.`);
          const mcpTools: InferredMcpTool[] = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, (client) => client.listTools().then(res => res.tools));
          this._logInfo(`Discovered ${mcpTools.length} tools from MCP server '${serverName}'.`);

          for (const mcpTool of mcpTools) {
            const utcpTool: Tool = {
              name: mcpTool.name,
              description: mcpTool.description || '',
              inputs: JsonSchemaZodSchema.parse(mcpTool.inputSchema || {}),
              outputs: JsonSchemaZodSchema.parse(mcpTool.outputSchema || {}),
              tags: mcpTool.tags || [],
              average_response_size: mcpTool.averageResponseSize,
              tool_call_template: manualCallTemplate,
            };
            allTools.push(utcpTool);
          }
        } catch (e: any) {
          const errorMessage = `Failed to discover tools for MCP server '${serverName}': ${e.message || String(e)}`;
          this._logError(errorMessage, e);
          errors.push(errorMessage);
        }
      }
    }

    return {
      manualCallTemplate: mcpCallTemplate,
      manual: UtcpManualSchema.parse({ tools: allTools }),
      success: errors.length === 0,
      errors: errors,
    };
  }

  /**
   * Deregisters an MCP manual.
   */
  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering MCP manual '${manualCallTemplate.name}' (no-op in session-per-operation mode).`);
    return Promise.resolve();
  }

  /**
   * Calls a tool through the MCP protocol.
   */
  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const mcpCallTemplate = McpCallTemplateSchema.parse(toolCallTemplate);

    if (!mcpCallTemplate.config || !mcpCallTemplate.config.mcpServers) {
      throw new Error(`No MCP server configuration found for tool '${toolName}'.`);
    }

    for (const [serverName, serverConfig] of Object.entries(mcpCallTemplate.config.mcpServers)) {
      try {
        this._logInfo(`Attempting to call tool '${toolName}' on MCP server '${serverName}'.`);
        
        const availableMcpTools: InferredMcpTool[] = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, (client) => client.listTools().then(res => res.tools));
        const toolExistsOnServer = availableMcpTools.some((t: InferredMcpTool) => t.name === toolName);

        if (!toolExistsOnServer) {
          this._logInfo(`Tool '${toolName}' not found on MCP server '${serverName}'. Trying next server.`);
          continue;
        }

        const result = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, (client) => client.callTool({ name: toolName, arguments: toolArgs }));
        this._logInfo(`Successfully called tool '${toolName}' on server '${serverName}'.`);
        return this._processMcpToolResult(result, toolName);

      } catch (e: any) {
        this._logError(`Error calling tool '${toolName}' on MCP server '${serverName}':`, e);
      }
    }

    throw new Error(`Tool '${toolName}' not found or could not be called on any configured MCP server.`);
  }

  /**
   * Calls an MCP tool and streams its results.
   */
  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    this._logInfo(`MCP protocol does not inherently support streaming for '${toolName}'. Fetching full response.`);
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  /**
   * Closes any resources held by the communication protocol.
   */
  public async close(): Promise<void> {
    this._oauthTokens.clear();
    this._logInfo("MCP Communication Protocol closed. OAuth tokens cleared.");
    return Promise.resolve();
  }
}