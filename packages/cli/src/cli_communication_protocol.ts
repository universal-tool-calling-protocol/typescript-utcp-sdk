// packages/cli/src/cli_communication_protocol.ts
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { UtcpManual, UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import { CliCallTemplate, CliCallTemplateSchema } from '@utcp/cli/cli_call_template';
import { spawn, ChildProcess } from 'child_process';
import { clearTimeout } from 'timers';
import { Readable } from 'stream';

/**
 * CLI communication protocol implementation for UTCP client.
 *
 * Handles execution of local command-line tools as UTCP tools.
 * Supports tool discovery by running a command that outputs a UTCP manual,
 * and tool execution by running a command with arguments.
 */
export class CliCommunicationProtocol implements CommunicationProtocol {
  private _logInfo(message: string): void {
    console.log(`[CliCommunicationProtocol] ${message}`);
  }

  private _logError(message: string, error?: any): void {
    console.error(`[CliCommunicationProtocol Error] ${message}`, error);
  }

  /**
   * Executes a command-line program and captures its stdout and stderr.
   * @param command The command to execute, including args as separate elements.
   * @param options Options for `child_process.spawn` (cwd, env, etc.).
   * @param timeoutMs Maximum time to wait for the command to complete.
   * @returns A promise that resolves to an object containing stdout, stderr, and exit code.
   */
  private async _executeCommand(
    command: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
    timeoutMs: number = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    let childProcess: ChildProcess | undefined;
    const commandName = command[0];
    const commandArgs = command.slice(1);

    try {
      const currentProcessEnv = typeof process !== 'undefined' && process.env ? process.env : {};
      const mergedEnv = { ...currentProcessEnv, ...options.env };

      childProcess = spawn(commandName, commandArgs, {
        cwd: options.cwd,
        env: mergedEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      const readStream = async (stream: Readable | null): Promise<string> => {
        if (!stream) return '';
        let buffer = '';
        for await (const chunk of stream) {
          buffer += new TextDecoder().decode(chunk);
        }
        return buffer;
      };

      let stdoutPromise = readStream(childProcess.stdout);
      let stderrPromise = readStream(childProcess.stderr);

      const exitCodePromise = new Promise<number | null>((resolve) => {
        childProcess?.on('close', (code) => resolve(code));
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            childProcess.kill();
          }
          reject(new Error(`Command timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        childProcess?.on('close', () => clearTimeout(id));
        childProcess?.on('error', (err) => { // Also clear timeout on spawn error
          clearTimeout(id);
          reject(err);
        });
      });

      const [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([stdoutPromise, stderrPromise, exitCodePromise]),
        timeoutPromise,
      ]);

      return {
        stdout: stdout as string,
        stderr: stderr as string,
        exitCode: exitCode as number | null,
      };

    } catch (e: any) {
      if (childProcess && !childProcess.killed) {
        childProcess.kill();
      }
      if (e.message.includes('spawn') && e.code === 'ENOENT') {
          const errorMessage = `Command '${commandName}' not found or executable. Check your PATH.`;
          this._logError(errorMessage, e);
          throw new Error(errorMessage);
      }
      this._logError(`Error executing command '${command.join(' ')}':`, e);
      throw e;
    }
  }

  /**
   * Parses a command string into an array of arguments, handling quotes.
   * This is a basic implementation that attempts to be cross-platform compatible
   * but may not cover all edge cases of shell parsing across different OS.
   *
   * @param commandString The full command string (e.g., "ls -l 'my dir'").
   * @returns An array of command and arguments.
   */
  private _parseCommandString(commandString: string): string[] {
    const args: string[] = [];
    let currentArg = '';
    let inQuote: "'" | '"' | false = false;
    let escaped = false;

    for (let i = 0; i < commandString.length; i++) {
      const char = commandString[i];

      if (escaped) {
        currentArg += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (inQuote) {
        if (char === inQuote) {
          inQuote = false;
        } else {
          currentArg += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuote = char;
        } else if (char === ' ') {
          if (currentArg !== '') {
            args.push(currentArg);
            currentArg = '';
          }
        } else {
          currentArg += char;
        }
      }
    }

    if (currentArg !== '') {
      args.push(currentArg);
    }

    if (inQuote) {
      this._logError(`Unmatched quote '${inQuote}' in command string: ${commandString}`);
    }

    return args.filter(arg => arg.length > 0);
  }

  /**
   * Registers a CLI manual by executing a discovery command and parsing its output.
   * The command is expected to print a UTCP Manual JSON to stdout.
   * @param caller The UTCP client instance.
   * @param manualCallTemplate The CLI call template for discovery.
   * @returns A RegisterManualResult object.
   */
  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    const cliCallTemplate = CliCallTemplateSchema.parse(manualCallTemplate);

    this._logInfo(`Registering CLI manual '${cliCallTemplate.name}' using command: '${cliCallTemplate.command_name}'`);

    try {
      const commandArgs = this._parseCommandString(cliCallTemplate.command_name);
      const executionOptions = {
        cwd: cliCallTemplate.cwd,
        env: cliCallTemplate.env,
      };

      const { stdout, stderr, exitCode } = await this._executeCommand(commandArgs, executionOptions);

      if (exitCode !== 0) {
        this._logError(`Discovery command failed for '${cliCallTemplate.name}' with exit code ${exitCode}. Stderr: ${stderr}`);
        return {
          manualCallTemplate: cliCallTemplate,
          manual: UtcpManualSchema.parse({ tools: [] }),
          success: false,
          errors: [`Discovery command failed with exit code ${exitCode}. Stderr: ${stderr.trim()}`],
        };
      }

      let utcpManual: UtcpManual;
      try {
        utcpManual = UtcpManualSchema.parse(JSON.parse(stdout));
        this._logInfo(`Discovered ${utcpManual.tools.length} tools from CLI manual '${cliCallTemplate.name}'.`);
      } catch (parseError: any) {
        this._logError(`Failed to parse UTCP Manual from stdout for '${cliCallTemplate.name}'. Error: ${parseError.message}. Stdout: ${stdout.substring(0, 500)}`);
        return {
          manualCallTemplate: cliCallTemplate,
          manual: UtcpManualSchema.parse({ tools: [] }),
          success: false,
          errors: [`Failed to parse UTCP Manual from discovery command output. Error: ${parseError.message}`],
        };
      }

      return {
        manualCallTemplate: cliCallTemplate,
        manual: utcpManual,
        success: true,
        errors: [],
      };
    } catch (e: any) {
      this._logError(`Error during CLI manual registration for '${cliCallTemplate.name}':`, e);
      return {
        manualCallTemplate: cliCallTemplate,
        manual: UtcpManualSchema.parse({ tools: [] }),
        success: false,
        errors: [e.message || String(e)],
      };
    }
  }

  /**
   * Deregisters a CLI manual. This is a no-op for stateless CLI execution.
   * @param caller The UTCP client instance.
   * @param manualCallTemplate The CLI call template to deregister.
   */
  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering CLI manual '${manualCallTemplate.name}' (no-op).`);
    return Promise.resolve();
  }

  /**
   * Formats tool arguments into command-line arguments.
   * Converts a dictionary of arguments into command-line flags and values.
   * E.g., `{ message: "hello", count: 5, verbose: true }` becomes `["--message", "hello", "--count", "5", "--verbose"]`.
   * @param toolArgs The arguments object for the tool.
   * @returns An array of strings representing command-line arguments.
   */
  private _formatToolArguments(toolArgs: Record<string, any>): string[] {
    const formattedArgs: string[] = [];
    for (const key in toolArgs) {
      if (Object.prototype.hasOwnProperty.call(toolArgs, key)) {
        const value = toolArgs[key];
        if (typeof value === 'boolean') {
          if (value) {
            formattedArgs.push(`--${key}`);
          }
        } else if (Array.isArray(value)) {
          for (const item of value) {
            formattedArgs.push(`--${key}`, String(item));
          }
        } else {
          formattedArgs.push(`--${key}`, String(value));
        }
      }
    }
    return formattedArgs;
  }

  /**
   * Calls a CLI tool by executing its command with arguments.
   * @param caller The UTCP client instance.
   * @param toolName The full namespaced name of the tool.
   * @param toolArgs The arguments for the tool call.
   * @param toolCallTemplate The CLI call template for the tool.
   * @returns The result of the tool call (parsed JSON or raw stdout string).
   */
  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const cliCallTemplate = CliCallTemplateSchema.parse(toolCallTemplate);

    this._logInfo(`Calling CLI tool '${toolName}' using command: '${cliCallTemplate.command_name}' with args: ${JSON.stringify(toolArgs)}`);

    try {
      const baseCommandArgs = this._parseCommandString(cliCallTemplate.command_name);
      const formattedToolArgs = this._formatToolArguments(toolArgs);
      
      const isNodeEvalCommand = baseCommandArgs[0] === 'node' && baseCommandArgs[1] === '-e';
      const fullCommand = isNodeEvalCommand
        ? baseCommandArgs // Node -e commands usually don't take further args this way
        : [...baseCommandArgs, ...cliCallTemplate.args, ...formattedToolArgs];

      const executionOptions = {
        cwd: cliCallTemplate.cwd,
        env: cliCallTemplate.env,
      };

      const { stdout, stderr, exitCode } = await this._executeCommand(fullCommand, executionOptions);

      if (exitCode !== 0) {
        this._logError(`Tool command failed for '${toolName}' with exit code ${exitCode}. Stderr: ${stderr}`);
        throw new Error(`CLI tool '${toolName}' failed with exit code ${exitCode}. Stderr: ${stderr.trim()}`);
      }

      const trimmedStdout = stdout.trim(); // Always trim stdout

      try {
        return JSON.parse(trimmedStdout);
      } catch (parseError) {
        return trimmedStdout;
      }
    } catch (e: any) {
      this._logError(`Error during CLI tool call for '${toolName}':`, e);
      throw e;
    }
  }

  /**
   * Calls a CLI tool streamingly. For simple CLI, this means executing the command once
   * and yielding the complete result as a single chunk.
   * @param caller The UTCP client instance.
   * @param toolName The full namespaced name of the tool.
   * @param toolArgs The arguments for the tool call.
   * @param toolCallTemplate The CLI call template for the tool.
   * @returns An async generator that yields chunks of the tool's response.
   */
  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    this._logInfo(`CLI protocol does not inherently support streaming for '${toolName}'. Fetching full response.`);
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  /**
   * Closes any persistent connections or resources held by the communication protocol.
   * For stateless CLI, this is a no-op.
   */
  public async close(): Promise<void> {
    this._logInfo("CLI Communication Protocol closed (no-op).");
    return Promise.resolve();
  }
}