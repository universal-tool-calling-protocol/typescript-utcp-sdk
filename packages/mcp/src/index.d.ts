/**
 * This function registers the MCP protocol's CallTemplate schema
 * and its CommunicationProtocol implementation with the core UTCP plugin registry.
 * It's designed to be called once when the MCP plugin is loaded.
 */
export declare function registerMcpPlugin(): void;
export * from './mcp_call_template';
