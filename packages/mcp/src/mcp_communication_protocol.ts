// packages/mcp/src/mcp_communication_protocol.ts
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios, { AxiosInstance } from 'axios';
import { URLSearchParams } from 'url';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { Tool, JsonSchemaZodSchema, JsonSchema } from '@utcp/core/data/tool';
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
          const expiresAt = Date.now() + (response.data.expires_in * 1000 || 3600 * 1000);
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
          const expiresAt = Date.now() + (response.data.expires_in * 1000 || 3600 * 1000);
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

  private async _withMcpClient<T>(
    serverConfig: McpServerConfig,
    auth: OAuth2Auth | undefined,
    operation: (client: McpClient) => Promise<T>
  ): Promise<T> {
    let mcpClient: McpClient | undefined;
    let transport;

    try {
      if (serverConfig.transport === 'stdio') {
        const stdioConfig = McpStdioServerSchema.parse(serverConfig);
        transport = new StdioClientTransport({
          command: stdioConfig.command,
          args: stdioConfig.args,
          cwd: stdioConfig.cwd,
          env: stdioConfig.env,
        });
      } else if (serverConfig.transport === 'http') {
        const httpConfig = McpHttpServerSchema.parse(serverConfig);
        let authHeader: Record<string, string> = {};
        if (auth) {
          const token = await this._handleOAuth2(auth);
          authHeader['Authorization'] = `Bearer ${token}`;
        }
        const transportOptions: StreamableHTTPClientTransportOptions = {
          requestInit: { headers: { ...(httpConfig.headers || {}), ...authHeader } },
        };
        transport = new StreamableHTTPClientTransport(new URL(httpConfig.url), transportOptions);
      } else {
        throw new Error(`Unsupported MCP transport: '${(serverConfig as any).transport}'`);
      }

      mcpClient = new McpClient({ name: 'utcp-mcp-client', version: '1.0.0' });
      await mcpClient.connect(transport);
      return await operation(mcpClient);

    } finally {
      if (mcpClient) {
        await mcpClient.close();
      }
    }
  }

  private _processMcpToolResult(result: any, toolName: string): any {
    this._logInfo(`Processing MCP tool result for '${toolName}'.`);
    if (result && typeof result === 'object') {
      if ('structured_output' in result) return result.structured_output;
      if (Array.isArray(result.content)) {
        const processedList = result.content.map((item: any) => {
          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return this._parseTextContent(item.text);
          }
          return item;
        });
        return processedList.length === 1 ? processedList[0] : processedList;
      }
      if ('result' in result) return result.result;
    }
    return result;
  }

  private _parseTextContent(text: string): any {
    try {
      const trimmed = text.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(trimmed);
      }
    } catch {}
    return text;
  }

  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    const mcpCallTemplate = McpCallTemplateSchema.parse(manualCallTemplate);
    const allTools: Tool[] = [];
    const errors: string[] = [];

    if (mcpCallTemplate.config?.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(mcpCallTemplate.config.mcpServers)) {
        try {
          this._logInfo(`Discovering tools for MCP server '${serverName}'...`);
          const mcpTools = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, 
            (client) => client.listTools().then(res => res.tools)
          );
          this._logInfo(`Discovered ${mcpTools.length} tools from '${serverName}'.`);

          for (const mcpTool of mcpTools) {
            // FIX: Safely handle potentially undefined or non-array `tags`.
            const tags = Array.isArray(mcpTool.tags) ? mcpTool.tags : [];
            
            // FIX: Safely handle `averageResponseSize` being `unknown`.
            const averageResponseSize = typeof mcpTool.averageResponseSize === 'number' 
              ? mcpTool.averageResponseSize 
              : undefined;

            const utcpTool: Tool = {
              name: mcpTool.name,
              description: mcpTool.description || '',
              inputs: JsonSchemaZodSchema.parse(mcpTool.inputSchema || { type: 'object', properties: {} }),
              outputs: JsonSchemaZodSchema.parse(mcpTool.outputSchema || { type: 'object', properties: {} }),
              tags: tags,
              average_response_size: averageResponseSize,
              tool_call_template: manualCallTemplate,
            };
            allTools.push(utcpTool);
          }
        } catch (e: any) {
          const errorMessage = `Failed to discover tools for server '${serverName}': ${e.message || String(e)}`;
          this._logError(errorMessage, e);
          errors.push(errorMessage);
        }
      }
    }
    return {
      manualCallTemplate: mcpCallTemplate,
      manual: UtcpManualSchema.parse({ tools: allTools }),
      success: errors.length === 0,
      errors,
    };
  }

  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering MCP manual '${manualCallTemplate.name}' (no-op).`);
  }

  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const mcpCallTemplate = McpCallTemplateSchema.parse(toolCallTemplate);
    if (!mcpCallTemplate.config?.mcpServers) {
      throw new Error(`No MCP server configuration for tool '${toolName}'.`);
    }

    for (const [serverName, serverConfig] of Object.entries(mcpCallTemplate.config.mcpServers)) {
      try {
        this._logInfo(`Attempting tool '${toolName}' on server '${serverName}'.`);
        const availableMcpTools = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, 
          (client) => client.listTools().then(res => res.tools)
        );
        if (!availableMcpTools.some((t: any) => t.name === toolName)) {
          this._logInfo(`Tool '${toolName}' not found on server '${serverName}'.`);
          continue;
        }
        const result = await this._withMcpClient(serverConfig, mcpCallTemplate.auth, (client) => client.callTool({ name: toolName, arguments: toolArgs }));
        return this._processMcpToolResult(result, toolName);
      } catch (e: any) {
        this._logError(`Error calling '${toolName}' on '${serverName}':`, e);
      }
    }
    throw new Error(`Tool '${toolName}' not found or failed on all configured MCP servers.`);
  }

  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    this._logInfo(`MCP does not support streaming for '${toolName}'. Fetching full response.`);
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  public async close(): Promise<void> {
    this._oauthTokens.clear();
    this._logInfo("MCP Communication Protocol closed.");
  }
}