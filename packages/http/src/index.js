// packages/http/src/index.ts
import { pluginRegistry } from '@utcp/core';
import { HttpCallTemplateSchema } from '@utcp/http/http_call_template';
import { HttpCommunicationProtocol } from '@utcp/http/http_communication_protocol';
/**
 * This function registers the HTTP protocol's CallTemplate schema
 * and its CommunicationProtocol implementation with the core UTCP plugin registry.
 * It's designed to be called once when the HTTP plugin is loaded.
 */
export function registerHttpPlugin(override = false) {
    pluginRegistry.registerCallTemplateSchema('http', HttpCallTemplateSchema, override);
    pluginRegistry.registerCommProtocol('http', new HttpCommunicationProtocol(), override);
}
export * from './http_call_template';
export * from './openapi_converter';
