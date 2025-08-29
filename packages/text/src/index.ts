// packages/text/src/index.ts
import { pluginRegistry } from '@utcp/core';
import { TextCallTemplateSchema } from '@utcp/text/text_call_template';
import { TextCommunicationProtocol } from '@utcp/text/text_communication_protocol';

// HttpCommunicationProtocol will be added later
// TextCommunicationProtocol will be added later

/**
 * This function registers the Text protocol's CallTemplate schema
 * with the core UTCP plugin registry.
 * It's designed to be called once when the Text plugin is loaded.
 */
export function registerTextPlugin(): void {
  pluginRegistry.registerCallTemplateSchema('text', TextCallTemplateSchema);
  pluginRegistry.registerCommProtocol('text', new TextCommunicationProtocol());
}

export * from './text_call_template';
export * from './text_communication_protocol';