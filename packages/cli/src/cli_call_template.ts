// packages/cli/src/cli_call_template.ts
import { z } from 'zod';
import { CallTemplateBaseSchema } from '@utcp/core/data/call_template';

/**
 * Defines a single step in a multi-command CLI execution workflow.
 */
export const CommandStepSchema = z.object({
  /**
   * The command string to execute.
   * - Can contain `UTCP_ARG_argname_UTCP_END` placeholders for argument substitution.
   * - Can reference the output of previous commands using `$CMD_0_OUTPUT`, `$CMD_1_OUTPUT`, etc.
   *   (Note: This syntax is for Bash. For PowerShell, it would be `$env:CMD_0_OUTPUT`).
   *   The communication protocol will handle the correct syntax.
   */
  command: z.string(),

  /**
   * If true, this command's stdout will be included in the final aggregated output.
   * If not specified, it defaults to `false` for all commands except the very last one, which defaults to `true`.
   */
  append_to_final_output: z.boolean().optional(),
});
export type CommandStep = z.infer<typeof CommandStepSchema>;

/**
 * CLI Call Template schema for executing multi-command workflows.
 *
 * This new version aligns with the powerful Python CLI plugin, enabling the execution
 * of multiple commands in a single, stateful subprocess. This is ideal for workflows
 * that require sequential operations, such as changing directories, running build scripts,
 * and analyzing output.
 */
export const CliCallTemplateSchema = CallTemplateBaseSchema.extend({
  call_template_type: z.literal('cli'),
  
  /**
   * A list of CommandStep objects to be executed in sequence.
   * Each command runs in the same shell process, allowing state (like the current directory) to persist.
   */
  commands: z.array(CommandStepSchema).min(1, "At least one command is required."),

  /**
   * The working directory from which to run the commands. If not provided,
   * it defaults to the current process's working directory.
   */
  cwd: z.string().optional().describe('The current working directory for the command process.'),

  /**
   * A dictionary of environment variables to set for the command's execution context.
   * Values can be static strings or use `${VAR_NAME}` syntax for substitution from the UTCP client's configuration.
   */
  env: z.record(z.string(), z.string()).optional().default({}).describe('Additional environment variables for the command process.'),

  /**
   * Authentication is not applicable to the CLI protocol.
   */
  auth: z.undefined().optional(), 
});
export type CliCallTemplate = z.infer<typeof CliCallTemplateSchema>;