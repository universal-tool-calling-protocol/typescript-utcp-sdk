// packages/core/src/index.ts
// Client
export * from './client/utcp_client';
export * from './client/utcp_client_config';

// Data Models
export * from './data/auth';
export * from './data/call_template';
export * from './data/tool';
export * from './data/utcp_manual';

// Interfaces
export * from './interfaces/communication_protocol';
export * from './interfaces/concurrent_tool_repository';
export * from './interfaces/tool_search_strategy'; 

// Implementations
export * from './implementations/in_mem_concurrent_tool_repository';
export * from './implementations/tag_search_strategy';

// Plugin System
export * from './plugins/plugin_registry';