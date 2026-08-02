import { BaseFastFoodProvider } from './baseProvider';
import { extractPlugin, type ProviderPlugin } from './plugin';
import { MenuSyncService } from '../services/menuSyncService';
import { StoreSearchService } from '../services/storeSearchService';
import { PassthroughNormalizer } from '../normalizers/passthroughNormalizer';

/**
 * Eagerly load every provider folder that exports a `plugin` (or default export).
 * Pattern: src/core/providers/<slug>/index.ts
 */
const discoveredModules = import.meta.glob('./*/index.ts', { eager: true });

class ProviderRegistry {
  private providers: Map<string, BaseFastFoodProvider> = new Map();
  private plugins: Map<string, ProviderPlugin> = new Map();

  constructor() {
    this.discoverAndRegister();
  }

  private discoverAndRegister() {
    const entries = Object.entries(discoveredModules);
    if (entries.length === 0) {
      console.warn('[ProviderRegistry] No provider folders discovered under providers/*/index.ts');
      return;
    }

    for (const [path, mod] of entries) {
      const plugin = extractPlugin(mod);
      if (!plugin) {
        continue;
      }
      try {
        this.registerPlugin(plugin);
      } catch (err) {
        console.error(`[ProviderRegistry] Failed to register plugin from ${path}:`, err);
      }
    }

    if (this.providers.size === 0) {
      console.warn('[ProviderRegistry] Discovery finished but no plugins registered.');
    } else {
      console.info(
        `[ProviderRegistry] Loaded ${this.providers.size} provider(s):`,
        this.getAllProviders()
          .map((p) => p.id)
          .join(', ')
      );
    }
  }

  /**
   * Full plugin registration: provider UI + menu sync + store directory
   */
  registerPlugin(plugin: ProviderPlugin) {
    if (this.providers.has(plugin.id)) {
      console.warn(`[ProviderRegistry] Provider "${plugin.id}" already registered — overwriting.`);
    }

    if (plugin.daypartConfig) {
      plugin.provider.setDaypartConfig(plugin.daypartConfig);
    }
    this.providers.set(plugin.id, plugin.provider);
    this.plugins.set(plugin.id, plugin);

    const normalizer =
      plugin.normalizer ??
      new PassthroughNormalizer(plugin.id, plugin.defaultData.name, plugin.defaultData);

    MenuSyncService.registerProvider(
      plugin.id,
      normalizer,
      plugin.syncEndpoint,
      plugin.defaultData,
      plugin.menuStrategy
    );

    // Stores: online endpoint preferred; seed only when no endpoint (tests/local)
    StoreSearchService.registerProvider(plugin.id, {
      storesEndpoint: plugin.storesEndpoint,
      seedStores: plugin.storesEndpoint ? undefined : plugin.stores,
    });
  }

  register(provider: BaseFastFoodProvider) {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): BaseFastFoodProvider | undefined {
    return this.providers.get(id);
  }

  getPlugin(id: string): ProviderPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllProviders(): BaseFastFoodProvider[] {
    return Array.from(this.providers.values());
  }

  getAllPlugins(): ProviderPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const providerRegistry = new ProviderRegistry();
