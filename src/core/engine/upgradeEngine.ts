import type { BaseFastFoodProvider } from '../providers/baseProvider';
import type { MenuItem } from '../types/provider';
import type { Recommendation } from '../types/optimizer';

export interface UpgradeContext {
  provider: BaseFastFoodProvider;
  rawWishlistCounts: Record<string, number>;
  requiredAtomicUnits: Record<string, number>;
  allItems: MenuItem[];
}

export abstract class BaseUpgradeRule {
  abstract id: string;
  abstract name: string;
  abstract evaluate(context: UpgradeContext): Recommendation[];
}

/**
 * Provider-agnostic upgrade / upsize engine.
 *
 * **Default path:** `BasketOptimizer` uses menu-discovered packs (unit keys only).
 * **Brand-specific path:** a plugin may `UpgradeEngine.registerRule(...)` for chain-only
 * heuristics (rare). Prefer fixing `atomicUnits` in the live adapter first.
 */
export class UpgradeEngine {
  private static rules: BaseUpgradeRule[] = [];

  static registerRule(rule: BaseUpgradeRule) {
    this.rules.push(rule);
  }

  static clearRules() {
    this.rules = [];
  }

  static evaluateUpgrades(context: UpgradeContext): Recommendation[] {
    const recommendations: Recommendation[] = [];
    this.rules.forEach((rule) => {
      try {
        const results = rule.evaluate(context);
        recommendations.push(...results);
      } catch (e) {
        console.warn(`Error evaluating upgrade rule ${rule.id}:`, e);
      }
    });
    return recommendations;
  }
}
