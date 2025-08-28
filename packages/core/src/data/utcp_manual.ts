// packages/core/src/data/utcp_manual.ts
import { z } from 'zod';
import { ToolSchema } from '@utcp/core/data/tool';

const UTCP_PACKAGE_VERSION = process.env.UTCP_CORE_VERSION || '1.0.1';

/**
 * The standard format for tool provider responses during discovery.
 * Represents the complete set of tools available from a provider, along
 * with version information for compatibility checking.
 */
export const UtcpManualSchema = z.object({
  utcp_version: z.string().default(UTCP_PACKAGE_VERSION)
    .describe('UTCP protocol version supported by the provider.'),
  manual_version: z.string().default('1.0.0')
    .describe('Version of this specific manual.'),
  tools: z.array(ToolSchema)
    .describe('List of available tools with their complete configurations.'),
});

export type UtcpManual = z.infer<typeof UtcpManualSchema>;