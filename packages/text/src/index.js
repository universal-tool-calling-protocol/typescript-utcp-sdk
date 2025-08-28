// packages/text/src/index.ts
import { pluginRegistry } from '@utcp/core';
import { TextCallTemplateSchema } from '@utcp/text/text_call_template';
// HttpCommunicationProtocol will be added later
// TextCommunicationProtocol will be added later
/**
 * This function registers the Text protocol's CallTemplate schema
 * with the core UTCP plugin registry.
 * It's designed to be called once when the Text plugin is loaded.
 */
export function registerTextPlugin() {
    pluginRegistry.registerCallTemplateSchema('text', TextCallTemplateSchema);
}
export * from './text_call_template';
