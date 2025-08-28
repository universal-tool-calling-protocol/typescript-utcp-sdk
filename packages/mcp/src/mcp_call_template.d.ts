import { z } from 'zod';
/**
 * Schema for MCP Stdio Server parameters.
 * Used for local process communication with an MCP server.
 */
export declare const McpStdioServerSchema: z.ZodObject<{
    transport: z.ZodLiteral<"stdio">;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, z.core.$strip>;
export type McpStdioServer = z.infer<typeof McpStdioServerSchema>;
/**
 * Schema for MCP HTTP Server parameters.
 * Used for remote HTTP communication with an MCP server.
 */
export declare const McpHttpServerSchema: z.ZodObject<{
    transport: z.ZodLiteral<"http">;
    url: z.ZodString;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    sse_read_timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    terminate_on_close: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type McpHttpServer = z.infer<typeof McpHttpServerSchema>;
/**
 * A discriminated union of all supported MCP server transport configurations.
 */
export declare const McpServerConfigSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    transport: z.ZodLiteral<"stdio">;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, z.core.$strip>, z.ZodObject<{
    transport: z.ZodLiteral<"http">;
    url: z.ZodString;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    sse_read_timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    terminate_on_close: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>], "transport">;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
/**
 * Configuration for multiple MCP servers under one provider.
 */
export declare const McpConfigSchema: z.ZodObject<{
    mcpServers: z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
        transport: z.ZodLiteral<"stdio">;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
        cwd: z.ZodOptional<z.ZodString>;
        env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    }, z.core.$strip>, z.ZodObject<{
        transport: z.ZodLiteral<"http">;
        url: z.ZodString;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        sse_read_timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        terminate_on_close: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, z.core.$strip>], "transport">>;
}, z.core.$strip>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
/**
 * MCP Call Template schema for Model Context Protocol tools.
 * Enables communication with MCP servers.
 */
export declare const McpCallTemplateSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    call_template_type: z.ZodLiteral<"mcp">;
    config: z.ZodObject<{
        mcpServers: z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
            transport: z.ZodLiteral<"stdio">;
            command: z.ZodString;
            args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
            cwd: z.ZodOptional<z.ZodString>;
            env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
        }, z.core.$strip>, z.ZodObject<{
            transport: z.ZodLiteral<"http">;
            url: z.ZodString;
            headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            sse_read_timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            terminate_on_close: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, z.core.$strip>], "transport">>;
    }, z.core.$strip>;
    auth: z.ZodOptional<z.ZodObject<{
        auth_type: z.ZodLiteral<"oauth2">;
        token_url: z.ZodString;
        client_id: z.ZodString;
        client_secret: z.ZodString;
        scope: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type McpCallTemplate = z.infer<typeof McpCallTemplateSchema>;
