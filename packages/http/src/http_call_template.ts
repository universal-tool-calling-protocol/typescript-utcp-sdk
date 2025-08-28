// packages/http/src/http_call_template.ts
import { z } from 'zod';
import { AuthSchema } from '@utcp/core/data/auth';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

/**
 * HTTP Call Template schema for RESTful HTTP/HTTPS API tools.
 * Extends the base CallTemplate and defines HTTP-specific configuration.
 */
export const HttpCallTemplateSchema = CallTemplateBaseSchema.extend({
  call_template_type: z.literal('http'),
  http_method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  url: z.string().describe('The base URL for the HTTP endpoint. Supports path parameters like "https://api.example.com/users/{user_id}".'),
  content_type: z.string().default('application/json').describe('The Content-Type header for requests.'),
  auth: AuthSchema.optional().describe('Optional authentication configuration.'),
  headers: z.record(z.string(), z.string()).optional().describe('Optional static headers to include in all requests.'),
  body_field: z.string().optional().default('body').describe('The name of the single input field to be sent as the request body.'),
  header_fields: z.array(z.string()).optional().describe('List of input fields to be sent as request headers.'),
  timeout: z.number().default(30000).describe('Request timeout in milliseconds.'), // Added this line
});

export type HttpCallTemplate = z.infer<typeof HttpCallTemplateSchema>;