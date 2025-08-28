// packages/core/src/interfaces/tool_search_strategy.ts
import { Tool } from '@utcp/core/data/tool';
import { ToolRepository } from '@utcp/core/interfaces/tool_repository';

/**
 * Defines the contract for tool search strategies that can be plugged into
 * the UTCP client. Different implementations can provide various search
 * algorithms such as tag-based matching, semantic similarity, or keyword
 * search.
 */
export interface ToolSearchStrategy {
  /**
   * Searches for tools relevant to the query within a given tool repository.
   *
   * @param toolRepository The tool repository to search within.
   * @param query The search query string.
   * @param limit Maximum number of tools to return. Use 0 for no limit.
   * @param anyOfTagsRequired Optional list of tags where one of them must be present in the tool's tags.
   * @returns List of Tool objects ranked by relevance, limited to the specified count.
   */
  searchTools(
    toolRepository: ToolRepository,
    query: string,
    limit?: number,
    anyOfTagsRequired?: string[]
  ): Promise<Tool[]>;
}