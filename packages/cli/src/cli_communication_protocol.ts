// packages/cli/src/cli_communication_protocol.ts
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import { CliCallTemplateSchema, CommandStep } from '@utcp/cli/cli_call_template';
import { spawn, ChildProcess } from 'child_process';
import { clearTimeout } from 'timers';
import { Readable } from 'stream';

/**
 * CLI communication protocol that executes multi-command workflows.
 */
export class CliCommunicationProtocol implements CommunicationProtocol {
  private _logInfo(message: string): void {
    console.log(`[CliCommunicationProtocol] ${message}`);
  }

  private _logError(message: string, error?: any): void {
    console.error(`[CliCommunicationProtocol Error] ${message}`, error);
  }

  private async _executeShellScript(
    script: string,
    options: { cwd?: string; env?: Record<string, string> } = {},
    timeoutMs: number = 60000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/bash';
    const args = isWindows ? ['-NoProfile', '-Command', script] : ['-c', script];
    
    let childProcess: ChildProcess | undefined;

    try {
      const currentProcessEnv = typeof process !== 'undefined' ? process.env : {};
      const mergedEnv = { ...currentProcessEnv, ...options.env };

      childProcess = spawn(shell, args, {
        cwd: options.cwd,
        env: mergedEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const readStream = async (stream: Readable | null): Promise<string> => {
        if (!stream) return '';
        let buffer = '';
        for await (const chunk of stream) {
          buffer += chunk.toString();
        }
        return buffer;
      };

      const stdoutPromise = readStream(childProcess.stdout);
      const stderrPromise = readStream(childProcess.stderr);
      const exitCodePromise = new Promise<number | null>((resolve) => {
        childProcess?.on('close', (code) => resolve(code));
        childProcess?.on('error', () => resolve(1));
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          childProcess?.kill();
          reject(new Error(`Command script timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        childProcess?.on('close', () => clearTimeout(id));
      });

      const [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([stdoutPromise, stderrPromise, exitCodePromise]),
        timeoutPromise,
      ]);

      return { stdout, stderr, exitCode };
    } catch (e: any) {
      childProcess?.kill();
      this._logError(`Error executing shell script:`, e);
      throw e;
    }
  }

  private _substituteUtcpArgs(command: string, toolArgs: Record<string, any>): string {
    const pattern = /UTCP_ARG_([a-zA-Z0-9_]+?)_UTCP_END/g;
    return command.replace(pattern, (match, argName) => {
      if (argName in toolArgs) {
        // Return the raw value. The shell will handle it correctly when it's inside quotes
        // in the final command (e.g., echo "Initial message: Workflow Argument").
        return String(toolArgs[argName]);
      }
      this._logError(`Missing argument '${argName}' for placeholder in command: ${command}`);
      return `MISSING_ARG_${argName}`;
    });
  }
  
  private _buildCombinedShellScript(commands: CommandStep[], toolArgs: Record<string, any>): string {
    const isWindows = process.platform === 'win32';
    const scriptLines: string[] = [];

    if (isWindows) {
      scriptLines.push('$ErrorActionPreference = "Stop"');
    } else {
      scriptLines.push('#!/bin/bash');
      scriptLines.push('set -e');
    }

    commands.forEach((step, i) => {
      let finalCommand = this._substituteUtcpArgs(step.command, toolArgs);

      finalCommand = finalCommand.replace(/\$CMD_(\d+)_OUTPUT/g, (match, indexStr) => {
        const index = parseInt(indexStr, 10);
        if (index < i) {
          // Wrap in quotes for safety in Bash
          return isWindows ? `$CMD_${index}_OUTPUT` : `"$CMD_${index}_OUTPUT"`;
        }
        return match;
      });

      if (finalCommand.trim().startsWith('cd ')) {
        scriptLines.push(finalCommand);
        // Set the output variable to an empty string since `cd` produces no stdout.
        scriptLines.push(isWindows ? `$CMD_${i}_OUTPUT = ""` : `CMD_${i}_OUTPUT=""`);
      } else {
        if (isWindows) {
          scriptLines.push(`$CMD_${i}_OUTPUT = ( ${finalCommand} 2>&1 | Out-String ).Trim()`);
        } else {
          scriptLines.push(`CMD_${i}_OUTPUT=$( ${finalCommand} 2>&1 )`);
        }
      }
    });

    const outputLines: string[] = [];
    commands.forEach((step, i) => {
      const isLastCommand = i === commands.length - 1;
      const shouldAppend = step.append_to_final_output ?? isLastCommand;

      if (shouldAppend) {
        outputLines.push(isWindows ? `$CMD_${i}_OUTPUT` : `echo -n "$CMD_${i}_OUTPUT"`);
      }
    });

    if (isWindows) {
        // Joining with a newline for PowerShell
        scriptLines.push(outputLines.join("\n"));
    } else {
        // Use printf to precisely control newlines in Bash
        scriptLines.push(outputLines.join(" && printf '\\n' && "));
    }

    return scriptLines.join('\n');
  }

  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    const cliCallTemplate = CliCallTemplateSchema.parse(manualCallTemplate);
    this._logInfo(`Registering CLI manual '${cliCallTemplate.name}' by executing discovery command(s).`);

    try {
      const script = this._buildCombinedShellScript(cliCallTemplate.commands, {});
      const { stdout, stderr, exitCode } = await this._executeShellScript(script, {
        cwd: cliCallTemplate.cwd,
        env: cliCallTemplate.env,
      });

      if (exitCode !== 0) {
        throw new Error(`Discovery script failed with exit code ${exitCode}. Stderr: ${stderr.trim()}`);
      }
      
      const utcpManual = UtcpManualSchema.parse(JSON.parse(stdout));
      this._logInfo(`Discovered ${utcpManual.tools.length} tools from CLI manual '${cliCallTemplate.name}'.`);
      
      return { manualCallTemplate: cliCallTemplate, manual: utcpManual, success: true, errors: [] };
    } catch (e: any) {
      this._logError(`Error during CLI manual registration for '${cliCallTemplate.name}':`, e);
      return { manualCallTemplate, manual: UtcpManualSchema.parse({ tools: [] }), success: false, errors: [e.message] };
    }
  }

  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering CLI manual '${manualCallTemplate.name}' (no-op).`);
  }

  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const cliCallTemplate = CliCallTemplateSchema.parse(toolCallTemplate);
    this._logInfo(`Calling CLI tool '${toolName}' by executing multi-command workflow.`);
    
    try {
      const script = this._buildCombinedShellScript(cliCallTemplate.commands, toolArgs);
      const { stdout, stderr, exitCode } = await this._executeShellScript(script, {
        cwd: cliCallTemplate.cwd,
        env: cliCallTemplate.env,
      });

      if (exitCode !== 0) {
        throw new Error(`CLI tool '${toolName}' failed with exit code ${exitCode}. Stderr: ${stderr.trim()}`);
      }

      const trimmedStdout = stdout.trim();
      try {
        return JSON.parse(trimmedStdout);
      } catch {
        return trimmedStdout;
      }
    } catch (e: any) {
      this._logError(`Error during CLI tool call for '${toolName}':`, e);
      throw e;
    }
  }

  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    this._logInfo(`CLI protocol does not support true streaming for '${toolName}'. Yielding full response as a single chunk.`);
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  public async close(): Promise<void> {
    this._logInfo("CLI Communication Protocol closed (no-op).");
  }
}