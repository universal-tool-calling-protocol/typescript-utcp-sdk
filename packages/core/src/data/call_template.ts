// packages/core/src/data/call_template.ts
import { z } from 'zod';
import { AuthSchema } from '@utcp/core/data/auth'; // Import from @utcp/core alias

/**
 * Base schema for all CallTemplates. Each protocol plugin will extend this.
 * It provides the common fields every call template must have.
 */
export const CallTemplateBaseSchema = z.object({
  name: z.string().optional(),
  call_template_type: z.string()
    .describe('The transport protocol type used by this call template.'),
  auth: AuthSchema.optional(),
}).passthrough();
export type CallTemplateBase = z.infer<typeof CallTemplateBaseSchema>;

// Note: A final discriminated union for CallTemplate (ProviderUnion equivalent)
// will be constructed in the plugin registry, which will gather all
// protocol-specific CallTemplate schemas from plugins. For now, this base is sufficient.