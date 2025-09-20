// packages/mcp/src/mcp_call_template.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';
import { OAuth2AuthSchema } from '@utcp/core/data/auth';

/**
 * Schema for MCP Stdio Server parameters.
 * Used for local process communication with an MCP server.
 */
export const McpStdioServerSchema = z.object({
  transport: z.literal('stdio'),
  command: z.string().describe('The command to execute the MCP server.'),
  args: z.array(z.string()).optional().default([]).describe('Arguments to pass to the command.'),
  cwd: z.string().optional().describe('Working directory for the command.'),
  env: z.record(z.string(), z.string()).optional().default({}).describe('Environment variables for the command.'),
});
export type McpStdioServer = z.infer<typeof McpStdioServerSchema>;

/**
 * MCP HTTP Server schema for MCP servers connected via streamable HTTP.
 */
export const McpHttpServerSchema = z.object({
  transport: z.literal('http'),
  url: z.string().describe('The URL of the MCP HTTP server endpoint.'),
  headers: z.record(z.string(), z.string()).optional().describe('Optional HTTP headers for the connection.'),
  timeout: z.number().optional().default(30).describe('Timeout for HTTP requests in seconds.'),
  sse_read_timeout: z.number().optional().default(300).describe('Read timeout for SSE connections in seconds (e.g., for `streamable-http` MCP servers).'),
  terminate_on_close: z.boolean().optional().default(true).describe('Whether to terminate the HTTP connection on client close.'),
});
export type McpHttpServer = z.infer<typeof McpHttpServerSchema>;

/**
 * A discriminated union of all supported MCP server transport configurations.
 */
export const McpServerConfigSchema = z.discriminatedUnion('transport', [
  McpStdioServerSchema,
  McpHttpServerSchema,
]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * Configuration for multiple MCP servers under one provider.
 */
export const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema).describe('Dictionary mapping server names to their configurations.'),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

/**
 * MCP Call Template schema for Model Context Protocol tools.
 * Enables communication with MCP servers.
 */
export const McpCallTemplateSchema = CallTemplateBaseSchema.extend({
  call_template_type: z.literal('mcp'),
  config: McpConfigSchema.describe('Configuration object containing MCP server definitions.'),
  auth: OAuth2AuthSchema.optional().describe('Optional OAuth2 authentication for HTTP-based MCP servers.'),
});
export type McpCallTemplate = z.infer<typeof McpCallTemplateSchema>;