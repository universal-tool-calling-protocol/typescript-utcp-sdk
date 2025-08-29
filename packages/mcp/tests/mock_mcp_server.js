// packages/mcp/tests/mock_mcp_server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const server = new McpServer({ name: "mock-stdio-server", version: "1.0.0" });
// Define tools with simple input schemas, as the server expects
server.registerTool("echo", {
    title: "Echo Tool",
    description: "Echoes back the input message.",
    inputSchema: z.object({ message: z.string() }),
}, async (input) => {
    // Return a JSON string as a text content part
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
const transport = new StdioServerTransport();
(async () => {
    await server.connect(transport);
    console.log("Mock STDIN MCP Server is running.");
})();
