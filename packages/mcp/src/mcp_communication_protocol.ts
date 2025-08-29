// packages/mcp/src/mcp_communication_protocol.ts
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios, { AxiosInstance } from 'axios';
import { URLSearchParams } from 'url';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { OAuth2Auth } from '@utcp/core/data/auth';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import { McpCallTemplate, McpCallTemplateSchema, McpStdioServerSchema, McpHttpServer, McpHttpServerSchema,McpStdioServer, McpServerConfig } from '@utcp/mcp/mcp_call_template';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'; 

/**
 * MCP communication protocol implementation.
 * Connects to MCP servers (stdio or HTTP) for tool execution.
 * This implementation is session-per-operation, creating a new client for each call.
 */
export class McpCommunicationProtocol implements CommunicationProtocol {
  private _oauthTokens: Map<string, { accessToken: string; expiresAt: number }> = new Map();
  private _axiosInstance: AxiosInstance;
  private _httpMcpClientCache: Map<string, McpClient> = new Map();

  constructor() {
    this._axiosInstance = axios.create({ timeout: 30000 });
  }

  private _logInfo(message: string): void {
    console.log(`[McpCommunicationProtocol] ${message}`);
  }

  private _logError(message: string, error?: any): void {
    console.error(`[McpCommunicationProtocol Error] ${message}`, error);
  }

  private async _handleOAuth2(authDetails: OAuth2Auth): Promise<string> {
    const clientId = authDetails.client_id;
    const cachedToken = this._oauthTokens.get(clientId);
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }

    this._logInfo(`Fetching new OAuth2 token for client: '${clientId}'`);

