// packages/mcp/tests/mock_http_mcp_server.ts
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HTTP_PORT = 9999;
const server = new McpServer({ name: "mock-http-server", version: "1.0.0" });

server.registerTool("echo", {
  title: "Echo Tool",
  description: "Echoes back the input message.",
  inputSchema: { message: z.string() },
}, async (input) => {
  const result = { reply: `you said: ${input.message}` };
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

server.registerTool("add", {
  title: "Add Tool",
  description: "Adds two numbers.",
  inputSchema: { a: z.number(), b: z.number() },
}, async (input) => {
  const result = input.a + input.b;
  return { content: [{ type: "text", text: String(result) }] };
});

const transportOptions: StreamableHTTPServerTransportOptions = {
  sessionIdGenerator: () => crypto.randomUUID(), // Provide a session ID generator
};
const transport = new StreamableHTTPServerTransport(transportOptions);

// FIX: We now create the HTTP server and manually wire it to the transport's handleRequest method.
const httpServer = http.createServer((req, res) => {
  // Only handle requests to the /mcp path
  if (req.url === "/mcp") {
      transport.handleRequest(req, res);
  } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
  }
});

(async () => {
  await server.connect(transport);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`Mock HTTP MCP Server listening on port ${HTTP_PORT}`);
  });
})();