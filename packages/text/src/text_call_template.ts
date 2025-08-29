// packages/text/src/text_call_template.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

/**
 * Text Call Template schema for text file-based manuals and tools.
 * Reads UTCP manuals or tool definitions from local JSON/YAML files.
 */
export const TextCallTemplateSchema = CallTemplateBaseSchema.extend({
  call_template_type: z.literal('text'),
  file_path: z.string().describe('The path to the file containing the UTCP manual or tool definitions.'),
  auth: z.undefined().optional(),
});

export type TextCallTemplate = z.infer<typeof TextCallTemplateSchema>;