    try {
      const token = await Promise.any([
        (async () => {
          const bodyData = new URLSearchParams({
            'grant_type': 'client_credentials', 'client_id': authDetails.client_id,
            'client_secret': authDetails.client_secret, 'scope': authDetails.scope || ''
          });
          const response = await this._axiosInstance.post(authDetails.token_url, bodyData.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (!response.data.access_token) throw new Error("Access token not found in response.");
          const expiresAt = Date.now() + ((response.data.expires_in || 3600) * 1000);
          this._oauthTokens.set(clientId, { accessToken: response.data.access_token, expiresAt });
          return response.data.access_token;
        })(),
        (async () => {
          const bodyData = new URLSearchParams({ 'grant_type': 'client_credentials', 'scope': authDetails.scope || '' });
          const response = await this._axiosInstance.post(authDetails.token_url, bodyData.toString(), {
            auth: { username: authDetails.client_id, password: authDetails.client_secret },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          if (!response.data.access_token) throw new Error("Access token not found in response.");
          const expiresAt = Date.now() + ((response.data.expires_in || 3600) * 1000);
          this._oauthTokens.set(clientId, { accessToken: response.data.access_token, expiresAt });
          return response.data.access_token;
        })()
      ]);
      return token;
    } catch (aggregateError: any) {
      const errorMessages = aggregateError.errors?.map((e: Error) => e.message).join('; ') || String(aggregateError);
      throw new Error(`Failed to fetch OAuth2 token for client '${clientId}': ${errorMessages}`);
    }
  }
  private async _getOrCreateHttpClient(serverConfig: McpHttpServer, auth?: OAuth2Auth): Promise<McpClient> {
    const cacheKey = serverConfig.url;
    if (this._httpMcpClientCache.has(cacheKey)) {
        return this._httpMcpClientCache.get(cacheKey)!;
    }
  
    let authHeader: Record<string, string> = {};
    if (auth) {
        const token = await this._handleOAuth2(auth);
        authHeader['Authorization'] = `Bearer ${token}`;
    }
  
    const transportOptions: StreamableHTTPClientTransportOptions = {
        requestInit: { headers: { ...(serverConfig.headers || {}), ...authHeader } }
    };
    const transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), transportOptions);
  
    const mcpClient = new McpClient({ name: 'utcp-mcp-http-client', version: '1.0.1' });
    await mcpClient.connect(transport);
  
    this._httpMcpClientCache.set(cacheKey, mcpClient);
    return mcpClient;
  }
  /**
   * A helper to create, connect, and tear down an MCP client session for a single operation.
   */
  private async _withMcpClient<T>(
    serverConfig: McpServerConfig,
    auth: OAuth2Auth | undefined,
    operation: (client: McpClient) => Promise<T>
  ): Promise<T> {
    let mcpClient: McpClient | undefined;
    let closeClientAfter = false;

    try {
      if (serverConfig.transport === 'stdio') {
        const stdioConfig = serverConfig as McpStdioServer; // Cast for type safety
        const transport = new StdioClientTransport({ command: stdioConfig.command, args: stdioConfig.args, cwd: stdioConfig.cwd, env: stdioConfig.env });
        mcpClient = new McpClient({ name: 'utcp-mcp-stdio-client', version: '1.0.1' });
        await mcpClient.connect(transport);
        closeClientAfter = true;
      } else if (serverConfig.transport === 'http') {
        const httpConfig = serverConfig as McpHttpServer; // Cast for type safety
        mcpClient = await this._getOrCreateHttpClient(httpConfig, auth);
        closeClientAfter = false;
      } else {
        const unknownTransport = (serverConfig as any).transport;
        throw new Error(`Unsupported MCP transport: '${unknownTransport}'`);
      }

      const result = await Promise.race([
        operation(mcpClient),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("MCP operation timed out")), 4500))
    ]);
    return result;
  } finally {
    if (mcpClient && closeClientAfter) {
      await mcpClient.close();
    }
  }
}

  /**
   * Registers an MCP manual. This is a passthrough operation that validates the
   * CallTemplate. It does not discover tools from the server; it trusts the UTCP manual
   * being registered as the source of truth.
   */ 
  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    this._logInfo(`Validating MCP manual call template '${manualCallTemplate.name}'.`);
    try {
      const mcpCallTemplate = McpCallTemplateSchema.parse(manualCallTemplate);
      return {
        manualCallTemplate: mcpCallTemplate,
        manual: UtcpManualSchema.parse({ tools: [] }), 
        success: true,
        errors: [],
      };
    } catch(e: any) {
        this._logError(`Invalid MCP call template for '${manualCallTemplate.name}':`, e);
        return {
            manualCallTemplate: manualCallTemplate,
            manual: UtcpManualSchema.parse({ tools: [] }),
            success: false,
            errors: [e.message],
        };
    }
  }

  /**
   * Processes the result from an MCP tool call, unwrapping content as needed.
   */
  private _processMcpToolResult(result: any): any {
    if (result && typeof result === 'object') {
      if ('structured_output' in result) {
        return result.structured_output;
      }
      if (Array.isArray(result.content)) {
        const processedList = result.content.map((item: any) => {
          if (item && item.type === 'text' && typeof item.text === 'string') {
            return this._parseTextContent(item.text);
          }
          return item;
        });
        return processedList.length === 1 ? processedList[0] : processedList;
      }
    }
    return result;
  }
  
  
  /**
   * Attempts to parse a string as JSON, otherwise returns the original string.
   */
  private _parseTextContent(text: string): any {
    try {
      // Try to parse as JSON first
      return JSON.parse(text);
    } catch {
      // If it fails, check if it's a number
      const num = Number(text);
      if (!isNaN(num) && isFinite(num)) {
          return num;
      }
      // Otherwise, return the original string
      return text;
    }
  }

  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering MCP manual '${manualCallTemplate.name}' (no-op in session-per-operation mode).`);
    return Promise.resolve();
  }

  /**
   * Executes a tool call on an MCP server.
   */
  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const mcpCallTemplate = McpCallTemplateSchema.parse(toolCallTemplate);
    if (!mcpCallTemplate.config?.mcpServers) {
      throw new Error(`No MCP server configuration for tool '${toolName}'.`);
    }
    
    for (const [serverName, serverConfig] of Object.entries(mcpCallTemplate.config.mcpServers)) {
      try {
        this._logInfo(`Attempting tool '${toolName}' on server '${serverName}'.`);
        const result = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, 
          (client) => client.callTool({ name: toolName, arguments: toolArgs })
        );
        return this._processMcpToolResult(result);
      } catch (e: any) {
        this._logError(`Call to '${toolName}' on server '${serverName}' failed:`, e.message);
      }
    }
    throw new Error(`Tool '${toolName}' failed on all configured MCP servers.`);
  }


  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    this._logInfo(`MCP protocol does not support streaming for '${toolName}'. Fetching full response as a single chunk.`);
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  public async close(): Promise<void> {
    for (const client of this._httpMcpClientCache.values()) {
        if (client && typeof client.close === 'function') {
            await client.close();
        }
    }
    this._httpMcpClientCache.clear();
    this._oauthTokens.clear();
    this._logInfo("MCP Communication Protocol closed and clients cleared.");
  }
}