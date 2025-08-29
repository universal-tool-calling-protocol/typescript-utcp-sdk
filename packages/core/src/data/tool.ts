// packages/core/src/data/tool.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

// Define a recursive type for basic JSON values
// This is necessary to correctly type the recursive schema below
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export const JsonTypeSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), JsonTypeSchema),
  z.array(JsonTypeSchema),
]));
export type JsonType = z.infer<typeof JsonTypeSchema>;


/**
 * Interface for a JSON Schema definition.
 * We define this interface explicitly without directly inferring from ZodSchema
 * to break the circular type reference.
 */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | string[];
  properties?: { [key: string]: JsonSchema };
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  enum?: JsonType[];
  const?: JsonType;
  default?: JsonType;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  // Allow arbitrary additional fields
  [k: string]: unknown;
}


/**
 * Zod schema for JSON Schema definition.
 * This is used for defining the structure of tool inputs and outputs.
 * It's a recursive schema, so `z.lazy` is used for `properties`, `items`, and `additionalProperties`.
 *
 * We define the Zod schema separately and then export it,
 * explicitly telling Zod to conform to the `JsonSchema` interface.
 */
export const JsonSchemaZodSchema: z.ZodType<JsonSchema> = z.lazy(() => z.object({
  $schema: z.string().optional().describe('JSON Schema version URI.'),
  $id: z.string().optional().describe('A URI for the schema.'),
  title: z.string().optional().describe('A short explanation about the purpose of the data described by this schema.'),
  description: z.string().optional().describe('A more lengthy explanation about the purpose of the data described by this schema.'),
  type: z.union([
    z.literal('string'), z.literal('number'), z.literal('integer'), z.literal('boolean'),
    z.literal('object'), z.literal('array'), z.literal('null'), z.array(z.string())
  ]).optional(),
  properties: z.record(z.string(), z.lazy(() => JsonSchemaZodSchema)).optional(),
  items: z.union([z.lazy(() => JsonSchemaZodSchema), z.array(z.lazy(() => JsonSchemaZodSchema))]).optional(),
  required: z.array(z.string()).optional(),
  enum: z.array(JsonTypeSchema).optional(),
  const: JsonTypeSchema.optional(),
  default: JsonTypeSchema.optional(),
  format: z.string().optional(),
  additionalProperties: z.union([z.boolean(), z.lazy(() => JsonSchemaZodSchema)]).optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
}).catchall(z.unknown()));


/**
 * Zod schema for a UTCP Tool.
 * Defines a callable tool with its metadata, input/output schemas,
 * and associated call template.
 */
export const ToolSchema = z.object({
  name: z.string().describe('Unique identifier for the tool.'),
  description: z.string().default('').describe('Human-readable description of what the tool does.'),
  inputs: JsonSchemaZodSchema.default({}).describe('JSON Schema defining the tool\'s input parameters.'),
  outputs: JsonSchemaZodSchema.default({}).describe('JSON Schema defining the tool\'s return value structure.'),
  tags: z.array(z.string()).default([]).describe('List of tags for categorization and search.'),
  average_response_size: z.number().optional().describe('Optional hint about typical response size in bytes.'),
  tool_call_template: CallTemplateBaseSchema.describe('CallTemplate configuration for accessing this tool.'),
});
export type Tool = z.infer<typeof ToolSchema>;