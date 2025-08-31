// packages/mcp/tests/mcp_communication_protocol.test.ts
import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Subprocess } from "bun";
import path from "path";
import { McpCommunicationProtocol } from "../src/mcp_communication_protocol";
import { McpCallTemplate } from "../src/mcp_call_template";

const HTTP_PORT = 9999;
let stdioServerProcess: Subprocess | null = null;
let httpServerProcess: Subprocess | null = null;

// Helper to wait for a specific log message from a subprocess stream
const awaitStreamReady = async (stream: ReadableStream<Uint8Array>, readyMessage: string, timeout = 15000) => {
  const reader = stream.getReader();
  const start = Date.now();
  let output = "";

  try {
    while (Date.now() - start < timeout) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      output += chunk;
      if (output.includes(readyMessage)) {
        console.log(`Server ready message found: "${readyMessage}"`);
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error(`Server did not emit ready message "${readyMessage}" in time. Full output:\n${output}`);
};

beforeAll(async () => {
  console.log("Starting mock MCP servers for testing...");

  const stdioServerPath = path.resolve(import.meta.dir, "mock_mcp_server.ts");
  stdioServerProcess = Bun.spawn(["bun", "run", stdioServerPath], {
    stdout: "pipe",
    stderr: "inherit",
  });
  console.log(`Spawned stdio server with PID: ${stdioServerProcess.pid}`);
  await awaitStreamReady(stdioServerProcess.stdout, "Mock STDIN MCP Server is running.");

  const httpServerPath = path.resolve(import.meta.dir, "mock_http_mcp_server.ts");
  httpServerProcess = Bun.spawn(["bun", "run", httpServerPath], {
    stdout: "pipe",
    stderr: "inherit",
  });
  console.log(`Spawned http server with PID: ${httpServerProcess.pid}`);
  await awaitStreamReady(httpServerProcess.stdout, `Mock HTTP MCP Server listening on port ${HTTP_PORT}`);

  console.log("Both mock servers are ready.");
}, 20000);

afterAll(() => {
  console.log("Stopping mock MCP servers...");
  stdioServerProcess?.kill();
  httpServerProcess?.kill();
  console.log("Mock servers stopped.");
});

describe("McpCommunicationProtocol", () => {
  const protocol = new McpCommunicationProtocol();

  describe("Stdio Transport", () => {
    const stdioServerPath = path.resolve(import.meta.dir, "mock_mcp_server.ts");
    const callTemplate: McpCallTemplate = {
      name: "mock_stdio_manual",
      call_template_type: "mcp",
      config: {
        mcpServers: {
          mock_stdio_server: {
            transport: 'stdio',
            command: 'bun',
            args: ['run', stdioServerPath],
            cwd: path.dirname(stdioServerPath)
          }
        }
      }
    };

    test("should register manual successfully (passthrough)", async () => {
      const result = await protocol.registerManual({} as any, callTemplate);
      expect(result.success).toBe(true);
      expect(result.manual.tools).toHaveLength(0);
    });

    test("should call a tool with structured output via stdio", async () => {
      const result = await protocol.callTool({} as any, "echo", { message: "hello stdio" }, callTemplate);
      expect(result).toEqual({ reply: "you said: hello stdio" });
    });

    test("should call a tool with primitive output via stdio", async () => {
      const result = await protocol.callTool({} as any, "add", { a: 10, b: 5 }, callTemplate);
      expect(result).toBe(15);
    });
  });

  describe("HTTP Transport", () => {
    const callTemplate: McpCallTemplate = {
      name: "mock_http_manual",
      call_template_type: "mcp",
      config: {
        mcpServers: {
          mock_http_server: {
            transport: 'http',
            url: `http://localhost:${HTTP_PORT}/mcp`,
          }
        }
      }
    };

    test("should register manual successfully via http (passthrough)", async () => {
      const result = await protocol.registerManual({} as any, callTemplate);
      expect(result.success).toBe(true);
      expect(result.manual.tools).toHaveLength(0);
    });

    test("should call a tool with structured output via http", async () => {
      const result = await protocol.callTool({} as any, "echo", { message: "hello http" }, callTemplate);
      expect(result).toEqual({ reply: "you said: hello http" });
    }, 10000);

    test("should call a tool with primitive output via http", async () => {
      const result = await protocol.callTool({} as any, "add", { a: 20, b: 5 }, callTemplate);
      expect(result).toBe(25);
    }, 10000);

    test("should throw an error if tool is not found on any server", async () => {
      await expect(
        protocol.callTool({} as any, "nonexistent_tool", {}, callTemplate)
      ).rejects.toThrow("Tool 'nonexistent_tool' failed on all configured MCP servers.");
    }, 10000);
  });
});