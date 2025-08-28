// packages/core/src/interfaces/tool_repository.ts
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { Tool } from '@utcp/core/data/tool';
import { UtcpManual } from '@utcp/core/data/utcp_manual'; // Added UtcpManual for getManual method

/**
 * Defines the contract for tool repositories that store and manage UTCP tools
 * and their associated call templates.
 *
 * Repositories are responsible for:
 * - Persisting call template configurations and their associated tools
 * - Providing efficient lookup and retrieval operations
 * - Managing relationships between call templates and tools
 * - Ensuring data consistency and thread safety (though in JS/TS, "thread safety"
 *   often translates to careful async programming and immutable data structures).
 */
export interface ToolRepository {
  /**
   * Saves a manual's call template and its associated tools in the repository.
   * This operation replaces any existing manual with the same name.
   *
   * @param manualCallTemplate The call template associated with the manual to save.
   * @param manual The complete UTCP Manual object to save.
   */
  saveManual(manualCallTemplate: CallTemplateBase, manual: UtcpManual): Promise<void>;

  /**
   * Removes a manual and its tools from the repository.
   *
   * @param manualName The name of the manual (which corresponds to the CallTemplate name) to remove.
   * @returns True if the manual was removed, False otherwise.
   */
  removeManual(manualName: string): Promise<boolean>;

  /**
   * Removes a specific tool from the repository.
   *
   * @param toolName The full namespaced name of the tool to remove (e.g., "my_manual.my_tool").
   * @returns True if the tool was removed, False otherwise.
   */
  removeTool(toolName: string): Promise<boolean>;

  /**
   * Retrieves a tool by its full namespaced name.
   *
   * @param toolName The full namespaced name of the tool to retrieve.
   * @returns The tool if found, otherwise undefined.
   */
  getTool(toolName: string): Promise<Tool | undefined>;

  /**
   * Retrieves all tools from the repository.
   *
   * @returns A list of all registered tools.
   */
  getTools(): Promise<Tool[]>;

  /**
   * Retrieves all tools associated with a specific manual.
   *
   * @param manualName The name of the manual.
   * @returns A list of tools associated with the manual, or undefined if the manual is not found.
   */
  getToolsByManual(manualName: string): Promise<Tool[] | undefined>;

  /**
   * Retrieves a complete UTCP Manual object by its name.
   *
   * @param manualName The name of the manual to retrieve.
   * @returns The manual if found, otherwise undefined.
   */
  getManual(manualName: string): Promise<UtcpManual | undefined>;

  /**
   * Retrieves all registered manuals from the repository.
   *
   * @returns A list of all registered UtcpManual objects.
   */
  getManuals(): Promise<UtcpManual[]>;

  /**
   * Retrieves a manual's CallTemplate by its name.
   *
   * @param manualCallTemplateName The name of the manual's CallTemplate to retrieve.
   * @returns The CallTemplate if found, otherwise undefined.
   */
  getManualCallTemplate(manualCallTemplateName: string): Promise<CallTemplateBase | undefined>;

  /**
   * Retrieves all registered manual CallTemplates from the repository.
   *
   * @returns A list of all registered CallTemplateBase objects.
   */
  getManualCallTemplates(): Promise<CallTemplateBase[]>;
}