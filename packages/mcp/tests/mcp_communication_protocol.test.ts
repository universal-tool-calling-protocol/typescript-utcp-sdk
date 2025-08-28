// // packages/mcp/tests/mcp_communication_protocol.test.ts (create this new file)
// import { test, expect, beforeAll, beforeEach, afterEach, describe } from "bun:test";
// import { spawn } from 'child_process';
// import { EventEmitter } from 'events';
// import { setTimeout } from 'timers/promises';

// import { UtcpClient } from '@utcp/core';
// import { McpCallTemplate } from '@utcp/mcp/mcp_call_template';
// import { McpCommunicationProtocol } from '@utcp/mcp/mcp_communication_protocol';
// import { registerMcpPlugin } from '@utcp/mcp'; // Register this plugin
// import { registerHttpPlugin } from '@utcp/http'; // The bridge server will use HTTP, so need this
// import { pluginRegistry } from '@utcp/core/plugins/plugin_registry';

// // Mock an external HTTP service for the bridge server to call (e.g., OpenLibrary)
// import nock from 'nock';

// // Helper to launch the MCP bridge server as a child process
// class McpBridgeProcess extends EventEmitter {
//   private child: ReturnType<typeof spawn> | null = null;
//   private isReady = false;
//   private outputBuffer = '';

//   async start(): Promise<void> {
//     this.isReady = false;
//     this.outputBuffer = '';

//     const serverPath = path.resolve(__dirname, '../../../examples/mcp-bridge-server/dist/main.js');
//     this.child = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });

//     this.child.stdout?.on('data', (data) => {
//       const msg = data.toString();
//       // console.log(`[MCP Bridge STDOUT] ${msg}`); // Uncomment for debugging
//       this.outputBuffer += msg;
//       if (this.outputBuffer.includes("UTCP Client MCP Bridge Server started")) {
//         this.isReady = true;
//         this.emit('ready');
//       }
//     });

//     this.child.stderr?.on('data', (data) => {
//       console.error(`[MCP Bridge STDERR] ${data.toString()}`);
//       this.emit('error', new Error(data.toString()));
//     });

//     this.child.on('error', (err) => {
//       console.error(`MCP Bridge Process Error: ${err}`);
//       this.emit('error', err);
//     });

//     this.child.on('exit', (code, signal) => {
//       console.log(`MCP Bridge Process exited with code ${code}, signal ${signal}`);
//       this.emit('exit', code, signal);
//     });

//     // Wait for the "ready" signal from the server's stdout
//     await new Promise<void>((resolve, reject) => {
//       if (this.isReady) {
//         resolve();
//         return;
//       }
//       const timeout = setTimeout(() => reject(new Error("MCP Bridge Server startup timed out")), 30000); // 30 sec timeout
//       this.once('ready', () => {
//         clearTimeout(timeout);
//         resolve();
//       });
//       this.once('error', (err) => {
//         clearTimeout(timeout);
//         reject(err);
//       });
//     });
//     console.log("MCP Bridge Server is ready.");
//   }

//   async stop(): Promise<void> {
//     if (this.child) {
//       this.child.kill('SIGINT'); // Send interrupt signal for graceful shutdown
//       await new Promise<void>((resolve) => {
//         this.child?.on('exit', () => resolve());
//         setTimeout(() => { // Timeout in case it doesn't exit gracefully
//           if (this.child?.pid) {
//             try {
//               process.kill(this.child.pid, 'SIGKILL');
//             } catch {}
//           }
//           resolve();
//         }, 5000);
//       });
//     }
//   }
// }

// // --- Tests for MCP Communication Protocol interacting with the Bridge Server ---
// describe('McpCommunicationProtocol with UTCP Client Bridge Server', () => {
//   let mcpBridgeServer: McpBridgeProcess;
//   let utcpClient: UtcpClient;
//   let mcpProtocol: McpCommunicationProtocol;

//   // Register MCP plugin once globally
//   beforeAll(() => {
//     // These are the *client-side* plugins for your test UtcpClient
//     registerHttpPlugin(); // The test client needs this to register a manual for the bridge
//     registerMcpPlugin();  // The test client needs this to use McpCommunicationProtocol
//   });

//   beforeEach(async () => {
//     nock.cleanAll(); // Clean up any nock mocks from previous tests

//     // Start the MCP Bridge Server
//     mcpBridgeServer = new McpBridgeProcess();
//     await mcpBridgeServer.start();

//     // Create the UTCP client which will *use* the McpCommunicationProtocol
//     // to connect to the bridge server
//     utcpClient = await UtcpClient.create({});

