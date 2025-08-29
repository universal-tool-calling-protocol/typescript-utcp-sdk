// packages/core/src/implementations/in_mem_tool_repository.ts
import { CallTemplateBase } from '@utcp/core/data/call_template';
import { Tool } from '@utcp/core/data/tool';
import { UtcpManual } from '@utcp/core/data/utcp_manual';
import { ToolRepository } from '@utcp/core/interfaces/tool_repository';

/**
 * An in-memory implementation of the ToolRepository.
 * Stores tools, manuals, and manual call templates in local maps.
 * All data is lost when the application restarts.
 */
export class InMemToolRepository implements ToolRepository {
  // Maps toolName (namespaced) to Tool object
  private _toolsByName: Map<string, Tool> = new Map();
  // Maps manualName to UtcpManual object
  private _manuals: Map<string, UtcpManual> = new Map();
  // Maps manualName to CallTemplateBase object
  private _manualCallTemplates: Map<string, CallTemplateBase> = new Map();

  /**
   * Saves a manual's call template and its associated tools in the repository.
   * This operation replaces any existing manual with the same name.
   * @param manualCallTemplate The call template associated with the manual to save.
   * @param manual The complete UTCP Manual object to save.
   */
  public async saveManual(manualCallTemplate: CallTemplateBase, manual: UtcpManual): Promise<void> {
    const manualName = manualCallTemplate.name!; 

    // Remove old tools associated with this manual
    const oldManual = this._manuals.get(manualName);
    if (oldManual) {
      for (const tool of oldManual.tools) {
        this._toolsByName.delete(tool.name);
      }
    }

    // Save/replace manual and its call template
    this._manualCallTemplates.set(manualName, manualCallTemplate);
    this._manuals.set(manualName, manual);

    // Index tools globally by name
    for (const tool of manual.tools) {
      this._toolsByName.set(tool.name, tool);
    }
    return Promise.resolve();
  }

  /**
   * Removes a manual and its tools from the repository.
   * @param manualName The name of the manual to remove.
   * @returns True if the manual was removed, False otherwise.
   */
  public async removeManual(manualName: string): Promise<boolean> {
    const oldManual = this._manuals.get(manualName);
    if (!oldManual) {
      return false; // Manual not found
    }

    // Remove tools associated with this manual
    for (const tool of oldManual.tools) {
      this._toolsByName.delete(tool.name);
    }

    // Remove manual and its call template
    this._manuals.delete(manualName);
    this._manualCallTemplates.delete(manualName);
    return true;
  }

  /**
   * Removes a specific tool from the repository.
   * Note: This also attempts to remove the tool from any associated manual.
   * @param toolName The full namespaced name of the tool to remove.
   * @returns True if the tool was removed, False otherwise.
   */
  public async removeTool(toolName: string): Promise<boolean> {
    const toolRemoved = this._toolsByName.delete(toolName);
    if (!toolRemoved) {
      return false; // Tool not found
    }

    // Also remove from the associated manual's list of tools
    const manualName = toolName.split('.')[0];
    if (manualName) {
      const manual = this._manuals.get(manualName);
      if (manual) {
        manual.tools = manual.tools.filter(t => t.name !== toolName);
        // If the manual becomes empty, consider removing it? (Optional logic)
        // if (manual.tools.length === 0) {
        //   this.removeManual(manualName);
        // }
      }
    }
    return true;
  }

  /**
   * Retrieves a tool by its full namespaced name.
   * @param toolName The full namespaced name of the tool to retrieve.
   * @returns The tool if found, otherwise undefined.
   */
  public async getTool(toolName: string): Promise<Tool | undefined> {
    return this._toolsByName.get(toolName);
  }

  /**
   * Retrieves all tools from the repository.
   * @returns A list of all registered tools.
   */
  public async getTools(): Promise<Tool[]> {
    return Array.from(this._toolsByName.values());
  }

  /**
   * Retrieves all tools associated with a specific manual.
   * @param manualName The name of the manual.
   * @returns A list of tools associated with the manual, or undefined if the manual is not found.
   */
  public async getToolsByManual(manualName: string): Promise<Tool[] | undefined> {
    return this._manuals.get(manualName)?.tools;
  }

  /**
   * Retrieves a complete UTCP Manual object by its name.
   * @param manualName The name of the manual to retrieve.
   * @returns The manual if found, otherwise undefined.
   */
  public async getManual(manualName: string): Promise<UtcpManual | undefined> {
    return this._manuals.get(manualName);
  }

  /**
   * Retrieves all registered manuals from the repository.
   * @returns A list of all registered UtcpManual objects.
   */
  public async getManuals(): Promise<UtcpManual[]> {
    return Array.from(this._manuals.values());
  }

  /**
   * Retrieves a manual's CallTemplate by its name.
   * @param manualCallTemplateName The name of the manual's CallTemplate to retrieve.
   * @returns The CallTemplate if found, otherwise undefined.
   */
  public async getManualCallTemplate(manualCallTemplateName: string): Promise<CallTemplateBase | undefined> {
    return this._manualCallTemplates.get(manualCallTemplateName);
  }

  /**
   * Retrieves all registered manual CallTemplates from the repository.
   * @returns A list of all registered CallTemplateBase objects.
   */
  public async getManualCallTemplates(): Promise<CallTemplateBase[]> {
    return Array.from(this._manualCallTemplates.values());
  }
}