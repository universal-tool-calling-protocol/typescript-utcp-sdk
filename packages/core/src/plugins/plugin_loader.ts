// packages/core/src/plugins/plugin_loader.ts
import { pluginRegistry } from '@utcp/core/plugins/plugin_registry';

// Core Tool Repository
import { InMemConcurrentToolRepository, InMemConcurrentToolRepositoryConfigSchema, InMemConcurrentToolRepositoryConfig } from '@utcp/core/implementations/in_mem_concurrent_tool_repository';
// Core Search Strategy
import { TagSearchStrategy, TagSearchStrategyConfigSchema, TagSearchStrategyConfig } from '@utcp/core/implementations/tag_search_strategy';
// Core Post Processors
import { FilterDictPostProcessor, FilterDictPostProcessorConfigSchema, FilterDictPostProcessorConfig } from '@utcp/core/implementations/post_processors/filter_dict_post_processor';
import { LimitStringsPostProcessor, LimitStringsPostProcessorConfigSchema, LimitStringsPostProcessorConfig } from '@utcp/core/implementations/post_processors/limit_strings_post_processor';

let corePluginsInitialized = false;

function _registerCorePlugins(): void {
  if (corePluginsInitialized) return; // Prevent re-registration

  // Register Tool Repository Factory and Schema
  pluginRegistry.registerToolRepositoryFactory('in_memory', (config: InMemConcurrentToolRepositoryConfig) => new InMemConcurrentToolRepository(config));
  pluginRegistry.registerToolRepositoryConfigSchema('in_memory', InMemConcurrentToolRepositoryConfigSchema);

  // Register Tool Search Strategy Factory and Schema
  pluginRegistry.registerToolSearchStrategyFactory('tag_and_description_word_match', (config: TagSearchStrategyConfig) => new TagSearchStrategy(config.description_weight, config.tag_weight));
  pluginRegistry.registerToolSearchStrategyConfigSchema('tag_and_description_word_match', TagSearchStrategyConfigSchema);

  // Register Tool Post-Processors Factories and Schemas
  pluginRegistry.registerToolPostProcessorFactory('filter_dict', (config: FilterDictPostProcessorConfig) => new FilterDictPostProcessor(config));
  pluginRegistry.registerToolPostProcessorConfigSchema('filter_dict', FilterDictPostProcessorConfigSchema);

  pluginRegistry.registerToolPostProcessorFactory('limit_strings', (config: LimitStringsPostProcessorConfig) => new LimitStringsPostProcessor(config));
  pluginRegistry.registerToolPostProcessorConfigSchema('limit_strings', LimitStringsPostProcessorConfigSchema);

  // NOTE: For variable loaders and auth types, their schemas/factories
  // are often registered by their communication protocol plugins directly
  // if they are closely coupled, or through a dedicated `registerAuthPlugins()` etc.
  // For now, the `dotenv` variable loader is handled implicitly by `DefaultVariableSubstitutor`'s `_getVariable` method
  // which knows how to parse the `load_variables_from` array directly using its schema.

  corePluginsInitialized = true;
}

/**
 * Ensures that all core UTCP plugins (default repository, search strategy,
 * and post-processors) are registered with the plugin registry.
 * This function should be called once at application startup.
 */
export function ensureCorePluginsInitialized(): void {
    if (!corePluginsInitialized) {
        _registerCorePlugins();
    }
}