//     // Get the McpCommunicationProtocol instance from the plugin registry
//     const registeredProtocol = pluginRegistry.getCommProtocol('mcp');
//     if (!(registeredProtocol instanceof McpCommunicationProtocol)) {
//       throw new Error("McpCommunicationProtocol not properly registered or is not an instance of McpCommunicationProtocol");
//     }
//     mcpProtocol = registeredProtocol;
//   });

//   afterEach(async () => {
//     await utcpClient.close();
//     await mcpBridgeServer.stop();
//     nock.cleanAll();
//   });

//   test('should register a manual on the bridge server', async () => {
//     // Mock an external HTTP API that the *bridge server* would call (e.g., OpenLibrary)
//     nock('https://openlibrary.org')
//         .get('/static/openapi.json')
//         .reply(200, {
//             openapi: '3.0.0',
//             info: { title: 'OpenLibrary API', version: '1.0.0' },
//             paths: {
//                 '/authors/{authorId}': {
//                     get: {
//                         operationId: 'getAuthorById',
//                         summary: 'Get an author by ID',
//                         parameters: [{ name: 'authorId', in: 'path', required: true, schema: { type: 'string' } }],
//                         responses: { '200': { description: 'Author data', content: { 'application/json': { schema: { type: 'object' } } } } },
//                     },
//                 },
//             },
//         });

//     const mcpCallTemplate: McpCallTemplate = {
//       name: 'mcp_bridge_client',
//       call_template_type: 'mcp',
//       config: {
//         mcpServers: {
//           main: {
//             transport: 'stdio',
//             command: 'node',
//             args: [path.resolve(__dirname, '../../../examples/mcp-bridge-server/dist/main.js')], // Point to the bridge server
//             cwd: path.resolve(__dirname, '../../../examples/mcp-bridge-server'), // Set cwd to server dir
//           },
//         },
//       },
//     };

//     const registerManualMCPCallTemplate: CallTemplateBase = {
//         name: 'utcp_register_manual_mcp', // Name of the MCP tool on the bridge
//         call_template_type: 'mcp',
//         auth: mcpCallTemplate.auth,
//         config: mcpCallTemplate.config,
//     }

//     const externalHttpManualCallTemplate: HttpCallTemplate = {
//         name: 'external_openlibrary',
//         call_template_type: 'http',
//         http_method: 'GET',
//         url: 'https://openlibrary.org/static/openapi.json', // This is what the bridge client will fetch
//         content_type: 'application/json'
//     };


//     // Call the MCP tool 'utcp.register_manual' on the bridge server
//     const result = await mcpProtocol.callTool(
//         utcpClient,
//         'utcp.register_manual', // This is the tool name exposed by the bridge server
//         { manualCallTemplate: externalHttpManualCallTemplate },
//         registerManualMCPCallTemplate
//     );

//     console.log("Registration Result from Bridge:", result);
//     expect(result.success).toBeTrue();
//     expect(result.manual_name).toBe('external_openlibrary');
//     expect(result.tools_registered).toBe(1);
//     expect(result.tool_names).toEqual(['external_openlibrary.getAuthorById']);

//     // --- Now, try to call a tool *through* the bridge ---
//     const callToolMCPCallTemplate: CallTemplateBase = {
//         name: 'utcp_call_tool_mcp', // Name of the MCP tool on the bridge
//         call_template_type: 'mcp',
//         auth: mcpCallTemplate.auth,
//         config: mcpCallTemplate.config,
//     }

//     // Mock the actual OpenLibrary API call that the *bridge server's internal UtcpClient* will make
//     nock('https://openlibrary.org')
//         .get('/authors/OL23919A')
//         .reply(200, { name: 'J. K. Rowling', birth_date: 'July 31, 1965' });


//     const toolCallResult = await mcpProtocol.callTool(
//         utcpClient,
//         'utcp.call_tool', // This is the tool name exposed by the bridge server
//         {
//             toolName: 'external_openlibrary.getAuthorById', // This is the tool name registered *on the bridge*
//             toolArgs: { authorId: 'OL23919A' }
//         },
//         callToolMCPCallTemplate
//     );
    
//     console.log("Tool Call Result from Bridge:", toolCallResult);
//     expect(toolCallResult.error).toBeUndefined();
//     expect(toolCallResult.result).toEqual({ name: 'J. K. Rowling', birth_date: 'July 31, 1965' });
//   }, 60000); // Increased timeout for the test to allow server startup
// });