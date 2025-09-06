// packages/cli/src/cli_call_template.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

/**
 * CLI Call Template schema for command-line tools.
 * Defines configuration for executing local command-line programs.
 */
export const CliCallTemplateSchema = CallTemplateBaseSchema.extend({
  call_template_type: z.literal('cli'),
  command_name: z.string().describe('The command to execute (e.g., "ls", "bun run my_script.ts"). This string will be parsed into command and arguments.'),
  args: z.array(z.string()).optional().default([]).describe('Additional fixed arguments to pass to the command after parsing `command_name`.'),
  cwd: z.string().optional().describe('The current working directory for the command process.'),
  env: z.record(z.string(), z.string()).optional().default({}).describe('Additional environment variables for the command process.'),
  auth: z.undefined().optional(), 
});

export type CliCallTemplate = z.infer<typeof CliCallTemplateSchema>;