// tests/simple.test.ts (replace existing test file content)
import { test, expect, beforeAll, beforeEach, afterEach, describe } from "bun:test";
import { UtcpClient, IUtcpClient } from '@utcp/core';
import { HttpCallTemplate } from '@utcp/http/http_call_template';
import { registerHttpPlugin } from '@utcp/http';
import { CommunicationProtocol, RegisterManualResult } from '@utcp/core/interfaces/communication_protocol';
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { UtcpManualSchema } from '@utcp/core/data/utcp_manual';
import { OpenApiConverter } from '@utcp/http/openapi_converter';  
import { pluginRegistry } from '@utcp/core/plugins/plugin_registry';

// Mock CommunicationProtocol implementation for testing
class MockHttpCommunicationProtocol implements CommunicationProtocol {
  private manualToReturn: RegisterManualResult | null = null;
  private callToolResult: any = null;
  private streamingResults: any[] = [];

  public setManualResponse(manual: any, success: boolean = true, errors: string[] = []): void {
    const manualCallTemplate: HttpCallTemplate = {
      name: manual.name || 'mock_manual',
      call_template_type: 'http',
      http_method: 'GET',
      url: 'http://mock.url/manual',
      content_type: 'application/json'
    };
    this.manualToReturn = {
      manualCallTemplate: manualCallTemplate,
      manual: UtcpManualSchema.parse(manual),
      success,
      errors
    };
  }

  public setCallToolResult(result: any): void {
    this.callToolResult = result;
  }

  public setCallToolStreamingResults(results: any[]): void {
    this.streamingResults = results;
  }

  async registerManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<RegisterManualResult> {
    if (!this.manualToReturn) {
      throw new Error('Mock registerManual response not set.');
    }
    return {
        ...this.manualToReturn,
        manualCallTemplate: manualCallTemplate,
        manual: {
            ...this.manualToReturn.manual,
            tools: this.manualToReturn.manual.tools.map(tool => ({
                ...tool,
                tool_call_template: manualCallTemplate
            }))
        }
    };
  }

  async deregisterManual(caller: IUtcpClient, manualCallTemplate: CallTemplateBase): Promise<void> {
    return Promise.resolve();
  }

  async callTool(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): Promise<any> {
    return Promise.resolve(this.callToolResult);
  }

  async *callToolStreaming(caller: IUtcpClient, toolName: string, toolArgs: Record<string, any>, toolCallTemplate: CallTemplateBase): AsyncGenerator<any, void, unknown> {
    for (const item of this.streamingResults) {
      yield item;
    }
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

beforeAll(() => {
  registerHttpPlugin();
});

describe('UtcpClient with Mocked HTTP Plugin', () => {
  let client: UtcpClient;
  let mockHttpProtocol: MockHttpCommunicationProtocol;

  beforeEach(async () => {
    mockHttpProtocol = new MockHttpCommunicationProtocol();
    pluginRegistry.setCommProtocol('http', mockHttpProtocol);
    
    client = await UtcpClient.create({});
  });

  afterEach(async () => {
    await client.close();
    // Optionally, reset the pluginRegistry to its original state if other tests expect it
    // Or simply rely on each test to set its own mocks.
  });

  test('should register an HTTP manual via mock and call a tool', async () => {
    const manualName = 'test_http_manual';
    const toolName = `${manualName}.echo_tool`;
    
    // --- Setup Mock Response for Discovery ---
    const mockUtcpManualContent = {
      utcp_version: '1.0.1',
      manual_version: '1.0.0',
      tools: [
        {
          name: 'echo_tool',
          description: 'Echoes back the input.',
          inputs: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
          outputs: {
            type: 'object',
            properties: { echoed: { type: 'string' } },
          },
          tags: ['utility'],
          // tool_call_template won't matter here since the mock protocol handles the 'callTool' directly
          tool_call_template: {
            name: manualName,
            call_template_type: 'http',
            http_method: 'POST',
            url: 'http://mock.url/echo',
            content_type: 'application/json',
            body_field: 'body'
          },
        },
      ],
    };
    mockHttpProtocol.setManualResponse(mockUtcpManualContent);
    
    // --- Register the manual ---
    const httpManualCallTemplate: HttpCallTemplate = {
      name: manualName,
      call_template_type: 'http',
      http_method: 'GET',
      url: 'http://mock.url/manual',
      content_type: 'application/json'
    };

    const registerResult = await client.registerManual(httpManualCallTemplate);

    expect(registerResult.success).toBeTrue();
    expect(registerResult.manual.tools).toHaveLength(1);
    expect(registerResult.manual.tools[0]?.name).toBe(toolName);

    // --- Setup Mock Response for Tool Execution ---
    const expectedMessage = 'Hello UTCP!';
    const expectedResponse = { echoed: expectedMessage };
    mockHttpProtocol.setCallToolResult(expectedResponse);

    // --- Call the tool ---
    const toolArguments = { body: { message: expectedMessage } };
    const result = await client.callTool(toolName, toolArguments);

    expect(result).toEqual(expectedResponse);
  });
  
  test('should register an HTTP manual from an OpenAPI spec via mock', async () => {
    const manualName = 'openapi_manual';
    const toolName = `${manualName}.list_pets`; 
    
    // --- Setup Mock OpenAPI Spec Content ---
    const mockOpenApiSpecContent = {
      openapi: '3.0.0',
      info: { title: 'Pet Store API', version: '1.0.0' },
      paths: {
        '/pets': {
          get: {
            operationId: 'list_pets',
            summary: 'List all pets',
            responses: {
              '200': {
                description: 'A list of pets',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // --- IMPORTANT: Manually convert the OpenAPI spec to a UTCP Manual for the mock ---
    // This simulates what the *real* HttpCommunicationProtocol's registerManual would do internally
    // when it detects an OpenAPI spec.
    const converter = new (await import('@utcp/http/openapi_converter.js')).OpenApiConverter(mockOpenApiSpecContent, {
        specUrl: 'http://mock.url/openapi-spec',
        callTemplateName: manualName
    });
    const convertedManual = converter.convert();
    
    // --- Setup Mock Response for Discovery with the converted manual ---
    mockHttpProtocol.setManualResponse({
        ...convertedManual,
        name: manualName, // Ensure manual name is set for consistency
    });

    // --- Register the manual (OpenAPI spec) ---
    const openApiManualCallTemplate: HttpCallTemplate = {
      name: manualName,
      call_template_type: 'http',
      http_method: 'GET',
      url: 'http://mock.url/openapi-spec',
      content_type: 'application/json'
    };

    const registerResult = await client.registerManual(openApiManualCallTemplate);

    expect(registerResult.success).toBeTrue();
    expect(registerResult.manual.tools).toHaveLength(1);
    expect(registerResult.manual.tools[0]?.name).toBe(toolName);
    expect(registerResult.manual.tools[0]?.description).toBe('List all pets');
    
    // --- Setup Mock Response for Tool Execution ---
    const expectedPetsResponse = [{ id: 1, name: 'Fido' }, { id: 2, name: 'Whiskers' }];
    mockHttpProtocol.setCallToolResult(expectedPetsResponse);

    // --- Call the OpenAPI-derived tool ---
    const result = await client.callTool(toolName, {});
    
    expect(result).toEqual(expectedPetsResponse);
  });
});