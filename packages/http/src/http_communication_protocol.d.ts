import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
/**
 * HTTP communication protocol implementation for UTCP client.
 *
 * Handles communication with HTTP-based tool providers, supporting various
 * authentication methods, URL path parameters, and automatic tool discovery.
 * Enforces security by requiring HTTPS or localhost connections.
 */
export declare class HttpCommunicationProtocol implements CommunicationProtocol {
    private _oauthTokens;
    private _axiosInstance;
    constructor();
    private _logInfo;
    private _logError;
    /**
     * Registers a manual and its tools from an HTTP provider.
     * Supports UTCP Manuals directly or OpenAPI specifications which are converted.
     *
     * @param caller The UTCP client instance.
     * @param manualCallTemplate The HTTP call template for discovery.
     * @returns A RegisterManualResult object.
     */
    registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult>;
    /**
     * Deregisters an HTTP manual. This is a no-op for stateless HTTP communication.
     * @param caller The UTCP client instance.
     * @param manualCallTemplate The HTTP call template to deregister.
     */
    deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void>;
    /**
     * Executes a tool call through the HTTP protocol.
     *
     * @param caller The UTCP client instance.
     * @param toolName Name of the tool to call.
     * @param toolArgs Dictionary of arguments to pass to the tool.
     * @param toolCallTemplate The HTTP call template for the tool.
     * @returns The tool's response.
     */
    callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any>;
    /**
     * Executes a tool call through this transport streamingly.
     * For standard HTTP, this typically means fetching the full response and yielding it as a single chunk.
     * Real streaming for protocols like SSE or HTTP chunked transfer would be in their specific implementations.
     *
     * @param caller The UTCP client instance.
     * @param toolName Name of the tool to call.
     * @param toolArgs Dictionary of arguments to pass to the tool.
     * @param toolCallTemplate The HTTP call template for the tool.
     * @returns An async generator that yields chunks of the tool's response.
     */
    callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown>;
    /**
     * Closes any persistent connections or resources held by the communication protocol.
     * For stateless HTTP, this clears OAuth tokens.
     */
    close(): Promise<void>;
    /**
     * Applies authentication details from the HttpCallTemplate to the Axios request configuration.
     * This modifies `requestConfig.headers`, `requestConfig.params`, `requestConfig.auth`, and returns cookies.
     *
     * @param httpCallTemplate The CallTemplate containing authentication details.
     * @param requestConfig The Axios request configuration to modify.
     * @returns A Promise that resolves to an object containing any cookies to be set.
     */
    private _applyAuthToRequestConfig;
    /**
     * Handles OAuth2 client credentials flow, trying both body and auth header methods.
     * Caches tokens and automatically refreshes if expired.
     *
     * @param authDetails The OAuth2 authentication details.
     * @returns The access token.
     * @throws Error if token cannot be fetched.
     */
    private _handleOAuth2;
    /**
     * Builds a URL by substituting path parameters from the provided arguments.
     * Used arguments are removed from the `args` object.
     *
     * @param urlTemplate The URL template with path parameters in `{param_name}` format.
     * @param args The dictionary of arguments; modified to remove path parameters.
     * @returns The URL with path parameters substituted.
     * @throws Error if a required path parameter is missing.
     */
    private _buildUrlWithPathParams;
}
