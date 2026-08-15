import { BaseFastFoodProvider, isCampaignPricedName } from '../providers/baseProvider';
import type { MenuItem } from '../types/provider';
import type { OptimizationResult, OptimisedBundle, Recommendation, WishlistItem } from '../types/optimizer';
import { UserRewardsService } from '../services/userRewardsService';

/** Pure pack for one unit kind (e.g. 2 / 3 / 8 Hot Wings). */
type PurePack = { item: MenuItem; size: number; price: number };

/**
 * Min-cost way to cover at least `need` units using pure packs (unbounded knapsack).
 * Allows slight overshoot when a larger pack is cheaper overall.
 */
function minCostCoverPacks(
  need: number,
  packs: PurePack[]
): { cost: number; picks: { item: MenuItem; count: number }[] } | null {
  if (need <= 0 || packs.length === 0) return null;
  const maxSize = Math.max(...packs.map((p) => p.size));
  const limit = need + maxSize; // room to overshoot
  const INF = 1e15;
  const dp = new Array(limit + 1).fill(INF);
  const choice: Array<{ packIdx: number; prev: number } | null> = new Array(limit + 1).fill(null);
  dp[0] = 0;

  for (let k = 0; k <= limit; k++) {
    if (dp[k] >= INF) continue;
    for (let pi = 0; pi < packs.length; pi++) {
      const p = packs[pi];
      const nk = k + p.size;
      if (nk > limit) continue;
      const nc = dp[k] + p.price;
      if (nc + 1e-9 < dp[nk]) {
        dp[nk] = nc;
        choice[nk] = { packIdx: pi, prev: k };
      }
    }
  }

  let bestK = -1;
  let bestCost = INF;
  for (let k = need; k <= limit; k++) {
    if (dp[k] + 1e-9 < bestCost) {
      bestCost = dp[k];
      bestK = k;
    }
  }
  if (bestK < 0 || bestCost >= INF) return null;

  const counts = new Map<string, { item: MenuItem; count: number }>();
  let cur = bestK;
  while (cur > 0 && choice[cur]) {
    const ch = choice[cur]!;
    const pack = packs[ch.packIdx];
    const prev = counts.get(pack.item.id);
    if (prev) prev.count += 1;
    else counts.set(pack.item.id, { item: pack.item, count: 1 });
    cur = ch.prev;
  }

  return {
    cost: Math.round(bestCost * 100) / 100,
    picks: [...counts.values()],
  };
}

function purePacksForUnit(allItems: MenuItem[], unitKey: string): PurePack[] {
  const packs: PurePack[] = [];
  for (const i of allItems) {
    if (!i.atomicUnits || i.price <= 0) continue;
    // API-only offer SKUs (“20 Hot Wings for £7.99”) — not in app browse
    if (isCampaignPricedName(i.name)) continue;
    // Pure single-kind packs only (Mode 2 selectable packs + mis-tagged combos)
    const keys = Object.keys(i.atomicUnits);
    if (keys.length !== 1 || keys[0] !== unitKey) continue;
    const size = i.atomicUnits[unitKey] || 0;
    if (size <= 0) continue;
    // Skip multi-part meal names even if unit map is incomplete
    if (i.isCombo && /\b(meal|box meal|bucket|feast|banquet|dine for)\b/i.test(i.name)) continue;
    packs.push({ item: i, size, price: i.price });
  }
  // Prefer cheaper packs of same size
  packs.sort((a, b) => a.size - b.size || a.price - b.price);
  // Deduplicate by size: keep cheapest for each size
  const bySize = new Map<number, PurePack>();
  for (const p of packs) {
    const prev = bySize.get(p.size);
    if (!prev || p.price < prev.price) bySize.set(p.size, p);
  }
  return [...bySize.values()].sort((a, b) => a.size - b.size);
}

