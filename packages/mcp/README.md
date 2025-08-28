# @utcp/mcp: Model Context Protocol (MCP) Communication Protocol Plugin for UTCP

The `@utcp/mcp` package enables the `UtcpClient` to interact with tools defined and served via the Model Context Protocol (MCP). This plugin provides interoperability with existing MCP servers, supporting both `stdio` (local process) and `http` (streamable HTTP) transports.

## Features

*   **MCP `CallTemplate`**: Defines the configuration for connecting to one or more MCP servers (`McpCallTemplate`), including transport type (`stdio` or `http`) and optional OAuth2 authentication for HTTP-based servers.
*   **`McpCommunicationProtocol`**: Implements the `CommunicationProtocol` interface for MCP interactions:
    *   **Tool Discovery**: Connects to configured MCP servers (via subprocess for stdio, or HTTP client for remote) and retrieves their list of tools using the MCP SDK's `listTools()` command.
    *   **Tool Execution**: Invokes tools on MCP servers using the MCP SDK's `callTool()`, translating arguments and processing raw MCP results into a unified format.
    *   **Transport Support**: Seamlessly handles both `stdio` (spawning a local process) and `http` (connecting to a remote streamable HTTP MCP server) via the `@modelcontextprotocol/sdk` client.
    *   **Authentication Support**: Supports `OAuth2Auth` for HTTP-based MCP servers, including token caching and refresh.
    *   **Result Processing**: Adapts raw MCP tool results (which can contain `structured_output`, `text` content, or `json` content) into a more usable format for the UTCP client.

## Installation

```bash
bun add @utcp/mcp @utcp/core @modelcontextprotocol/sdk axios
```

Note: `@utcp/core` is a peer dependency, and `@modelcontextprotocol/sdk` and `axios` are direct dependencies.

## Usage

To use the MCP plugin, you must register its capabilities with the core `UtcpClient` at application startup. This is typically done by calling the `registerMcpPlugin()` function exported from `@utcp/mcp`.

```typescript
// From your application's entry point

import { UtcpClient } from '@utcp/core/client/utcp_client';
import { McpCallTemplateSchema } from '@utcp/mcp/mcp_call_template';
import { registerMcpPlugin } from '@utcp/mcp'; // Import the registration function
import * as path from 'path';

// --- IMPORTANT: Register the MCP plugin once at the start of your application ---
registerMcpPlugin();
// -------------------------------------------------------------------------------

async function main() {
  // Path to your mock MCP server script (e.g., from tests/mock_mcp_server.ts)
  const mockMcpServerPath = path.resolve(__dirname, '../../packages/mcp/tests/mock_mcp_server.ts');

  // Define a CallTemplate to connect to an MCP server running via stdio (local subprocess)
  const mcpCallTemplate = McpCallTemplateSchema.parse({
    name: 'my_local_mcp_server',
    call_template_type: 'mcp',
    config: {
      mcpServers: {
        'local-stdio': {
          transport: 'stdio',
          command: 'bun', // Command to run the server script
          args: [mockMcpServerPath], // Arguments to the command
          // cwd: path.resolve(__dirname, './server_dir'), // Optional: working directory for the subprocess
        },
        // Example for a remote HTTP MCP server (uncomment and configure if needed)
        // 'remote-http': {
        //   transport: 'http',
        //   url: 'http://localhost:8000/mcp',
        //   // auth: { auth_type: 'oauth2', token_url: '...', client_id: '${REMOTE_MCP_CLIENT_ID}', client_secret: '${REMOTE_MCP_CLIENT_SECRET}' }
        // }
      },
    },
  });

  const client = await UtcpClient.create(
    UtcpClientConfigSchema.parse({
      manual_call_templates: [mcpCallTemplate], // Register the MCP manual at client startup
      variables: {
        // REMOTE_MCP_CLIENT_ID: 'your-client-id',
        // REMOTE_MCP_CLIENT_SECRET: 'your-client-secret'
      }
    })
  );

  console.log('MCP Plugin active. Searching for tools...');

  // Example: Search for tools on the MCP server
  const mcpTools = await client.searchTools('greet');
  console.log('Found MCP tools:', mcpTools.map(t => t.name));

  // Example: Call a 'greet' tool (expecting a simple string)
  try {
    const greetResult = await client.callTool('my_local_mcp_server.greet', { name: 'UTCP User' });
    console.log('MCP greet tool result:', greetResult);
  } catch (error) {
    console.error('Error calling MCP greet tool:', error);
  }

  // Example: Call an 'add' tool (expecting structured JSON)
  try {
    const addResult = await client.callTool('my_local_mcp_server.add', { a: 10, b: 20 });
    console.log('MCP add tool result:', addResult);
  } catch (error) {
    console.error('Error calling MCP add tool:', error);
  }

  await client.close(); // Clean up MCP subprocesses or HTTP client sessions
}

main().catch(console.error);
```

## Development

Refer to the root `README.md` for monorepo development and testing instructions.