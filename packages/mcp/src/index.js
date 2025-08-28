// packages/mcp/src/index.ts
import { pluginRegistry } from '@utcp/core';
import { McpCallTemplateSchema } from '@utcp/mcp/mcp_call_template';
import { McpCommunicationProtocol } from '@utcp/mcp/mcp_communication_protocol';
/**
 * This function registers the MCP protocol's CallTemplate schema
 * and its CommunicationProtocol implementation with the core UTCP plugin registry.
 * It's designed to be called once when the MCP plugin is loaded.
 */
export function registerMcpPlugin() {
    pluginRegistry.registerCallTemplateSchema('mcp', McpCallTemplateSchema);
    pluginRegistry.registerCommProtocol('mcp', new McpCommunicationProtocol());
}
export * from './mcp_call_template';
