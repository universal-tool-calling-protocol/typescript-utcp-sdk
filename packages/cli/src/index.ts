// packages/cli/src/index.ts
import { pluginRegistry } from '@utcp/core';
import { CliCallTemplateSchema } from '@utcp/cli/cli_call_template';
import { CliCommunicationProtocol } from '@utcp/cli/cli_communication_protocol';

/**
 * This function registers the CLI protocol's CallTemplate schema
 * and its CommunicationProtocol implementation with the core UTCP plugin registry.
 * It's designed to be called once when the CLI plugin is loaded.
 */
export function registerCliPlugin(override: boolean = false): void {
  pluginRegistry.registerCallTemplateSchema('cli', CliCallTemplateSchema, override);
  pluginRegistry.registerCommProtocol('cli', new CliCommunicationProtocol(), override);
}

export * from './cli_call_template';
export * from './cli_communication_protocol';