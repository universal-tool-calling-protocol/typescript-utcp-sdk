// // examples/mcp-bridge-server/src/main.ts
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { z } from "zod";
// import dotenv from "dotenv";
// import path from "path";
// import { fileURLToPath } from 'url';

// // Import your core UTCP client components
// import { UtcpClient, UtcpClientConfigSchema, UtcpClientConfig } from '@utcp/core';
// import { CallTemplateBaseSchema, CallTemplateBase } from '@utcp/core/data/call_template';
// import { JsonSchemaZodSchema } from '@utcp/core/data/tool';

// // Import plugin registrations for the UTCP client *within* the bridge server
// import { registerHttpPlugin } from '@utcp/http';
// // Add other plugins here as they are developed (e.g., import { registerTextPlugin } from '@utcp/text';)

// // Ensure environment variables are loaded for the bridge server
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// dotenv.config({ path: path.resolve(__dirname, '../../mcp-bridge-server/.env') }); // Point to .env in bridge server folder

// const server = new McpServer({
//   name: "utcp-mcp-bridge-server",
//   version: "1.0.0"
// });

// let utcpClientInstance: UtcpClient | null = null;

// // Helper to get or initialize the UTCP client
// async function getUtcpClient(): Promise<UtcpClient> {
//   if (utcpClientInstance === null) {
//     // Here, the bridge server's UtcpClient itself will need its own config
//     // For now, an empty config. In a real scenario, this would load a config file.
//     const utcpClientConfig: UtcpClientConfig = UtcpClientConfigSchema.parse({});

//     utcpClientInstance = await UtcpClient.create(utcpClientConfig);
//   }
//   return utcpClientInstance;
// }

// // --- MCP Tools exposed by the bridge ---

// server.registerTool("utcp.register_manual",
//   {
//     title: "Register UTCP Manual",
//     description: "Registers a new UTCP manual (tool provider) with the internal UTCP client.",
//     inputSchema: z.object({
//       manualCallTemplate: CallTemplateBaseSchema.describe("The CallTemplate object for the manual to register.")
//     }),
//     outputSchema: z.object({
//       success: z.boolean(),
//       manual_name: z.string().optional(),
//       tools_registered: z.number().optional(),
//       tool_names: z.array(z.string()).optional(),
//       errors: z.array(z.string()).optional()
//     })
//   },
//   async ({ manualCallTemplate }: { manualCallTemplate: CallTemplateBase }) => {
//     const client = await getUtcpClient();
//     try {
//       const result = await client.registerManual(manualCallTemplate);
//       return {
//         content: [{
//           type: "json",
//           json: {
//             success: result.success,
//             manual_name: result.manualCallTemplate.name,
//             tools_registered: result.manual.tools.length,
//             tool_names: result.manual.tools.map(t => t.name),
//             errors: result.errors
//           }
//         }]
//       };
//     } catch (e: any) {
//       return {
//         content: [{
//           type: "json",
//           json: { success: false, errors: [e.message || "Unknown error during registration."] }
//         }]
//       };
//     }
//   }
// );

// server.registerTool("utcp.deregister_manual",
//   {
//     title: "Deregister UTCP Manual",
//     description: "Deregisters a UTCP manual (tool provider) from the internal UTCP client.",
//     inputSchema: z.object({
//       manualName: z.string().describe("The name of the manual to deregister.")
//     }),
//     outputSchema: z.object({
//       success: z.boolean(),
//       message: z.string().optional(),
//       error: z.string().optional()
//     })
//   },
//   async ({ manualName }: { manualName: string }) => {
//     const client = await getUtcpClient();
//     try {
//       const success = await client.deregisterManual(manualName);
//       return {
//         content: [{
//           type: "json",
//           json: { success, message: success ? `Manual '${manualName}' deregistered.` : `Manual '${manualName}' not found.` }
//         }]
//       };
//     } catch (e: any) {
//       return {
//         content: [{
//           type: "json",
//           json: { success: false, error: e.message || "Unknown error during deregistration." }
//         }]
//       };
//     }
//   }
// );

// server.registerTool("utcp.call_tool",
//   {
//     title: "Call UTCP Tool",
//     description: "Calls a tool registered with the internal UTCP client.",
//     inputSchema: z.object({
//       toolName: z.string().describe("The full namespaced name of the tool to call (e.g., 'my_manual.my_tool')."),
//       toolArgs: z.record(z.string(), z.any()).describe("Arguments to pass to the tool.")
//     }),
//     outputSchema: JsonSchemaZodSchema.describe("The result from the tool call.")
//   },
//   async ({ toolName, toolArgs }: { toolName: string; toolArgs: Record<string, any> }) => {
//     const client = await getUtcpClient();
//     try {
//       const result = await client.callTool(toolName, toolArgs);
//       // MCP expects 'content' array for unstructured or 'structuredOutput' for structured
//       return {
//         content: [{ type: "json", json: result }]
//       };
//     } catch (e: any) {
//       return {
//         content: [{ type: "json", json: { error: e.message || "Unknown error during tool call." } }]
//       };
//     }
//   }
// );

// server.registerTool("utcp.search_tools",
//   {
//     title: "Search UTCP Tools",
//     description: "Searches for tools using a query string.",
//     inputSchema: z.object({
//       query: z.string().describe("Description of the task to search for tools."),
//       limit: z.number().optional().default(10).describe("Optional limit on the number of tools to return."),
//       anyOfTagsRequired: z.array(z.string()).optional().describe("Optional list of tags where one must be present.")
//     }),
//     outputSchema: z.array(z.object({
//       name: z.string(),
//       description: z.string(),
//       tags: z.array(z.string()),
//       inputs: JsonSchemaZodSchema.optional()
//     }))
//   },
//   async ({ query, limit, anyOfTagsRequired }: { query: string; limit?: number; anyOfTagsRequired?: string[] }) => {
//     const client = await getUtcpClient();
//     try {
//       const tools = await client.searchTools(query, limit, anyOfTagsRequired);
//       return {
//         content: [{
//           type: "json",
//           json: tools.map(tool => ({
//             name: tool.name,
//             description: tool.description,
//             tags: tool.tags,
//             inputs: tool.inputs // Include input schema for search results
//           }))
//         }]
//       };
//     } catch (e: any) {
//       return {
//         content: [{ type: "json", json: { error: e.message || "Unknown error during tool search." } }]
//       };
//     }
//   }
// );

// // --- Main server logic ---
// async function startMcpServer(): Promise<void> {
//   // Register all UTCP plugins that the bridge server's internal UtcpClient might use
//   // This is crucial for the internal UtcpClient to know about HTTP, Text, etc.
//   registerHttpPlugin(); // Ensure the HTTP plugin is available to the internal client
//   // registerTextPlugin(); // If you have a text plugin, register it here
//   // registerMcpPlugin();  // If the bridge needs to call other MCP services, register MCP here too.

//   // Connect the MCP server to stdio
//   const transport = new StdioServerTransport();
//   await server.connect(transport);

//   console.log("UTCP Client MCP Bridge Server started, waiting for MCP client connections...");
// }

// // Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('Shutting down UTCP Client MCP Bridge Server...');
//   if (utcpClientInstance) {
//     await utcpClientInstance.close();
//   }
//   process.exit(0);
// });

// startMcpServer().catch(error => {
//   console.error("UTCP Client MCP Bridge Server failed to start:", error);
//   process.exit(1);
// });