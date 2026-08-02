import { BaseFastFoodProvider } from '../providers/baseProvider';
import type { AuditResult } from '../types/optimizer';
import type { MenuItem } from '../types/provider';

export class ComboAuditor {
  static auditCombo(
    provider: BaseFastFoodProvider,
    comboItemId: string,
    locationTierId: string = 'standard'
  ): AuditResult | null {
    const combo = provider.getItemById(comboItemId, locationTierId);
    if (!combo || !combo.isCombo) {
      return null;
    }

    const items = provider.getItems(locationTierId);
    const componentsAlaCarte: { item: MenuItem; count: number; subtotal: number }[] = [];
    let alaCarteTotalPrice = 0;

    // Stage 1: Explicit equivalentAlaCarteIds
    if (combo.equivalentAlaCarteIds && combo.equivalentAlaCarteIds.length > 0) {
      const counts: Record<string, number> = {};
      combo.equivalentAlaCarteIds.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });

      Object.entries(counts).forEach(([id, count]) => {
        const item = items.find((i) => i.id === id);
        if (item) {
          const subtotal = Math.round(item.price * count * 100) / 100;
          componentsAlaCarte.push({ item, count, subtotal });
          alaCarteTotalPrice += subtotal;
        }
      });
    }

    // Stage 2: Explicit combo.components (from mealComponents / meal builder resolution)
    let stage2MainMiss = 0;
    if (componentsAlaCarte.length === 0 && combo.components && combo.components.length > 0) {
      const stage2: { item: MenuItem; count: number; subtotal: number }[] = [];
      let stage2Total = 0;
      let stage2Miss = 0;
      combo.components.forEach((c) => {
        const isMainish =
          c.category === 'main' ||
          c.category === 'extra' ||
          (!c.category && !/fries|drink|gravy|dip|side/i.test(c.name));
        let item = items.find((i) => c.itemId && i.id === c.itemId && i.price > 0);
        // Prefer non-combo street SKUs (never Mini Fillet “deal” twin)
        if (item?.isCombo) item = undefined;
        if (!item) {
          const want = c.name.toLowerCase().trim();
          item = items.find(
            (i) => i.name.toLowerCase() === want && i.price > 0 && !i.isCombo
          );
        }
        if (!item) {
          const want = c.name.toLowerCase().trim();
          item = items.find(
            (i) =>
              i.price > 0 &&
              !i.isCombo &&
              (i.name.toLowerCase() === want ||
                i.name.toLowerCase().startsWith(want) ||
                want.startsWith(i.name.toLowerCase()))
          );
        }
        if (item && item.id !== combo.id) {
          const subtotal = Math.round(item.price * c.count * 100) / 100;
          stage2.push({ item, count: c.count, subtotal });
          stage2Total += subtotal;
        } else {
          stage2Miss += 1;
          if (isMainish) stage2MainMiss += 1;
        }
      });
      if (stage2Miss === 0 && stage2.length > 0) {
        componentsAlaCarte.push(...stage2);
        alaCarteTotalPrice = stage2Total;
      } else if (stage2Miss > 0 && stage2.length > 0) {
        // Keep partial lines; Stage 3 may fill residual units
        componentsAlaCarte.push(...stage2);
        alaCarteTotalPrice = stage2Total;
      }
    }

    // Stage 3: Atomic units with multi-unit pack credit
    // Runs when Stage 1/2 empty OR when ids/components left residual units (e.g. free tender).
    const needStage3 =
      !!combo.atomicUnits &&
      (componentsAlaCarte.length === 0 ||
        Object.keys(combo.atomicUnits).some((k) => {
          let covered = 0;
          for (const row of componentsAlaCarte) {
            covered += ((row.item.atomicUnits as any)?.[k] || 0) * row.count;
          }
          return (combo.atomicUnits as any)[k] > covered;
        }));

    if (needStage3 && combo.atomicUnits) {
      // True ala-carte only — never another combo/deal/meal or POS choice/component line.
      const alaCarteItems = items.filter((i) => {
        if (!i.atomicUnits || i.id === combo.id || i.isCombo) return false;
        // Already counted in Stage 1/2
        if (componentsAlaCarte.some((c) => c.item.id === i.id)) return false;
        const n = i.name.toLowerCase();
        const d = (i.description || '').toLowerCase();
        const blob = `${n} ${d}`;
        if (
          /bucket|feast|banquet|box meal|dine for|stacker|for one|variety|family|\bmeal\b|for £|for \d/i.test(
            n
          )
        ) {
          return false;
        }
        // Promo multi-buys / upsell add-ons are not fair street singles
        if (/for\s*(just\s*)?(£\s*)?\d+(\.\d+)?/i.test(blob)) return false;
        if (/\bextra\s+\d+\s*(pc|pcs|pieces?|tenders?|wings?)\b/i.test(blob)) return false;
        if (/^\s*extra\b/i.test(d.trim())) return false;
        // "Large popcorn chicken choice" / meal-component prices are not street ala-carte
        if (/\bchoice\b/.test(d) || /\bcomponents?\b/.test(d) || /\bmeal\s*comp\b/.test(d)) {
          return false;
        }
        // Bundled deal copy (burger + fries sold under the burger name)
        if (/plus a (regular )?signature fries|plus a drink|with fries/i.test(d)) return false;
        const unitKeys = Object.keys(i.atomicUnits);
        // Block multi-unit meal deals (protein + fries/drink). Allow protein+dip packs.
        if (unitKeys.length > 1) {
          if (i.atomicUnits.fries_reg || i.atomicUnits.fries_lrg || i.atomicUnits.drink_reg) {
            return false;
          }
        }
        // Energy drinks / specialty — only if combo explicitly needs them
        if (/\bred bull\b|\bmonster\b|\benergy drink\b/i.test(n) && !/\bred bull|energy/i.test(combo.name)) {
          return false;
        }
        // Kids-priced sides/mains must not price adult meals (name or description)
        const comboIsKids = /\bkids?\b/i.test(combo.name);
        if (!comboIsKids && (/\bkids?\b/i.test(n) || /\bkids?\b/i.test(d))) {
          return false;
        }
        return true;
      });
      const comboIsKids = /\bkids?\b/i.test(combo.name);
      const remaining: Record<string, number> = { ...combo.atomicUnits };
      // Credit units already covered by Stage 1/2 lines
      for (const row of componentsAlaCarte) {
        Object.entries(row.item.atomicUnits || {}).forEach(([k, provided]) => {
          if (!provided) return;
          remaining[k] = Math.max(0, (remaining[k] || 0) - provided * row.count);
        });
      }

      const comboTokens = new Set(
        combo.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 2)
      );

      const scoreNameOverlap = (itemName: string): number => {
        const tokens = itemName
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 2);
        return tokens.reduce((n, t) => n + (comboTokens.has(t) ? 1 : 0), 0);
      };

      /**
       * Prefer product names that match the *unit type* (generic words only).
       * Brand names (Pepsi, Zinger, Cajun…) stay out — use name-overlap with the combo.
       */
      const unitNameHint = (unitKey: string, itemName: string): number => {
        const n = itemName.toLowerCase();
        if (unitKey === 'boneless_tender') {
          // Never use wraps/sandwiches as “tender packs”
          if (n.includes('wrap') || n.includes('sandwich') || n.includes('burger') || n.includes('bun'))
            return 4;
          if (n.includes('wing') && !n.includes('tender')) return 3;
          return n.includes('tender') || n.includes('mini fillet') ? 0 : 1;
        }
        if (unitKey.includes('sandwich')) {
          if (n.includes('wrap')) return 2;
          if (n.includes('sandwich') || n.includes('cruncher') || n.includes('superstack')) return 0;
          return 1;
        }
        if (unitKey === 'hot_wing') return n.includes('wing') && !n.includes('tender') ? 0 : 1;
        if (unitKey === 'chicken_piece') {
          // Prefer Original Recipe piece SKUs; never tenders/wings/popcorn/other buckets
          if (n.includes('tender') || n.includes('wing') || n.includes('popcorn') || n.includes('burger'))
            return 3;
          if (/bucket|feast|banquet|variety|box meal/i.test(n)) return 2;
          if (n.includes('original recipe')) return 0;
          if (n.includes('piece') || /\bpc\b/.test(n)) return 1;
          return 2;
        }
        if (unitKey === 'mac_and_cheese') return n.includes('mac') ? 0 : 1;
        if (unitKey === 'fries_reg') {
          if (n.includes('loaded')) return 3;
          // Prefer plain regular fries; dual packs ("2x Regular Signature Fries") are fine
          if (n.includes('regular') && n.includes('fries')) return 0;
          if (n.includes('fries') && !n.includes('tender')) return 1;
          if (n.includes('tender') && n.includes('fries')) return 3;
          return 2;
        }
        if (unitKey === 'popcorn_chicken') {
          // Prefer size match with the combo name when possible
          if (n.includes('small') && combo.name.toLowerCase().includes('large')) return 2;
          if (n.includes('large') && combo.name.toLowerCase().includes('large')) return 0;
          if (n.includes('popcorn')) return 1;
          return 2;
        }
        if (unitKey === 'fries_lrg') return n.includes('large') && n.includes('fries') ? 0 : 1;
        // Opaque sku:… keys — require name overlap with the unit key
        if (unitKey.startsWith('sku:')) {
          const want = unitKey.slice(4);
          return n.includes(want) || want.includes(n.replace(/[^a-z0-9\s]/g, '').trim()) ? 0 : 3;
        }
        if (unitKey.startsWith('drink_')) {
          if (/\bred bull\b|\benergy\b|\bshake\b|\blatte\b/i.test(n)) return 2;
          if (n.includes('soda') || n.includes('pepsi') || n.includes('coke') || n.includes('cola'))
            return 0;
          return n.includes('drink') || n.includes('water') || n.includes('juice') || n.includes('lemonade')
            ? 0
            : 1;
        }
        if (unitKey === 'dip') {
          if (n.includes('sandwich') || n.includes('wrap') || n.includes('wing') || n.includes('meal'))
            return 3;
          if (n.includes('dip')) return 0;
          // Named pots: "Hot Honey", "Kickback" without the word dip
          if (/^(the big )?(hot honey|kickback|ranch|cheese|bold bbq|garlic mayo)$/i.test(n.trim()))
            return 0;
          return n.includes('sauce') ? 1 : 2;
        }
        if (unitKey === 'biscuit') return n.includes('biscuit') ? 0 : 1;
        if (unitKey.startsWith('beans')) {
          if (comboIsKids) return /\bkids?\b/.test(n) && n.includes('bean') ? 0 : n.includes('bean') ? 1 : 2;
          if (/\bkids?\b/.test(n)) return 3;
          if (unitKey === 'beans_lrg') return n.includes('large') && n.includes('bean') ? 0 : 1;
          if (unitKey === 'beans_reg')
            return n.includes('regular') && n.includes('bean')
              ? 0
              : n.includes('bean') && !n.includes('large')
                ? 0
                : 1;
          return n.includes('bean') ? 0 : 1;
        }
        const token = unitKey.replace(/_reg$|_lrg$|_1_5l$/, '').replace(/_/g, ' ');
        return n.includes(token) ? 0 : 1;
      };

      // Prefer resolving "main" units before sides so multi-packs credit sides
      const unitOrder = (k: string) => {
        if (k.includes('sandwich') || k.includes('burger') || k === 'mac_and_cheese') return 0;
        if (k === 'boneless_tender' || k === 'hot_wing' || k === 'chicken_piece' || k === 'nugget')
          return 1;
        if (k === 'dip' || k === 'biscuit') return 2;
        if (k.includes('fries') || k.includes('beans') || k.includes('side')) return 3;
        if (k.includes('drink')) return 4;
        return 5;
      };

      const keys = Object.keys(remaining).sort((a, b) => unitOrder(a) - unitOrder(b));

      for (const unitKey of keys) {
        let neededCount = remaining[unitKey] || 0;
        if (neededCount <= 0) continue;

        let candidates = alaCarteItems.filter((i) => (i.atomicUnits as any)?.[unitKey]);
        if (candidates.length === 0) continue;

        // Protein units: never cover with wraps/sandwiches that merely *contain* that protein
        if (
          unitKey === 'boneless_tender' ||
          unitKey === 'hot_wing' ||
          unitKey === 'chicken_piece' ||
          unitKey === 'nugget'
        ) {
          candidates = candidates.filter(
            (i) => !/\bwrap\b|\bsandwich\b|\bburger\b|\bbun\b|\bmeal\b/i.test(i.name)
          );
          if (candidates.length === 0) continue;
        }

        // Prefer packs that fit the need (exact or smaller for multi-buy cover).
        // Never buy a larger pack just to cover free meal sides (2 tenders ↛ 3-pack @ £6.29).
        const fits = candidates.filter((i) => ((i.atomicUnits as any)[unitKey] || 1) <= neededCount);
        if (!fits.length) continue;
        candidates = fits;

        candidates.sort((a, b) => {
          const ua = (a.atomicUnits as any)[unitKey] || 1;
          const ub = (b.atomicUnits as any)[unitKey] || 1;

          const pureA = Object.keys(a.atomicUnits || {}).length === 1 ? 0 : 1;
          const pureB = Object.keys(b.atomicUnits || {}).length === 1 ? 0 : 1;
          if (pureA !== pureB) return pureA - pureB;

          // Kids' Box → Kids Beans / Kids Cob, not Large Beans
          if (comboIsKids) {
            const kidsA = /\bkids?\b/i.test(a.name) ? 0 : 1;
            const kidsB = /\bkids?\b/i.test(b.name) ? 0 : 1;
            if (kidsA !== kidsB) return kidsA - kidsB;
          }

          const hintA = unitNameHint(unitKey, a.name);
          const hintB = unitNameHint(unitKey, b.name);
          if (hintA !== hintB) return hintA - hintB;

          // Prefer packs that don't bring extra unneeded units (except when pure)
          const extraA = Object.keys(a.atomicUnits || {}).filter(
            (k) => k !== unitKey && (remaining[k] || 0) <= 0
          ).length;
          const extraB = Object.keys(b.atomicUnits || {}).filter(
            (k) => k !== unitKey && (remaining[k] || 0) <= 0
          ).length;
          if (extraA !== extraB) return extraA - extraB;

          const overA = ua > neededCount ? 1 : 0;
          const overB = ub > neededCount ? 1 : 0;
          if (overA !== overB) return overA - overB;

          const fitA = ua === neededCount ? 0 : ua === 1 ? 1 : neededCount % ua === 0 ? 2 : 3;
          const fitB = ub === neededCount ? 0 : ub === 1 ? 1 : neededCount % ub === 0 ? 2 : 3;
          if (fitA !== fitB) return fitA - fitB;

          // Total £ to cover the need (not unit price) — avoids picking 10 tenders
          // for a 2-tender need just because £/tender is lower
          const coverCostA = Math.ceil(neededCount / ua) * a.price;
          const coverCostB = Math.ceil(neededCount / ub) * b.price;
          if (coverCostA !== coverCostB) return coverCostA - coverCostB;

          // Less leftover units when both overshoot
          const wasteA = Math.ceil(neededCount / ua) * ua - neededCount;
          const wasteB = Math.ceil(neededCount / ub) * ub - neededCount;
          if (wasteA !== wasteB) return wasteA - wasteB;

          const scoreA = scoreNameOverlap(a.name);
          const scoreB = scoreNameOverlap(b.name);
          if (scoreA !== scoreB) return scoreB - scoreA;

          return a.price / ua - b.price / ub;
        });

        const bestItem = candidates[0];
        if (!bestItem?.atomicUnits) continue;

        const itemUnitsProvided = (bestItem.atomicUnits as any)[unitKey] || 1;
        const countNeeded = Math.max(1, Math.ceil(neededCount / itemUnitsProvided));
        const subtotal = Math.round(bestItem.price * countNeeded * 100) / 100;

        // Merge if same item already in breakdown
        const existing = componentsAlaCarte.find((c) => c.item.id === bestItem.id);
        if (existing) {
          existing.count += countNeeded;
          existing.subtotal = Math.round((existing.subtotal + subtotal) * 100) / 100;
        } else {
          componentsAlaCarte.push({
            item: bestItem,
            count: countNeeded,
            subtotal,
          });
        }
        alaCarteTotalPrice += subtotal;

        // Credit all units this pack provides against remaining need
        Object.entries(bestItem.atomicUnits).forEach(([k, provided]) => {
          if (!provided) return;
          remaining[k] = Math.max(0, (remaining[k] || 0) - provided * countNeeded);
        });
      }

      // Incomplete if nothing priced yet and units remain (e.g. only fries, not the burger)
      const unresolved = Object.entries(remaining).filter(([, v]) => (v || 0) > 0);
      if (unresolved.length > 0 && (componentsAlaCarte.length === 0 || alaCarteTotalPrice <= 0)) {
        return {
          comboItem: combo,
          comboPrice: combo.price,
          componentsAlaCarte,
          alaCarteTotalPrice: Math.round(alaCarteTotalPrice * 100) / 100,
          priceDifference: 0,
          savingsPercentage: 0,
          isComboCheaper: true,
          verdict: 'EQUAL',
          incomplete: true,
          summary: `Can't fully compare — missing street price for: ${unresolved
            .map(([k, v]) => `${v}× ${k.replace(/^sku:/, '')}`)
            .join(', ')}. Not scored as over/under.`,
        };
      }
      // Main protein still missing after Stage 3 (e.g. mini fillet with no solo SKU)
      const heroKeys = new Set([
        'zinger_burger',
        'fillet_burger',
        'tower_burger',
        'mini_fillet_burger',
        'twister_wrap',
        'vegan_burger',
        'chicken_sandwich',
        'rice_bowl',
      ]);
      // Free box-meal side proteins (choice of 2 tenders / 3 wings) — not the hero main
      const sideProteinKeys = new Set([
        'chicken_piece',
        'boneless_tender',
        'hot_wing',
        'nugget',
      ]);
      const unresolvedProtein = unresolved.filter(
        ([k]) => heroKeys.has(k) || sideProteinKeys.has(k) || k.startsWith('sku:')
      );
      const hasHeroPriced = componentsAlaCarte.some((row) =>
        Object.keys(row.item.atomicUnits || {}).some((k) => heroKeys.has(k))
      );
      const onlySideProteinLeft =
        unresolvedProtein.length > 0 &&
        unresolvedProtein.every(([k]) => sideProteinKeys.has(k));

      if (unresolvedProtein.length > 0) {
        // Box meal already has sandwich priced; free 2 tenders with no solo SKU → score without them
        if (hasHeroPriced && onlySideProteinLeft) {
          // fall through — score sandwich + fries + drink only
        } else if (!hasHeroPriced) {
          return {
            comboItem: combo,
            comboPrice: combo.price,
            componentsAlaCarte,
            alaCarteTotalPrice: Math.round(alaCarteTotalPrice * 100) / 100,
            priceDifference: 0,
            savingsPercentage: 0,
            isComboCheaper: true,
            verdict: 'EQUAL',
            incomplete: true,
            summary: `Can't fully compare — main item has no standalone menu price (${unresolvedProtein
              .map(([k, v]) => `${v}× ${k.replace(/^sku:/, '')}`)
              .join(', ')}). Sides/drinks alone are not scored as over/under.`,
          };
        } else if (unresolvedProtein.some(([k]) => heroKeys.has(k) || k.startsWith('sku:'))) {
          return {
            comboItem: combo,
            comboPrice: combo.price,
            componentsAlaCarte,
            alaCarteTotalPrice: Math.round(alaCarteTotalPrice * 100) / 100,
            priceDifference: 0,
            savingsPercentage: 0,
            isComboCheaper: true,
            verdict: 'EQUAL',
            incomplete: true,
            summary: `Can't fully compare — missing street price for: ${unresolvedProtein
              .map(([k, v]) => `${v}× ${k.replace(/^sku:/, '')}`)
              .join(', ')}. Not scored as over/under.`,
          };
        }
      }
      // Residual freebies without a 1-unit street SKU — score resolved lines only
    }

    // Stage 2 main miss with no atomicUnits path (or stage 3 skipped)
    if (
      stage2MainMiss > 0 &&
      componentsAlaCarte.length > 0 &&
      combo.components?.some((c) => !c.itemId && (c.category === 'main' || c.category === 'extra'))
    ) {
      const missingNames = (combo.components || [])
        .filter((c) => !c.itemId && (c.category === 'main' || c.category === 'extra'))
        .map((c) => c.name);
      // If stage 3 already covered main units, don't incomplete
      const mainUnits = [
        'chicken_piece',
        'boneless_tender',
        'hot_wing',
        'zinger_burger',
        'fillet_burger',
        'mini_fillet_burger',
        'twister_wrap',
        'vegan_burger',
        'chicken_sandwich',
        'rice_bowl',
      ];
      const hasMainPriced = componentsAlaCarte.some((row) =>
        mainUnits.some((k) => (row.item.atomicUnits as any)?.[k])
      );
      if (!hasMainPriced && missingNames.length) {
        return {
          comboItem: combo,
          comboPrice: combo.price,
          componentsAlaCarte,
          alaCarteTotalPrice: Math.round(alaCarteTotalPrice * 100) / 100,
          priceDifference: 0,
          savingsPercentage: 0,
          isComboCheaper: true,
          verdict: 'EQUAL',
          incomplete: true,
          summary: `Can't fully compare — no standalone price for: ${missingNames.join(
            ', '
          )}. Not scored as over/under.`,
        };
      }
    }

    alaCarteTotalPrice = Math.round(alaCarteTotalPrice * 100) / 100;

    if (componentsAlaCarte.length === 0 || alaCarteTotalPrice === 0) {
      return {
        comboItem: combo,
        comboPrice: combo.price,
        componentsAlaCarte: [],
        alaCarteTotalPrice: combo.price,
        priceDifference: 0,
        savingsPercentage: 0,
        isComboCheaper: true,
        verdict: 'EQUAL',
        incomplete: true,
        summary: `Can't compare — item breakdown is unavailable for direct ala-carte pricing.`,
      };
    }

    const priceDifference = Math.round((combo.price - alaCarteTotalPrice) * 100) / 100;
    const absDiff = Math.abs(priceDifference);

    let savingsPercentage = 0;
    if (alaCarteTotalPrice > 0) {
      savingsPercentage = Math.round((Math.abs(priceDifference) / alaCarteTotalPrice) * 100);
    }

    let verdict: AuditResult['verdict'] = 'EQUAL';
    let summary = '';

    if (priceDifference < -0.05) {
      verdict = 'WORTH_IT';
      summary = `This combo saves you ${provider.currencySymbol}${absDiff.toFixed(2)} (${savingsPercentage}%) compared to buying items individually!`;
    } else if (priceDifference > 0.05) {
      verdict = 'OVERPRICED';
      summary = `Buying these items individually costs ${provider.currencySymbol}${alaCarteTotalPrice.toFixed(2)}, which is ${provider.currencySymbol}${absDiff.toFixed(2)} cheaper than the combo!`;
    } else {
      verdict = 'EQUAL';
      summary = `The combo price is identical to buying items individually.`;
    }

    return {
      comboItem: combo,
      comboPrice: combo.price,
      componentsAlaCarte,
      alaCarteTotalPrice,
      priceDifference,
      savingsPercentage,
      isComboCheaper: priceDifference <= 0,
      verdict,
      summary,
    };
  }
}
