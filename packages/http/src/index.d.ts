/**
 * This function registers the HTTP protocol's CallTemplate schema
 * and its CommunicationProtocol implementation with the core UTCP plugin registry.
 * It's designed to be called once when the HTTP plugin is loaded.
 */
export declare function registerHttpPlugin(override?: boolean): void;
export * from './http_call_template';
export * from './openapi_converter';
