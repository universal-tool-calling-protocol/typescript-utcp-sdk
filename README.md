# Universal Tool Calling Protocol (UTCP) for TypeScript

[![NPM version](https://img.shields.io/npm/v/@utcp/core.svg)](https://www.npmjs.com/package/@utcp/core) <!-- Links to the core package on NPM -->

## Introduction

The Universal Tool Calling Protocol (UTCP) is a modern, flexible, and scalable standard for defining and interacting with tools across a wide variety of communication protocols. This repository contains the official TypeScript implementation, structured as a monorepo with a lean core and pluggable communication protocols.

Built with a strong emphasis on:

*   **Scalability**: Designed to handle a large number of tools and providers without compromising performance.
*   **Extensibility**: A pluggable architecture allows developers to easily add new communication protocols, tool storage mechanisms, and search strategies without modifying the core library.
*   **Interoperability**: With a growing ecosystem of protocol plugins (currently including HTTP, MCP, and Text, with more planned), UTCP can integrate with almost any existing service or infrastructure.
*   **Type Safety**: The protocol is built on well-defined TypeScript interfaces and runtime validation powered by Zod, making it robust and easy for developers to use.

## Monorepo Structure

This repository is structured as a `bun` workspace, containing:

*   `packages/core`: The lean core SDK, providing fundamental data models, interfaces, the `UtcpClient`, and a plugin registry.
*   `packages/http`: A communication protocol plugin for interacting with RESTful HTTP/HTTPS APIs, including OpenAPI specification conversion.
*   `packages/mcp`: A communication protocol plugin for interoperability with the Model Context Protocol (MCP) via stdio or HTTP transports.
*   `packages/text`: A simple communication protocol plugin for loading UTCP manuals or OpenAPI specs from local files.
*   Additional plugins will be added under `packages/` for other protocols (e.g., CLI, WebSocket).

## Installation

To set up the monorepo and install all dependencies:

```bash
# Clone the repository
git clone https://github.com/universal-tool-calling-protocol/typescript-utcp.git # Update with actual repo URL if different
cd typescript-utcp

# Install dependencies for all packages in the workspace
bun install
```

## Usage Example

To get started, you typically import and register the plugins you need, then create an instance of `UtcpClient`.

```typescript
// From your application's entry point (e.g., main.ts)

import { UtcpClient } from '@utcp/core/client/utcp_client';
import { UtcpClientConfigSchema } from '@utcp/core/client/utcp_client_config';
import { registerHttpPlugin } from '@utcp/http'; // Register HTTP plugin
import { registerMcpPlugin } from '@utcp/mcp';   // Register MCP plugin
import { registerTextPlugin } from '@utcp/text'; // Register Text plugin

// --- IMPORTANT: Register all necessary plugins at application startup ---
registerHttpPlugin();
registerMcpPlugin();
registerTextPlugin();
// -------------------------------------------------------------------

async function main() {
  const client = await UtcpClient.create(
    UtcpClientConfigSchema.parse({
      // Define variables for substitution in call templates
      variables: {
        OPENLIBRARY_API_KEY: 'your-openlibrary-key'
      },
      // Optionally define manual_call_templates directly in config
      manual_call_templates: [
        {
          name: 'openlibrary_api',
          call_template_type: 'http',
          url: 'https://openlibrary.org/static/openapi.json', // Auto-converts OpenAPI
          http_method: 'GET'
        },
        {
          name: 'my_local_tools',
          call_template_type: 'text',
          file_path: './config/my_tools.json' // Loads from a local file
        }
      ],
      // Or load variables from .env files
      load_variables_from: [
        { type: 'dotenv', env_file_path: './.env' }
      ]
    })
  );

  console.log('UTCP Client initialized. Searching for tools...');

  // Search for tools based on a query
  const relevantTools = await client.searchTools('search for books by author');
  console.log('Found tools:', relevantTools.map(t => t.name));

  // Example: Call a tool (replace with an actual tool from discovery)
  if (relevantTools.length > 0) {
    try {
      const toolToCall = relevantTools;
      console.log(`Calling tool: ${toolToCall.name}`);
      const result = await client.callTool(toolToCall.name, { q: 'J. K. Rowling' });
      console.log('Tool call result:', result);
    } catch (error) {
      console.error('Error calling tool:', error);
    }
  }

  await client.close(); // Important for resource cleanup
}

main().catch(console.error);
```

## Development & Testing

To build all packages:

```bash
bun tsc --build packages/core packages/http packages/mcp packages/text
```

To run tests for a specific package (e.g., `@utcp/mcp`):

```bash
bun test packages/mcp/tests/mcp_communication_protocol.test.ts
```

## License

This project is licensed under the Mozilla Public License Version 2.0. See the `LICENSE` file for details.