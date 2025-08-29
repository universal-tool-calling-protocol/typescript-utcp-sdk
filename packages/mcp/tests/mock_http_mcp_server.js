// packages/mcp/tests/mock_http_mcp_server.ts
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
const HTTP_PORT = 9999;
const server = new McpServer({ name: "mock-http-server", version: "1.0.0" });
// Define tools with simple input schemas
server.registerTool("echo", {
    title: "Echo Tool",
    description: "Echoes back the input message.",
    inputSchema: z.object({ message: z.string() }),
}, async (input) => {
    const result = { reply: `you said: ${input.message}` };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
server.registerTool("add", {
    title: "Add Tool",
    description: "Adds two numbers.",
    inputSchema: z.object({ a: z.number(), b: z.number() }),
}, async (input) => {
    const result = input.a + input.b;
    return { content: [{ type: "text", text: String(result) }] };
});
const httpServer = http.createServer();
const transport = new StreamableHTTPServerTransport(httpServer, { path: "/mcp" });
(async () => {
    await server.connect(transport);
    httpServer.listen(HTTP_PORT, () => {
        console.log(`Mock HTTP MCP Server listening on port ${HTTP_PORT}`);
    });
})();
