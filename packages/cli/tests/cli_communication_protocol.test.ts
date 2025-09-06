// packages/cli/tests/cli_communication_protocol.test.ts
import { test, expect, describe, beforeAll, afterEach } from "bun:test";
import { CliCommunicationProtocol } from '../src/cli_communication_protocol';
import { CliCallTemplateSchema, CliCallTemplate } from '../src/cli_call_template';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock client for tests
const mockClient = { root_dir: process.cwd() } as IUtcpClient;

describe('CliCommunicationProtocol', () => {
  let cliProtocol: CliCommunicationProtocol;
  let mockCliScriptPath: string;
  let mockCliDiscoveryCommand: string;
  let mockCliExecutionCommand: string; // Base command for tool execution

  beforeAll(async () => {
    cliProtocol = new CliCommunicationProtocol();
    // Path to the mock script
    mockCliScriptPath = path.resolve(import.meta.dir, 'mock_cli_script.ts');
    // For discovery command: use `node` explicitly
    mockCliDiscoveryCommand = `node "${mockCliScriptPath}" --utcp-discover`;
    // For execution command: use `node` explicitly
    mockCliExecutionCommand = `node "${mockCliScriptPath}"`;
  });

  afterEach(async () => {
    // Clean up any files created during tests
    const filesInCwd = await fs.readdir(process.cwd());
    for (const file of filesInCwd) {
      if (file.startsWith('testfile_') || file.startsWith('temp_cwd_for_quoted_cmd')) { // Include cleanup for temp_cwd_for_quoted_cmd
        await fs.unlink(path.join(process.cwd(), file)).catch(() => {});
      }
    }
    await fs.rmdir(path.join(process.cwd(), 'temp_cli_cwd')).catch(() => {}); // Clean up temp_cli_cwd
    await fs.rmdir(path.join(process.cwd(), 'temp_cwd_for_quoted_cmd')).catch(() => {}); // Clean up temp_cwd_for_quoted_cmd dir
  });

  describe('registerManual', () => {
    test('should discover tools from a valid CLI script outputting UTCP Manual', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliDiscoveryCommand,
      });

      const result = await cliProtocol.registerManual(mockClient, callTemplate);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manual).toBeDefined();
      expect(result.manual.tools).toHaveLength(4); // Based on mock_cli_script.ts
      expect(result.manual.tools.map(t => t.name)).toEqual(
        expect.arrayContaining(['echo_cli', 'add_numbers_cli', 'read_env', 'write_file_cli'])
      );
    });

    test('should return an error if discovery command fails', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'failing_cli_manual',
        call_template_type: 'cli',
        command_name: `node "${mockCliScriptPath}" --error`, // Command that exits with error
      });

      const result = await cliProtocol.registerManual(mockClient, callTemplate);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Discovery command failed with exit code 1. Stderr: This is a simulated error from CLI.');
      expect(result.manual.tools).toHaveLength(0);
    });

    test('should return an error if output is not a valid UTCP Manual', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'invalid_output_cli_manual',
        call_template_type: 'cli',
        command_name: 'node -e "process.stdout.write(\'invalid json\')"', // Command outputs non-JSON, ensure no implicit newline
      });

      const result = await cliProtocol.registerManual(mockClient, callTemplate);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to parse UTCP Manual from discovery command output. Error: JSON Parse error: Unexpected identifier "invalid"');
      expect(result.manual.tools).toHaveLength(0);
    });

    test('should handle commands with spaces and quotes in discovery', async () => {
      const echoArgsScriptPath = path.resolve(import.meta.dir, 'echo_args.ts');
      // echo_args.ts has been updated to output an empty manual for --utcp-discover
      await fs.writeFile(echoArgsScriptPath, `
        import * as fs from 'fs/promises';
        import * as path from 'path';

        async function main() {
          const fullArgs = process.argv.slice(2);
          const parsedArgs: Record<string, string | boolean> = {};
          for (let i = 0; i < fullArgs.length; i++) {
            const arg = fullArgs[i];
            if (arg.startsWith('--')) {
              const key = arg.substring(2);
              if (i + 1 < fullArgs.length && !fullArgs[i + 1].startsWith('--')) {
                parsedArgs[key] = fullArgs[++i];
              } else {
                parsedArgs[key] = true;
              }
            }
          }

          if (parsedArgs['utcp-discover']) {
            const manual = {
              utcp_version: "1.0.0",
              manual_version: "1.0.0",
              tools: []
            };
            process.stdout.write(JSON.stringify(manual) + '\\n');
            process.exit(0);
          } else {
            process.stdout.write(JSON.stringify({ args: fullArgs, cwd: process.cwd() }) + '\\n');
            process.exit(0);
          }
        }
        main().catch(console.error);
      `);

      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'quoted_command_manual',
        call_template_type: 'cli',
        command_name: `node "${echoArgsScriptPath}" --utcp-discover 'param with spaces'`,
      });

      try {
        const result = await cliProtocol.registerManual(mockClient, callTemplate);
        expect(result.success).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.manual.tools).toHaveLength(0); // Expect empty manual from echo_args.ts
      } finally {
        await fs.unlink(echoArgsScriptPath).catch(() => {});
      }
    });
  });

  describe('deregisterManual', () => {
    test('should be a no-op and resolve immediately', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'any_manual',
        call_template_type: 'cli',
        command_name: mockCliDiscoveryCommand,
      });

      await expect(cliProtocol.deregisterManual(mockClient, callTemplate)).resolves.toBeUndefined();
    });
  });

  describe('callTool', () => {
    test('should execute tool and return JSON output', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliExecutionCommand,
      });

      const result = await cliProtocol.callTool(mockClient, 'mock_cli_manual.echo_cli', { message: 'Hello CLI' }, callTemplate);

      expect(result).toEqual({ echoed_message: 'Hello CLI' });
    });

    test('should execute tool with numeric arguments and return number output', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliExecutionCommand,
      });

      const result = await cliProtocol.callTool(mockClient, 'mock_cli_manual.add_numbers_cli', { a: 10, b: 5 }, callTemplate);

      expect(result).toEqual({ sum: 15 });
    });

    test('should execute tool with custom environment variables', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliExecutionCommand,
        env: { CUSTOM_VAR: 'my_custom_value', ANOTHER_VAR: 'another_value' },
      });

      const result = await cliProtocol.callTool(mockClient, 'mock_cli_manual.read_env', { var_name: 'CUSTOM_VAR' }, callTemplate);

      expect(result).toEqual({ CUSTOM_VAR: 'my_custom_value' });
    });

    test('should execute tool with custom working directory and write a file', async () => {
      const tempCwd = path.join(import.meta.dir, 'temp_cli_cwd');
      await fs.mkdir(tempCwd, { recursive: true }).catch(() => {});

      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliExecutionCommand,
        cwd: tempCwd,
      });

      const filename = 'testfile_output.txt';
      const content = 'This is content from the CLI tool.';

      const result = await cliProtocol.callTool(mockClient, 'mock_cli_manual.write_file_cli', { filename, content }, callTemplate);

      expect(result).toEqual({ status: `wrote ${filename}` });
      const writtenFilePath = path.join(tempCwd, filename);
      const fileContent = await fs.readFile(writtenFilePath, 'utf-8');
      expect(fileContent).toBe(content);

      await fs.unlink(writtenFilePath);
      await fs.rmdir(tempCwd);
    });

    test('should return raw stdout if output is not JSON', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        // Use a Node.js -e command that outputs plain text and does NOT expect toolArgs.
        // The cli_communication_protocol will detect `-e` and not append toolArgs.
        command_name: `node -e "process.stdout.write('Just some plain text')"` // No newline from `write`
      });

      // Pass empty toolArgs explicitly, as they would be ignored anyway by `node -e`
      const result = await cliProtocol.callTool(mockClient, 'mock_cli_manual.echo_cli', {}, callTemplate);

      expect(result).toBe('Just some plain text');
    });

    test('should throw error if tool command fails', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'failing_cli_manual',
        call_template_type: 'cli',
        command_name: `node "${mockCliScriptPath}" --error`, // Command that exits with error
      });

      await expect(
        cliProtocol.callTool(mockClient, 'failing_cli_manual.echo_cli', { message: 'test' }, callTemplate)
      ).rejects.toThrow('CLI tool \'failing_cli_manual.echo_cli\' failed with exit code 1. Stderr: This is a simulated error from CLI.');
    });

    test('should handle command_name with embedded spaces and quotes for execution', async () => {
        const tempCwd = path.join(import.meta.dir, 'temp_cwd_for_quoted_cmd');
        await fs.mkdir(tempCwd, { recursive: true }).catch(() => {});
        const outputFilePath = path.join(tempCwd, 'output.txt');

        const quotedArgsScriptPath = path.join(tempCwd, 'quoted_args_script.ts');
        await fs.writeFile(quotedArgsScriptPath, `
            import * as fs from 'fs/promises';
            async function main() {
                const args = process.argv.slice(2);
                await fs.writeFile('${outputFilePath}', args.join('|'));
                console.log(JSON.stringify({ status: 'success' }));
            }
            main().catch(console.error);
        `);

        const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
            name: 'quoted_arg_exec_manual',
            call_template_type: 'cli',
            command_name: `node "${quotedArgsScriptPath}" --param1 'value with spaces' --param2 simple`,
            cwd: tempCwd,
        });

        const result = await cliProtocol.callTool(
            mockClient,
            'quoted_arg_exec_manual.echo_cli',
            {},
            callTemplate
        );

        expect(result).toEqual({ status: 'success' });

        const writtenContent = await fs.readFile(outputFilePath, 'utf-8');
        expect(writtenContent).toBe("--param1|value with spaces|--param2|simple");

        await fs.unlink(outputFilePath);
        await fs.unlink(quotedArgsScriptPath);
        await fs.rmdir(tempCwd);
    });
  });

  describe('callToolStreaming', () => {
    test('should call tool and yield single chunk of result', async () => {
      const callTemplate: CliCallTemplate = CliCallTemplateSchema.parse({
        name: 'mock_cli_manual',
        call_template_type: 'cli',
        command_name: mockCliExecutionCommand,
      });

      const stream = cliProtocol.callToolStreaming(mockClient, 'mock_cli_manual.echo_cli', { message: 'Stream Test' }, callTemplate);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ echoed_message: 'Stream Test' });
    });
  });

  describe('close', () => {
    test('should resolve immediately as a no-op', async () => {
      await expect(cliProtocol.close()).resolves.toBeUndefined();
    });
  });
});