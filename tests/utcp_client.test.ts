// packages/core/tests/utcp_client.test.ts
import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Subprocess } from "bun";
import path from "path";
import { writeFile, unlink } from "fs/promises";

import { UtcpClient } from "@utcp/core";
import { registerHttpPlugin } from "@utcp/http";
import { registerTextPlugin } from "@utcp/text";
import { registerMcpPlugin } from "@utcp/mcp";
import { McpCallTemplate } from "@utcp/mcp";
import { HttpCallTemplate } from "@utcp/http";

let httpManualServerProcess: Subprocess | null = null;
let mcpStdioServerProcess: Subprocess | null = null;
const tempFiles: string[] = [];

const awaitServerReady = async (stream: ReadableStream<Uint8Array>, readyMsg: string, timeout = 15000) => {
  const reader = stream.getReader();
  let output = "";
  const start = Date.now();
  try {
    while (Date.now() - start < timeout) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      output += chunk;
      if (output.includes(readyMsg)) {
        console.log(`[Test Setup] Server ready: "${readyMsg}"`);
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error(`[Test Setup] Server did not emit ready message "${readyMsg}" in time. Full output:\n${output}`);
};

// --- Setup: Start all mock servers before any tests run ---
beforeAll(async () => {
  console.log("--- Starting mock servers for UtcpClient E2E test suite ---");

  const httpManualServerPath = path.resolve(import.meta.dir, "servers", "http_manual_server.ts");
  httpManualServerProcess = Bun.spawn(["bun", "run", httpManualServerPath], {
    stdout: "pipe",
    stderr: "inherit",
  });
  await awaitServerReady(httpManualServerProcess.stdout, "HTTP Manual Server running on port 9998");

  // 2. Start MCP Stdio Server (Bun server)
  // This server will be spawned by our `McpCommunicationProtocol` in the tests,
  // but we run it once here to ensure it's built and available.
  const mcpStdioServerPath = path.resolve(import.meta.dir, "../packages/mcp/tests/mock_mcp_server.ts");
  mcpStdioServerProcess = Bun.spawn(["bun", "run", mcpStdioServerPath], {
    stdout: "pipe",
    stderr: "inherit",
  });
  await awaitServerReady(mcpStdioServerProcess.stdout, "Mock STDIN MCP Server is running.");

  // 3. Register all UTCP protocol plugins once
  // This is crucial for the UtcpClient to know about HTTP, Text, and MCP protocols.
  registerHttpPlugin();
  registerTextPlugin();
  registerMcpPlugin();

  console.log("--- All mock servers and plugins ready ---");
}, 25000);

// --- Teardown: Stop all mock servers after all tests run ---
afterAll(async () => {
  console.log("--- Stopping mock servers ---");
  httpManualServerProcess?.kill();
  mcpStdioServerProcess?.kill();

  for (const file of tempFiles) {
    try {
      await unlink(file);
    } catch (e) {
      console.warn(`Error deleting temp file ${file}: ${e}`);
    }
  }
  tempFiles.length = 0;
  console.log("--- Mock servers stopped and temp files cleaned ---");
});

// --- End-to-End Test Suite for UtcpClient ---
describe("UtcpClient End-to-End Tests", () => {

  test("should initialize, register manuals from config, and call a tool from each protocol", async () => {
    console.log("\nRunning test: should initialize, register manuals, and call tools");

    // 1. Arrange: Create mock files and specific CallTemplates for registration
    // Create a dummy text file for the text_manual to read
    const dummyTextFilePath = path.join(import.meta.dir, "dummy_content.txt");
    await writeFile(dummyTextFilePath, "This is dummy content for the text file tool.");
    tempFiles.push(dummyTextFilePath);

    // Create a UTCP manual config file for the text protocol to load
    const textManualContent = {
      utcp_version: "1.0.1",
      manual_version: "1.0.0",
      tools: [{
        name: "read_dummy_file", // Changed name for clarity
        description: "Reads a local dummy text file.",
        inputs: { type: 'object', properties: {} },
        outputs: { type: 'object', properties: { content: { type: 'string' } } },
        tags: ["file", "io", "dummy"],
        tool_call_template: {
          name: "text_manual",
          call_template_type: "text",
          file_path: dummyTextFilePath
        } as HttpCallTemplate
      }]
    };
    const textManualConfigPath = path.join(import.meta.dir, "test_text_manual.json");
    await writeFile(textManualConfigPath, JSON.stringify(textManualContent));
    tempFiles.push(textManualConfigPath);
    const mcpStdioServerScriptPath = path.resolve(import.meta.dir, "../../mcp/tests/mock_mcp_server.ts");
    // 2. Act: Create the client with manual_call_templates in its config
    const client = await UtcpClient.create({
      manual_call_templates: [
        {
          name: "http_server_manual",
          call_template_type: "http",
          http_method: "GET",
          url: "http://localhost:9998/utcp",
        } as HttpCallTemplate,
        {
          name: "local_text_manual",
          call_template_type: "text",
          file_path: textManualConfigPath,
        } as HttpCallTemplate,
        {
          name: "mcp_stdio_client_manual",
          call_template_type: "mcp",
          config: {
            mcpServers: {
              mock_stdio_server: {
                transport: 'stdio',
                command: 'bun',
                args: ['run', mcpStdioServerScriptPath],
                cwd: path.dirname(mcpStdioServerScriptPath)
              }
            }
          }
        } as McpCallTemplate,
      ]
    });

    // 3. Assert: Check successful registrations and tool counts
    const allTools = await client.toolRepository.getTools();
    console.log(`[Test] Total tools registered: ${allTools.length}`);

    // Expected tools: 1 from HTTP, 1 from Text, 2 from MCP = 4 tools
    expect(allTools.length).toBe(4);
    const httpTool = await client.toolRepository.getTool("http_server_manual.get_user");
    const textTool = await client.toolRepository.getTool("local_text_manual.read_dummy_file");
    const mcpEchoTool = await client.toolRepository.getTool("mcp_stdio_client_manual.echo");
    const mcpAddTool = await client.toolRepository.getTool("mcp_stdio_client_manual.add");

    expect(httpTool).toBeDefined();
    expect(textTool).toBeDefined();
    expect(mcpEchoTool).toBeDefined();
    expect(mcpAddTool).toBeDefined();

    // 4. Act & Assert: Call one tool from each protocol
    console.log("\n[Test] Calling HTTP tool...");
    const httpResult = await client.callTool("http_server_manual.get_user", {});
    expect(httpResult).toEqual({ id: 123, name: "Alice" });
    console.log(`[Test] HTTP tool result: ${JSON.stringify(httpResult)}`);

    console.log("\n[Test] Calling Text tool...");
    const textResult = await client.callTool("local_text_manual.read_dummy_file", {});
    expect(textResult).toBe("This is dummy content for the text file tool.");
    console.log(`[Test] Text tool result: "${textResult.substring(0, 30)}..."`);


    console.log("\n[Test] Calling MCP tool...");
    const mcpResult = await client.callTool("mcp_stdio_client_manual.add", { a: 5, b: 3 });
    expect(mcpResult).toBe(8);
    console.log(`[Test] MCP tool result: ${mcpResult}`);

    await client.close();
  });

  test("should handle variable substitution from config and .env file", async () => {
    console.log("\nRunning test: variable substitution...");

    // 1. Arrange: Create a temporary .env file
    const envTestPath = path.join(import.meta.dir, ".env.test");
    await writeFile(envTestPath, "API_URL=http://localhost:9998\nGLOBAL_TOKEN=global_secret_key");
    tempFiles.push(envTestPath);

    // Create client with explicit variables and a dotenv loader
    const client = await UtcpClient.create({
      variables: {
        MANUAL__HTTP_SERVER_MANUAL__LOCAL_API_KEY: "local_api_key_from_config", // Explicit variable for a manual
        GLOBAL_SERVICE_HOST: "api.example.com", // Global variable
      },
      load_variables_from: [
        { type: "dotenv", env_file_path: envTestPath }
      ]
    });

    // Define a CallTemplate that uses various variable substitution patterns
    const callTemplateWithVars = {
      name: "variable_test_manual",
      call_template_type: "http",
      http_method: "GET",
      url: "${API_URL}/endpoint?query=$GLOBAL_SERVICE_HOST", // From .env and global var
      headers: {
        "X-API-Key": "${MANUAL__HTTP_SERVER_MANUAL__LOCAL_API_KEY}", // From client.config.variables, namespaced
        "Authorization": "Bearer $GLOBAL_TOKEN" // From .env
      }
    } as HttpCallTemplate;

    // 2. Act: Substitute variables in the call template
    const processed = await client.substituteCallTemplateVariables(callTemplateWithVars, callTemplateWithVars.name);

    // 3. Assert: Verify variables are correctly substituted
    expect(processed.url).toBe("http://localhost:9998/endpoint?query=api.example.com");
    expect(processed.headers?.["X-API-Key"]).toBe("local_api_key_from_config");
    expect(processed.headers?.Authorization).toBe("Bearer global_secret_key");

    await client.close();
  });

  test("should search tools across all registered manuals", async () => {
    console.log("\nRunning test: tool search across manuals...");

    // 1. Arrange: Create a clean client and register manuals
    const client = await UtcpClient.create();

    await client.registerManual({
      name: "http_search_manual",
      call_template_type: "http",
      http_method: "GET",
      url: "http://localhost:9998/utcp"
    } as HttpCallTemplate);

    const mcpStdioServerScriptPath = path.resolve(import.meta.dir, "../../mcp/tests/mock_mcp_server.ts");
    await client.registerManual({
      name: "mcp_search_manual",
      call_template_type: "mcp",
      config: {
        mcpServers: {
          mock_stdio_server: {
            transport: 'stdio',
            command: 'bun',
            args: ['run', mcpStdioServerScriptPath],
            cwd: path.dirname(mcpStdioServerScriptPath)
          }
        }
      }
    } as McpCallTemplate);

    // 2. Act: Search for tools
    const searchResults = await client.searchTools("echo", 5);

    // 3. Assert: Verify the search results
    console.log(`[Test] Search results for "echo": ${searchResults.map(t => t.name).join(', ')}`);
    expect(searchResults.length).toBe(1);
    expect(searchResults[0]?.name).toBe("mcp_search_manual.echo");

    await client.close();
  });
});