export class BasketOptimizer {
  static optimizeBasket(
    provider: BaseFastFoodProvider,
    wishlist: WishlistItem[],
    locationTierId: string = 'standard'
  ): OptimizationResult {
    const allItems = provider.getItems(locationTierId);

    // 1. Original wishlist total
    let originalAlaCarteTotal = 0;
    const rawWishlistCounts: Record<string, number> = {};
    wishlist.forEach((w) => {
      if (w.count > 0) {
        rawWishlistCounts[w.itemId] = (rawWishlistCounts[w.itemId] || 0) + w.count;
        const item = allItems.find((i) => i.id === w.itemId);
        if (item) originalAlaCarteTotal += item.price * w.count;
      }
    });
    originalAlaCarteTotal = Math.round(originalAlaCarteTotal * 100) / 100;

    // 2. Atomic demand
    const requiredAtomicUnits: Record<string, number> = {};
    Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return;
      if (item.atomicUnits && Object.keys(item.atomicUnits).length > 0) {
        Object.entries(item.atomicUnits).forEach(([unitKey, unitVal]) => {
          requiredAtomicUnits[unitKey] =
            (requiredAtomicUnits[unitKey] || 0) + unitVal * count;
        });
      } else {
        requiredAtomicUnits[itemId] = (requiredAtomicUnits[itemId] || 0) + count;
      }
    });

    const remainingAtomicUnits = { ...requiredAtomicUnits };
    const bundlesToBuy: OptimisedBundle[] = [];
    const standaloneItemsToBuy: { item: MenuItem; count: number; subtotal: number }[] = [];

    const pushStandalone = (item: MenuItem, packs: number) => {
      if (packs <= 0) return;
      const subtotal = Math.round(item.price * packs * 100) / 100;
      const existing = standaloneItemsToBuy.find((s) => s.item.id === item.id);
      if (existing) {
        existing.count += packs;
        existing.subtotal = Math.round((existing.subtotal + subtotal) * 100) / 100;
      } else {
        standaloneItemsToBuy.push({ item, count: packs, subtotal });
      }
    };

    // 3. Pure countable packs first (wings, tenders, pieces, nuggets, …)
    //    Min-cost cover — not the old “savings vs fake unit price” greedy.
    const packableUnitKeys = Object.keys(remainingAtomicUnits).filter((k) => {
      const packs = purePacksForUnit(allItems, k);
      return packs.length > 0 && (remainingAtomicUnits[k] || 0) > 0;
    });

    for (const unitKey of packableUnitKeys) {
      const need = remainingAtomicUnits[unitKey] || 0;
      if (need <= 0) continue;
      const packs = purePacksForUnit(allItems, unitKey);
      const cover = minCostCoverPacks(need, packs);
      if (!cover) continue;

      // Only use pack plan if cheaper or equal to buying wishlist lines for this unit
      let wishlistCostForUnit = 0;
      Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
        const item = allItems.find((i) => i.id === itemId);
        if (item?.atomicUnits?.[unitKey]) {
          wishlistCostForUnit += item.price * count;
        }
      });
      wishlistCostForUnit = Math.round(wishlistCostForUnit * 100) / 100;

      // If pack plan is more expensive, keep user's original lines for this unit
      if (cover.cost > wishlistCostForUnit + 0.009) {
        Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
          const item = allItems.find((i) => i.id === itemId);
          if (!item?.atomicUnits?.[unitKey]) return;
          pushStandalone(item, count);
          const provided = (item.atomicUnits[unitKey] || 0) * count;
          remainingAtomicUnits[unitKey] = Math.max(
            0,
            (remainingAtomicUnits[unitKey] || 0) - provided
          );
        });
        continue;
      }

      for (const pick of cover.picks) {
        pushStandalone(pick.item, pick.count);
      }
      remainingAtomicUnits[unitKey] = 0;
    }

    // 4. Multi-unit combos/meals (burger+fries+drink) — only true multi-kind combos
    const multiCombos = allItems.filter((i) => {
      if (!i.isCombo || !i.atomicUnits || i.price <= 0) return false;
      if (isCampaignPricedName(i.name)) return false;
      const keys = Object.keys(i.atomicUnits);
      return keys.length > 1;
    });

    const calcAlaCarteValueOfUnits = (units: Record<string, number>): number => {
      let value = 0;
      Object.entries(units).forEach(([unitKey, count]) => {
        const packs = purePacksForUnit(allItems, unitKey);
        if (packs.length) {
          const cover = minCostCoverPacks(count, packs);
          if (cover) {
            value += cover.cost;
            return;
          }
        }
        const single =
          allItems.find((i) => !i.isCombo && i.atomicUnits?.[unitKey] === 1) ||
          allItems.find((i) => i.atomicUnits?.[unitKey]);
        if (single?.atomicUnits?.[unitKey]) {
          value += (single.price / single.atomicUnits[unitKey]) * count;
        }
      });
      return value;
    };

    const comboCandidates = multiCombos
      .map((candidate) => {
        const unitsProvided = candidate.atomicUnits || {};
        const alaCarteVal = calcAlaCarteValueOfUnits(unitsProvided);
        return {
          candidate,
          unitsProvided,
          savingsPerBundle: alaCarteVal - candidate.price,
        };
      })
      .filter((c) => c.savingsPerBundle > 0.05)
      .sort((a, b) => b.savingsPerBundle - a.savingsPerBundle);

    for (const evaluated of comboCandidates) {
      let canApply = true;
      while (canApply) {
        const fits = Object.entries(evaluated.unitsProvided).every(
          ([unitKey, reqCount]) => (remainingAtomicUnits[unitKey] || 0) >= reqCount
        );
        if (!fits) {
          canApply = false;
          break;
        }
        Object.entries(evaluated.unitsProvided).forEach(([unitKey, reqCount]) => {
          remainingAtomicUnits[unitKey] = (remainingAtomicUnits[unitKey] || 0) - reqCount;
        });

        const existing = bundlesToBuy.find((b) => b.bundleItem.id === evaluated.candidate.id);
        if (existing) {
          existing.count += 1;
          existing.price =
            Math.round((existing.price + evaluated.candidate.price) * 100) / 100;
          // Aggregate covered units for display
          Object.entries(evaluated.unitsProvided).forEach(([unitKey, reqCount]) => {
            const row = existing.itemsCovered.find((ic) => ic.itemId === unitKey);
            if (row) row.count += reqCount;
            else {
              existing.itemsCovered.push({
                itemId: unitKey,
                name: provider.getUnitDisplayName(unitKey),
                count: reqCount,
              });
            }
          });
        } else {
          const itemsCovered: { itemId: string; name: string; count: number }[] = [];
          Object.entries(evaluated.unitsProvided).forEach(([unitKey, reqCount]) => {
            itemsCovered.push({
              itemId: unitKey,
              name: provider.getUnitDisplayName(unitKey),
              count: reqCount,
            });
          });
          bundlesToBuy.push({
            bundleItem: evaluated.candidate,
            count: 1,
            price: evaluated.candidate.price,
            itemsCovered,
          });
        }
      }
    }

    // 5. Leftover units (drinks, sides, opaque SKUs) → standalone
    Object.entries(remainingAtomicUnits).forEach(([unitKey, count]) => {
      let unfulfilled = count;
      if (unfulfilled <= 0) return;

      const wishlistPreferred = allItems.filter(
        (i) =>
          (rawWishlistCounts[i.id] || 0) > 0 &&
          (i.atomicUnits?.[unitKey] || 0) > 0
      );
      const otherCovering = allItems
        .filter(
          (i) =>
            !i.isCombo &&
            !isCampaignPricedName(i.name) &&
            (i.atomicUnits?.[unitKey] || 0) > 0 &&
            !wishlistPreferred.some((w) => w.id === i.id)
        )
        .sort(
          (a, b) =>
            a.price / (a.atomicUnits?.[unitKey] || 1) -
            b.price / (b.atomicUnits?.[unitKey] || 1)
        );

      const coveringItems = [...wishlistPreferred, ...otherCovering];
      for (const item of coveringItems) {
        const unitsInItem = item.atomicUnits?.[unitKey] || 1;
        if (unfulfilled < unitsInItem) continue;
        let packs = Math.floor(unfulfilled / unitsInItem);
        const wishCap = rawWishlistCounts[item.id];
        if (wishCap && wishlistPreferred.some((w) => w.id === item.id)) {
          packs = Math.min(packs, wishCap);
        }
        if (packs <= 0) continue;
        pushStandalone(item, packs);
        unfulfilled -= packs * unitsInItem;
      }

      if (unfulfilled > 0) {
        const packs = purePacksForUnit(allItems, unitKey);
        const cover = minCostCoverPacks(unfulfilled, packs);
        if (cover) {
          for (const pick of cover.picks) pushStandalone(pick.item, pick.count);
          unfulfilled = 0;
        }
      }

      if (unfulfilled > 0) {
        const filler =
          coveringItems.find((i) => (i.atomicUnits?.[unitKey] || 0) >= 1) ||
          allItems.find((i) => i.id === unitKey);
        if (filler) {
          const unitsInItem = filler.atomicUnits?.[unitKey] || 1;
          const packs = Math.max(1, Math.ceil(unfulfilled / unitsInItem));
          pushStandalone(filler, packs);
        }
      }
    });

    // 6. Totals
    let baseOptimalTotal = 0;
    bundlesToBuy.forEach((b) => {
      baseOptimalTotal += b.price;
    });
    standaloneItemsToBuy.forEach((s) => {
      baseOptimalTotal += s.subtotal;
    });
    baseOptimalTotal = Math.round(baseOptimalTotal * 100) / 100;

    // Never recommend a "plan" more expensive than the wishlist itself
    if (baseOptimalTotal > originalAlaCarteTotal + 0.009) {
      standaloneItemsToBuy.length = 0;
      bundlesToBuy.length = 0;
      Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
        const item = allItems.find((i) => i.id === itemId);
        if (item) pushStandalone(item, count);
      });
      baseOptimalTotal = originalAlaCarteTotal;
    }

    // 7. Vouchers
    const activeVouchers = UserRewardsService.getAppliedVouchers(provider.id);
    let voucherDiscounts = 0;
    const recommendations: Recommendation[] = [];

    activeVouchers.forEach((v) => {
      if (v.applicableItemId) {
        const rawCount = rawWishlistCounts[v.applicableItemId] || 0;
        if (rawCount > 0) {
          const item = allItems.find((i) => i.id === v.applicableItemId);
          if (item) {
            let discount = 0;
            if (v.discountType === 'percentage') {
              discount = item.price * (v.discountValue / 100);
            } else if (v.discountType === 'free_item') {
              discount = item.price;
            } else if (v.discountType === 'fixed_amount') {
              discount = v.discountValue;
            }
            discount = Math.round(discount * 100) / 100;
            voucherDiscounts += discount;
            recommendations.push({
              id: `rec_${v.id}`,
              type: 'SWAP_FOR_BUCKET',
              title: `🎟️ App Member Coupon: ${v.title}`,
              description: `Applied ${v.title} to your ${item.name} (-${provider.currencySymbol}${discount.toFixed(2)}).`,
              priceChange: -discount,
              isSavings: true,
              itemsToModify: [],
            });
          }
        }
      } else if (v.applicableCategory) {
        const hasCat = Object.keys(rawWishlistCounts).some((id) => {
          const item = allItems.find((i) => i.id === id);
          return item && item.category === v.applicableCategory;
        });
        if (hasCat && (!v.minSpend || baseOptimalTotal >= v.minSpend)) {
          const discount = Math.round(v.discountValue * 100) / 100;
          voucherDiscounts += discount;
          recommendations.push({
            id: `rec_${v.id}`,
            type: 'SWAP_FOR_BUCKET',
            title: `🎟️ App Voucher: ${v.title}`,
            description: `${v.description} (-${provider.currencySymbol}${discount.toFixed(2)}).`,
            priceChange: -discount,
            isSavings: true,
            itemsToModify: [],
          });
        }
      }
    });

    const optimalTotal = Math.max(0, Math.round((baseOptimalTotal - voucherDiscounts) * 100) / 100);
    const savingsAmount = Math.round((originalAlaCarteTotal - optimalTotal) * 100) / 100;
    const savingsPercentage =
      originalAlaCarteTotal > 0
        ? Math.round((savingsAmount / originalAlaCarteTotal) * 100)
        : 0;

    const stdRecs = this.generateRecommendations(
      provider,
      rawWishlistCounts,
      requiredAtomicUnits,
      allItems,
      originalAlaCarteTotal,
      optimalTotal
    );

    return {
      originalAlaCarteTotal,
      optimalTotal,
      savingsAmount: Math.max(0, savingsAmount),
      savingsPercentage: Math.max(0, savingsPercentage),
      bundlesToBuy,
      standaloneItemsToBuy,
      recommendations: [...recommendations, ...stdRecs],
    };
  }

  /**
   * Structural upgrade hints — menu-discovered packs only.
   * At most one pack-swap and one upsize per unit key (best by cash save / value).
   */
  private static generateRecommendations(
    provider: BaseFastFoodProvider,
    rawWishlistCounts: Record<string, number>,
    requiredAtomicUnits: Record<string, number>,
    allItems: MenuItem[],
    originalTotal: number,
    optimalTotal: number
  ): Recommendation[] {
    const recs: Recommendation[] = [];
    const sym = provider.currencySymbol;

    const packableUnits = [
      'hot_wing',
      'boneless_tender',
      'chicken_piece',
      'nugget',
    ] as const;

    for (const unitKey of packableUnits) {
      const have = requiredAtomicUnits[unitKey] || 0;
      if (have < 2) continue;

      const packs = purePacksForUnit(allItems, unitKey);
      if (packs.length === 0) continue;

      let currentCost = 0;
      const toRemove: { action: 'remove'; itemId: string; count: number }[] = [];
      Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
        if (count <= 0) return;
        const item = allItems.find((i) => i.id === itemId);
        if (item && item.atomicUnits?.[unitKey]) {
          currentCost += item.price * count;
          toRemove.push({ action: 'remove', itemId, count });
        }
      });
      currentCost = Math.round(currentCost * 100) / 100;
      if (currentCost <= 0) continue;

      const unitLabel = provider.getUnitPpiLabel(unitKey);
      const currentPpi = currentCost / have;

      // Best exact-or-overshoot pack plan cheaper than current basket lines
      const plan = minCostCoverPacks(have, packs);
      if (plan && plan.cost + 0.009 < currentCost) {
        const savings = Math.round((currentCost - plan.cost) * 100) / 100;
        // Prefer single larger pack when it is the whole plan
        const single =
          plan.picks.length === 1
            ? plan.picks[0]
            : null;
        if (single) {
          const sugPpi = single.item.price / (single.item.atomicUnits?.[unitKey] || have);
          recs.push({
            id: `rec_${unitKey}_swap_${single.item.id}`,
            type: 'SWAP_FOR_BUCKET',
            title: `Swap for ${single.count > 1 ? `${single.count}× ` : ''}${single.item.name} & Save ${sym}${savings.toFixed(2)}`,
            description: `You ordered ${have} ${unitLabel}${have === 1 ? '' : 's'} for ${sym}${currentCost.toFixed(2)}. Better pack pricing is ${sym}${plan.cost.toFixed(2)}.`,
            priceChange: -savings,
            isSavings: true,
            ppiComparison: {
              currentPpi: `${sym}${currentPpi.toFixed(2)} / ${unitLabel}`,
              suggestedPpi: `${sym}${sugPpi.toFixed(2)} / ${unitLabel}`,
              unitLabel,
              savingsPerUnit:
                currentPpi - sugPpi > 0.005
                  ? `Save ${sym}${(currentPpi - sugPpi).toFixed(2)} / ${unitLabel}`
                  : undefined,
            },
            itemsToModify: [
              ...toRemove,
              { action: 'add', itemId: single.item.id, count: single.count },
            ],
          });
        } else {
          // Multi-pack plan (e.g. 2×3 wings)
          const addMods = plan.picks.map((p) => ({
            action: 'add' as const,
            itemId: p.item.id,
            count: p.count,
          }));
          const planLabel = plan.picks
            .map((p) => `${p.count}× ${p.item.name}`)
            .join(' + ');
          recs.push({
            id: `rec_${unitKey}_plan`,
            type: 'SWAP_FOR_BUCKET',
            title: `Better pack mix & Save ${sym}${savings.toFixed(2)}`,
            description: `Instead of your current ${unitLabel} lines (${sym}${currentCost.toFixed(2)}), order ${planLabel} for ${sym}${plan.cost.toFixed(2)}.`,
            priceChange: -savings,
            isSavings: true,
            ppiComparison: {
              currentPpi: `${sym}${currentPpi.toFixed(2)} / ${unitLabel}`,
              suggestedPpi: `${sym}${(plan.cost / have).toFixed(2)} / ${unitLabel}`,
              unitLabel,
              savingsPerUnit:
                currentPpi - plan.cost / have > 0.005
                  ? `Save ${sym}${(currentPpi - plan.cost / have).toFixed(2)} / ${unitLabel}`
                  : undefined,
            },
            itemsToModify: [...toRemove, ...addMods],
          });
        }
      }

      // Optional: slightly larger pack for better £/unit (only if still cash-cheap extras)
      const larger = packs
        .filter((p) => p.size > have)
        .map((p) => {
          const extraCost = Math.round((p.price - currentCost) * 100) / 100;
          const extra = p.size - have;
          const sugPpi = p.price / p.size;
          const marginalPpi = extra > 0 ? extraCost / extra : Infinity;
          return { p, extraCost, extra, sugPpi, marginalPpi };
        })
        .filter(
          (x) =>
            x.extraCost > 0 &&
            x.extraCost <= currentCost * 0.5 &&
            x.sugPpi < currentPpi - 0.01 &&
            x.marginalPpi <= currentPpi + 0.02
        )
        .sort((a, b) => a.extraCost - b.extraCost)[0];

      if (larger) {
        recs.push({
          id: `rec_${unitKey}_upsize_${larger.p.size}`,
          type: 'UPGRADE_TO_MEAL',
          title: `Get ${larger.extra} extra ${unitLabel}${larger.extra > 1 ? 's' : ''} for ${sym}${larger.extraCost.toFixed(2)} more`,
          description: `You have ${have} (${sym}${currentCost.toFixed(2)}). ${larger.p.item.name} is ${sym}${larger.p.price.toFixed(2)} — better £/${unitLabel}.`,
          priceChange: larger.extraCost,
          isSavings: false,
          ppiComparison: {
            currentPpi: `${sym}${currentPpi.toFixed(2)} / ${unitLabel}`,
            suggestedPpi: `${sym}${larger.sugPpi.toFixed(2)} / ${unitLabel}`,
            unitLabel,
            savingsPerUnit: `Save ${sym}${(currentPpi - larger.sugPpi).toFixed(2)} / ${unitLabel}`,
          },
          itemsToModify: [
            ...toRemove,
            { action: 'add', itemId: larger.p.item.id, count: 1 },
          ],
        });
      }
    }

    // Meal bundle: protein + drink, no fries
    const proteinKeys = ['chicken_piece', 'boneless_tender', 'chicken_sandwich'] as const;
    const drinkCount =
      (requiredAtomicUnits.drink_reg || 0) +
      (requiredAtomicUnits.drink_lrg || 0) +
      (requiredAtomicUnits.drink_bottle_1_5l || 0);
    const friesCount =
      (requiredAtomicUnits.fries_reg || 0) + (requiredAtomicUnits.fries_lrg || 0);

    if (drinkCount >= 1 && friesCount === 0) {
      for (const proteinKey of proteinKeys) {
        const proteinCount = requiredAtomicUnits[proteinKey] || 0;
        if (proteinCount < 1) continue;

        const meal = allItems
          .filter((i) => {
            if (!i.isCombo || !i.atomicUnits) return false;
            const need = {
              [proteinKey]: Math.min(
                proteinCount,
                proteinKey === 'chicken_sandwich' ? 2 : 3
              ),
              drink_reg: 1,
              fries_reg: 1,
            };
            return Object.entries(need).every(
              ([k, n]) => (i.atomicUnits?.[k] || 0) >= n
            );
          })
          .sort((a, b) => a.price - b.price)[0];
        if (!meal) continue;

        let basketCost = 0;
        const remove: { action: 'remove'; itemId: string; count: number }[] = [];
        Object.entries(rawWishlistCounts).forEach(([itemId, count]) => {
          if (count <= 0) return;
          const item = allItems.find((i) => i.id === itemId);
          if (!item?.atomicUnits) return;
          const isProtein = !!item.atomicUnits[proteinKey];
          const isDrink =
            !!item.atomicUnits.drink_reg ||
            !!item.atomicUnits.drink_lrg ||
            !!item.atomicUnits.drink_bottle_1_5l;
          if (isProtein || isDrink) {
            basketCost += item.price * count;
            remove.push({ action: 'remove', itemId, count });
          }
        });
        basketCost = Math.round(basketCost * 100) / 100;
        const delta = Math.round((meal.price - basketCost) * 100) / 100;
        if (delta <= 0) {
          recs.push({
            id: `rec_meal_bundle_save_${proteinKey}`,
            type: 'UPGRADE_TO_MEAL',
            title: `Bundle into ${meal.name} & Save ${sym}${Math.abs(delta).toFixed(2)}`,
            description: `Your selection (${sym}${basketCost.toFixed(2)}) costs more than ${meal.name} (${sym}${meal.price.toFixed(2)}), which includes fries.`,
            priceChange: delta,
            isSavings: true,
            itemsToModify: [...remove, { action: 'add', itemId: meal.id, count: 1 }],
          });
        } else if (delta < meal.price * 0.35) {
          recs.push({
            id: `rec_meal_bundle_fries_${proteinKey}`,
            type: 'UPGRADE_TO_MEAL',
            title: `Add fries via ${meal.name} for ${sym}${delta.toFixed(2)} more`,
            description: `Bundle into ${meal.name} (${sym}${meal.price.toFixed(2)}) to include fries for ${sym}${delta.toFixed(2)} extra.`,
            priceChange: delta,
            isSavings: false,
            itemsToModify: [...remove, { action: 'add', itemId: meal.id, count: 1 }],
          });
        }
        break;
      }
    }

    // Prefer cash-saving recs; drop noise if already fully optimized
    const sorted = recs.sort((a, b) => {
      if (a.isSavings !== b.isSavings) return a.isSavings ? -1 : 1;
      return a.priceChange - b.priceChange;
    });

    // If optimal already matches a pack plan, still show the best saving swap once
    void originalTotal;
    void optimalTotal;

    // Cap: one swap + one upgrade per unit family to keep UI clean
    const seenTypes = new Set<string>();
    const capped: Recommendation[] = [];
    for (const r of sorted) {
      const key = `${r.type}:${r.id.split('_').slice(0, 3).join('_')}`;
      if (seenTypes.has(key)) continue;
      // Max 3 suggestions total
      if (capped.length >= 3) break;
      seenTypes.add(key);
      capped.push(r);
    }
    return capped;
  }
}
