// packages/core/src/implementations/tag_search_strategy.ts
import { Tool } from '@utcp/core/data/tool';
import { ConcurrentToolRepository } from '@utcp/core/interfaces/concurrent_tool_repository';
import { ToolSearchStrategy } from '@utcp/core/interfaces/tool_search_strategy';
import { z } from 'zod'; // Added zod import


/**
 * Schema for the TagSearchStrategy configuration.
 */
export const TagSearchStrategyConfigSchema = z.object({
  tool_search_strategy_type: z.literal('tag_and_description_word_match'),
  description_weight: z.number().optional().default(1),
  tag_weight: z.number().optional().default(3),
}).passthrough();

export type TagSearchStrategyConfig = z.infer<typeof TagSearchStrategyConfigSchema>;


/**
 * Implements a tool search strategy based on tag and description matching.
 * Tools are scored based on the occurrence of query words in their tags and description.
 */
export class TagSearchStrategy implements ToolSearchStrategy {
  public readonly tool_search_strategy_type: 'tag_and_description_word_match' = 'tag_and_description_word_match';
  private readonly descriptionWeight: number;
  private readonly tagWeight: number;

  /**
   * Creates an instance of TagSearchStrategy.
   *
   * @param descriptionWeight The weight to apply to words found in the tool's description.
   * @param tagWeight The weight to apply to words found in the tool's tags.
   */
  constructor(descriptionWeight: number = 1, tagWeight: number = 3) {
    this.descriptionWeight = descriptionWeight;
    this.tagWeight = tagWeight;
  }

  /**
   * Searches for tools by matching tags and description content against a query.
   *
   * @param concurrentToolRepository The repository to search for tools.
   * @param query The search query string.
   * @param limit The maximum number of tools to return. If 0, all matched tools are returned.
   * @param anyOfTagsRequired Optional list of tags where one of them must be present in the tool's tags.
   * @returns A promise that resolves to a list of tools ordered by relevance.
   */
  public async searchTools(
    concurrentToolRepository: ConcurrentToolRepository,
    query: string,
    limit: number = 10,
    anyOfTagsRequired?: string[]
  ): Promise<Tool[]> {
    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.match(/\w+/g) || []);

    let tools = await concurrentToolRepository.getTools();

    if (anyOfTagsRequired && anyOfTagsRequired.length > 0) {
      const requiredTagsLower = new Set(anyOfTagsRequired.map(tag => tag.toLowerCase()));
      tools = tools.filter(tool =>
        tool.tags && tool.tags.some(tag => requiredTagsLower.has(tag.toLowerCase()))
      );
    }

    const toolScores = tools.map(tool => {
      let score = 0.0;

      if (tool.tags) {
        for (const tag of tool.tags) {
          const tagLower = tag.toLowerCase();
          if (queryLower.includes(tagLower) || tagLower.includes(queryLower)) {
            score += this.tagWeight;
          }

          const tagWords = new Set(tagLower.match(/\w+/g) || []);
          for (const word of tagWords) {
            if (queryWords.has(word)) {
              score += this.tagWeight * 0.5;
            }
          }
        }
      }

      if (tool.description) {
        const descriptionWords = new Set(
          tool.description.toLowerCase().match(/\w+/g) || []
        );
        for (const word of descriptionWords) {
          if (queryWords.has(word) && word.length > 2) {
            score += this.descriptionWeight;
          }
        }
      }

      return { tool, score };
    });

    const sortedTools = toolScores
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0)
      .map(item => item.tool);

    return limit > 0 ? sortedTools.slice(0, limit) : sortedTools;
  }
}