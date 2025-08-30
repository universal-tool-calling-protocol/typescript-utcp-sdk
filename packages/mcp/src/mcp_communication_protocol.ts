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
import { McpCallTemplateSchema, McpHttpServer,McpStdioServer, McpServerConfig } from '@utcp/mcp/mcp_call_template';
import { JsonSchema } from '@utcp/core/src/data/tool';
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
    let transport: Transport | undefined;
    let closeClientAfter = false;

    try {
      if (serverConfig.transport === 'stdio') {
        const stdioConfig = serverConfig;

        // --- FINAL FIX: Use a shell to execute the command ---
        const isWindows = process.platform === "win32";
        
        // Combine command and args into a single string for the shell
        const commandString = [stdioConfig.command, ...(stdioConfig.args || [])]
          .map(part => part.includes(' ') ? `"${part}"` : part) // Quote parts with spaces
          .join(' ');

        this._logInfo(`Executing shell command: ${commandString}`);

        const combinedEnv: Record<string, string> = {};
        for (const key in process.env) {
          if (process.env[key] !== undefined) {
            combinedEnv[key] = process.env[key]!;
          }
        }
        for (const key in (stdioConfig.env || {})) {
          if (stdioConfig.env[key] !== undefined) {
            combinedEnv[key] = stdioConfig.env[key]!;
          }
        }

        transport = new StdioClientTransport({
          command: isWindows ? 'cmd.exe' : '/bin/sh',
          args: isWindows ? ['/c', commandString] : ['-c', commandString],
          cwd: stdioConfig.cwd,
          env: combinedEnv // Use the filtered environment object
        });

        mcpClient = new McpClient({ name: 'utcp-mcp-stdio-client', version: '1.0.1' });
        await mcpClient.connect(transport);
        closeClientAfter = true;
      } else if (serverConfig.transport === 'http') {
        const httpConfig = serverConfig;
        mcpClient = await this._getOrCreateHttpClient(httpConfig, auth);
        closeClientAfter = false;
      } else {
        throw new Error(`Unsupported MCP transport: '${(serverConfig as any).transport}'`);
      }

      const result = await Promise.race([
        operation(mcpClient),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("MCP operation timed out")), 6000)) // Slightly longer timeout
      ]);
      return result;
    } finally {
      if (mcpClient && closeClientAfter) {
        await mcpClient.close();
      }
    }
  }

  /**
   * Registers an MCP manual by connecting to the first configured server,
   * discovering its tools, and converting them to the UTCP Tool format.
   */
  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    this._logInfo(`Registering MCP manual '${manualCallTemplate.name}' by discovering tools.`);
    const mcpCallTemplate = McpCallTemplateSchema.parse(manualCallTemplate);

    if (!mcpCallTemplate.config?.mcpServers || Object.keys(mcpCallTemplate.config.mcpServers).length === 0) {
      const errorMsg = "MCP call template has no servers configured.";
      this._logError(errorMsg);
      return {
        manualCallTemplate: mcpCallTemplate,
        manual: UtcpManualSchema.parse({ tools: [] }),
        success: false,
        errors: [errorMsg],
      };
    }

    // For simplicity, we'll discover tools from the *first* configured server.
    // A more complex implementation could merge tools from all servers.
    const [serverName, serverConfig] = Object.entries(mcpCallTemplate.config.mcpServers)[0]!;

    try {
      this._logInfo(`Discovering tools from MCP server '${serverName}'...`);
      const mcpTools = await this._withMcpClient(serverConfig, mcpCallTemplate.auth,
        (client) => client.listTools()
      );

      // Convert MCP Tools to UTCP Tools
      const utcpTools = mcpTools.tools.map(mcpTool => {
        const toolSpecificMcpCallTemplate = McpCallTemplateSchema.parse({
          name: mcpCallTemplate.name,
          call_template_type: mcpCallTemplate.call_template_type,
          config: mcpCallTemplate.config,
          auth: mcpCallTemplate.auth,
        });


        return {
          name: mcpTool.name,
          description: mcpTool.description || '',
          inputs: mcpTool.inputSchema as JsonSchema,
          outputs: mcpTool.outputSchema as JsonSchema,
          tags: [],
          tool_call_template: toolSpecificMcpCallTemplate,
        };
      });

      this._logInfo(`Discovered ${utcpTools.length} tools from server '${serverName}'.`);

      return {
        manualCallTemplate: mcpCallTemplate,
        manual: UtcpManualSchema.parse({ tools: utcpTools }),
        success: true,
        errors: [],
      };

    } catch (e: any) {
      this._logError(`Failed to discover tools from MCP server '${serverName}':`, e);
      return {
        manualCallTemplate: mcpCallTemplate,
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
      return JSON.parse(text);
    } catch {
      const num = Number(text);
      if (!isNaN(num) && isFinite(num)) {
          return num;
      }
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