// packages/core/src/interfaces/tool_post_processor.ts
import { Tool } from '@utcp/core/data/tool';
import { CallTemplateBase } from '@utcp/core/data/call_template';

// Forward declaration for UtcpClient to avoid circular dependency
interface IUtcpClient { }

/**
 * Defines the contract for tool post-processors that can modify the result of a tool call.
 * Implementations can apply transformations, filtering, or other logic to the raw tool output.
 */
export interface ToolPostProcessor {
  /**
   * A string identifying the type of this tool post-processor (e.g., 'filter_dict', 'limit_strings').
   * This is used for configuration and plugin lookup.
   */
  tool_post_processor_type: string;

  /**
   * Processes the result of a tool call.
   *
   * @param caller The UTCP client instance that initiated the tool call.
   * @param tool The Tool object that was called.
   * @param manualCallTemplate The CallTemplateBase object of the manual that owns the tool.
   * @param result The raw result returned by the tool's communication protocol.
   * @returns The processed result.
   */
  postProcess(caller: IUtcpClient, tool: Tool, manualCallTemplate: CallTemplateBase, result: any): any;
}