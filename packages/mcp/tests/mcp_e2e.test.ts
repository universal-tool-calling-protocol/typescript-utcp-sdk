// // packages/mcp/tests/mcp_e2e.test.ts
// import { test, expect, beforeAll, afterAll, describe } from "bun:test";
// import { spawn } from 'child_process';
// import path from 'path';
// import { UtcpClient } from '@utcp/core';
// import { McpCallTemplate } from '@utcp/mcp';
// import { registerMcpPlugin } from '@utcp/mcp'; // Ensure the plugin is registered for this test file
// import { CallTemplateBase } from '@utcp/core/data/call_template';

// // Ensure the MCP plugin is registered for this test run
// beforeAll(() => {
//   registerMcpPlugin();
// });


// describe('MCP E2E Test: TypeScript Client to Python Server', () => {
//   let pythonServerProcess: ReturnType<typeof spawn> | null = null;
//   let client: UtcpClient;
//   const mcpServerScriptPath = path.resolve(__dirname, '../../../../universal-tool-calling-protocol-python-utcp/plugins/communication_protocols/mcp/tests/mock_mcp_server.py');
//   const pythonExecutable = process.env.PYTHON_BIN || 'python'; // Use 'python' or 'python3' based on your system

//   beforeAll(async () => {
//     // 1. Start the Python MCP server
//     console.log(`Starting Python MCP server: ${pythonExecutable} ${mcpServerScriptPath}`);
//     pythonServerProcess = spawn(pythonExecutable, [mcpServerScriptPath], {
//       stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr for IPC
//       env: { ...process.env }, // Inherit environment variables
//     });

//     pythonServerProcess.stdout?.on('data', (data) => console.log(`[MCP Server STDOUT]: ${data.toString().trim()}`));
//     pythonServerProcess.stderr?.on('data', (data) => console.error(`[MCP Server STDERR]: ${data.toString().trim()}`));

//     // Wait for the server to indicate it's ready (this is highly dependent on server's logging)
//     // For mock_mcp_server.py, it starts FastMCP which doesn't print a clear "ready" message.
//     // A small delay is a pragmatic (though brittle) solution for testing stdio servers.
//     // In a real application, consider a handshake mechanism.
//     await new Promise(resolve => setTimeout(5000)); // Wait 5 seconds for server to boot

//     // 2. Initialize the TypeScript UTCP client
//     client = await UtcpClient.create({});
//   }, 15000); // Increased timeout for beforeAll hook

//   afterAll(async () => {
//     // 1. Close the TypeScript UTCP client
//     await client.close();

//     // 2. Terminate the Python MCP server process
//     if (pythonServerProcess) {
//       console.log('Terminating Python MCP server...');
//       pythonServerProcess.kill('SIGTERM'); // Send termination signal
//       await new Promise(resolve => setTimeout(2000)); // Give it a moment to terminate
//       if (!pythonServerProcess.killed) {
//         pythonServerProcess.kill('SIGKILL'); // Force kill if still running
//         console.warn('Python MCP server force killed.');
//       }
//       pythonServerProcess = null;
//     }
//   });

//   test('should register a manual from the Python MCP server and call its echo tool', async () => {
//     const manualName = 'python_mcp_server'; // A descriptive name for our manual
//     const echoToolName = `${manualName}.echo`;

//     // 1. Define the MCP Call Template pointing to the Python server via stdio
//     const mcpCallTemplate: McpCallTemplate = {
//       name: manualName,
//       call_template_type: 'mcp',
//       config: {
//         mcpServers: {
//           stdio_server: { // Name this server instance anything you like
//             transport: 'stdio',
//             command: pythonExecutable,
//             args: [mcpServerScriptPath],
//             cwd: path.dirname(mcpServerScriptPath)
//           },
//         },
//       },
//     };

//     // 2. Register the MCP manual with the UTCP client
//     console.log(`Registering MCP manual '${manualName}'...`);
//     const registerResult = await client.registerManual(mcpCallTemplate);

//     expect(registerResult.success).toBeTrue();
//     expect(registerResult.errors).toHaveLength(0);
//     expect(registerResult.manual.tools.length).toBeGreaterThan(0);
    
//     const registeredToolNames = registerResult.manual.tools.map(t => t.name);
//     expect(registeredToolNames).toContain(echoToolName);

//     // 3. Call the 'echo' tool via the UTCP client
//     const message = 'Hello from TypeScript UTCP!';
//     console.log(`Calling tool '${echoToolName}' with message: "${message}"`);
//     const toolResult = await client.callTool(echoToolName, { message });

//     console.log('Tool call result:', toolResult);
//     expect(toolResult).toEqual({ reply: `you said: ${message}` });

//     // 4. Test other tools from the Python server
//     const greetToolName = `${manualName}.greet`;
//     const greetResult = await client.callTool(greetToolName, { name: 'UTCP User' });
//     expect(greetResult).toBe('Hello, UTCP User!');

//     const addNumbersToolName = `${manualName}.add_numbers`;
//     const addResult = await client.callTool(addNumbersToolName, { a: 10, b: 20 });
//     expect(addResult).toBe(30);

//     const listItemsToolName = `${manualName}.list_items`;
//     const listResult = await client.callTool(listItemsToolName, { count: 2 });
//     expect(listResult).toEqual(['item_0', 'item_1']);

//   });

//   test('should handle tool not found in MCP server', async () => {
//     const manualName = 'python_mcp_server_notool';
//     const nonExistentTool = `${manualName}.non_existent_tool`;

//     const mcpCallTemplate: McpCallTemplate = {
//         name: manualName,
//         call_template_type: 'mcp',
//         config: {
//             mcpServers: {
//                 stdio_server: {
//                     transport: 'stdio',
//                     command: pythonExecutable,
//                     args: [mcpServerScriptPath],
//                     cwd: path.dirname(mcpServerScriptPath)
//                 },
//             },
//         },
//     };

//     await client.registerManual(mcpCallTemplate);

//     await expect(client.callTool(nonExistentTool, {})).rejects.toThrow(
//         `MCP tool '${nonExistentTool}' not found or callable on any configured MCP server.`
//     );
//   });

// });