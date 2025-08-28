import { z } from 'zod';
/**
 * Text Call Template schema for text file-based manuals and tools.
 * Reads UTCP manuals or tool definitions from local JSON/YAML files.
 */
export declare const TextCallTemplateSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    call_template_type: z.ZodLiteral<"text">;
    file_path: z.ZodString;
    auth: z.ZodDefault<z.ZodOptional<z.ZodNull>>;
}, z.core.$strip>;
export type TextCallTemplate = z.infer<typeof TextCallTemplateSchema>;
