// packages/text/src/text_communication_protocol.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { UtcpManual, UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { IUtcpClient } from '@utcp/core/client/utcp_client';
import { OpenApiConverter } from '@utcp/http/openapi_converter'; // We reuse the converter from the http package
import { TextCallTemplate, TextCallTemplateSchema } from '@utcp/text/text_call_template';

/**
 * Communication protocol for reading UTCP manuals from local text files.
 * Supports JSON, YAML, and OpenAPI specifications.
 */
export class TextCommunicationProtocol implements CommunicationProtocol {
  private _logInfo(message: string): void {
    console.log(`[TextCommunicationProtocol] ${message}`);
  }

  private _logError(message: string, error?: any): void {
    console.error(`[TextCommunicationProtocol Error] ${message}`, error);
  }

  public async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    const textCallTemplate = TextCallTemplateSchema.parse(manualCallTemplate);
    // The UtcpClient doesn't have a root_dir, so we resolve from the current working directory.
    // A more advanced implementation might pass a root path from the client config.
    const filePath = path.resolve(process.cwd(), textCallTemplate.file_path);

    this._logInfo(`Reading manual from '${filePath}'`);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileExt = path.extname(filePath).toLowerCase();
      let data: any;

      if (fileExt === '.yaml' || fileExt === '.yml') {
        data = yaml.load(fileContent);
      } else {
        data = JSON.parse(fileContent);
      }

      let utcpManual: UtcpManual;
      if (data && (data.openapi || data.swagger || data.paths)) {
        this._logInfo(`Detected OpenAPI specification in '${filePath}'. Converting...`);
        const converter = new OpenApiConverter(data, {
          specUrl: path.normalize(filePath).toString(),
          callTemplateName: textCallTemplate.name
        });
        utcpManual = converter.convert();
      } else {
        this._logInfo(`Parsing as UTCP manual: '${filePath}'.`);
        utcpManual = UtcpManualSchema.parse(data);
      }
      
      this._logInfo(`Loaded ${utcpManual.tools.length} tools from '${filePath}'`);
      return {
        manualCallTemplate: textCallTemplate,
        manual: utcpManual,
        success: true,
        errors: [],
      };

    } catch (error: any) {
      this._logError(`Failed to register manual from '${filePath}':`, error);
      return {
        manualCallTemplate: textCallTemplate,
        manual: UtcpManualSchema.parse({ tools: [] }),
        success: false,
        errors: [error.message],
      };
    }
  }

  public async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    this._logInfo(`Deregistering text manual '${manualCallTemplate.name}' (no-op).`);
  }

  /**
   * For a 'text' provider, a tool call is not a remote execution.
   * It is defined as returning the raw content of the file specified in the tool's CallTemplate.
   */
  public async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    const textCallTemplate = TextCallTemplateSchema.parse(toolCallTemplate);
    const filePath = path.resolve(process.cwd(), textCallTemplate.file_path);
    this._logInfo(`Reading content from '${filePath}' for tool call '${toolName}'`);
    return fs.readFile(filePath, 'utf-8');
  }

  public async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    const result = await this.callTool(caller, toolName, toolArgs, toolCallTemplate);
    yield result;
  }

  public async close(): Promise<void> {
    this._logInfo("Text Communication Protocol closed (no-op).");
  }
}