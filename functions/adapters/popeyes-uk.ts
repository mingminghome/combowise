/**
 * Popeyes UK live adapter — collection order SPA (popeyesuk.com).
 *
 *   1) …/api/v2/restaurants
 *   2) …/api/v2/restaurants/{slug}
 *   3) …/en/restaurants/{ref}/menus/{menuId}
 */
import type { LiveEnv } from './shared';
import { parsePrice } from './shared';

const DEFAULT_POPEYES_API_BASE =
  'https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net';

// ─── Popeyes UK (popeyesuk.com ordering SPA) ─────────────────────────────────

function popeyesHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    Origin: 'https://popeyesuk.com',
    Referer: 'https://popeyesuk.com/',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
  };
}

function popeyesApiBase(env: LiveEnv): string {
  return (env.POPEYES_API_BASE || DEFAULT_POPEYES_API_BASE).replace(/\/$/, '');
}

function parsePopeyesAddress(storeAddress: string): {
  address: string;
  city: string;
  postcode: string;
} {
  const raw = String(storeAddress || '').trim();
  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  const address = parts[0] || raw;
  const rest = parts.slice(1).join(', ') || '';
  const pc = rest.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const postcode = pc ? pc[1].toUpperCase().replace(/\s+/, ' ') : '';
  let city = rest;
  if (pc) city = rest.replace(pc[0], '').replace(/,\s*$/, '').trim();
  // "Plymouth, Devon" → city Plymouth
  if (city.includes(',')) city = city.split(',')[0].trim();
  return { address, city, postcode };
}

function mapPopeyesCategory(catLabel: string, itemName: string, isCombo: boolean): string {
  const nameL = itemName.toLowerCase();
  const c = `${catLabel} ${itemName}`.toLowerCase();
  if (c.includes('kid') || c.includes('poppy')) return 'kids';
  if (c.includes('box meal') || c.includes('big box') || (isCombo && c.includes('box'))) return 'box_meals';
  if (c.includes('sharer') || c.includes('feast') || c.includes('family')) return 'buckets';
  // Chicken packs before dips (e.g. "3 Classic Tenders & a dip")
  if (
    /\b\d+\s*(classic\s*|spicy\s*)?tenders?\b/.test(nameL) ||
    /\b\d+\s*(hot\s*)?wings?\b/.test(nameL) ||
    /\b\d+\s*boneless\b/.test(nameL) ||
    nameL.includes('signature louisiana') ||
    (nameL.includes('tender') && !nameL.includes('sandwich') && !isCombo)
  ) {
    return 'chicken';
  }
  if (c.includes('shake') || c.includes('whipz') || c.includes('cookie') || c.includes('dessert') || c.includes('ice cream') || c.includes('mud pie')) {
    return 'desserts';
  }
  if (c.includes('drink') || c.includes('lemonade') || c.includes('pepsi') || c.includes('coke') || c.includes('sprite') || c.includes('fanta') || c.includes('water') || c.includes('juice')) {
    return 'drinks';
  }
  if (c.includes('side') || c.includes('fries') || c.includes('biscuit') || c.includes('beans') || c.includes('coleslaw') || c.includes('mac') || c.includes('mash') || c.includes('corn')) {
    return 'sides';
  }
  if (c.includes('wrap') || c.includes('sandwich') || c.includes('superstack') || c.includes('burger')) return 'burgers';
  if (nameL.includes('mac & cheese') || nameL.includes('mac and cheese')) return 'sides';
  if (c.includes('dip') || (/\bsauce\b/.test(nameL) && !nameL.includes('fries'))) return 'dips';
  if (c.includes('tender') || c.includes('wing') || c.includes('boneless') || c.includes('chicken')) return 'chicken';
  if (isCombo || c.includes('meal') || c.includes('saver')) return 'meals';
  return 'sides';
}

/** True for share boxes / box meals — not "3 Tenders & a dip" packs. */
function isPopeyesComboName(name: string, isComboMealFlag: boolean): boolean {
  const n = name.toLowerCase();
  // Pure countable packs stay Mode-2 ala-carte even if API sets isComboMeal
  // Allow flavour words: "12 Cajun Citrus Wings", "8 Ghost Pepper Boneless"
  const purePack =
    (/\b\d+\s+(?:[\w''-]+\s+){0,4}tenders?\b/.test(n) ||
      /\b\d+\s+(?:[\w''-]+\s+){0,4}wings?\b/.test(n) ||
      /\b\d+\s+(?:[\w''-]+\s+){0,4}boneless\b/.test(n)) &&
    !/\b(meal|box|sharer|feast|fries|drink|soda)\b/.test(n);
  if (purePack) return false;

  if (/\b(box meal|big box|sharer|feast|banquet|poppy meal)\b/.test(n)) return true;
  if (/\bbox\b/.test(n) && !/\b\d+\s/.test(n)) return true; // Boneless Box
  // isComboMeal from API (Cruncher Meal, Box Meals, …)
  if (isComboMealFlag) return true;
  if (/\bmeal\b/.test(n) && !/\bcomponent\b/.test(n)) return true;
  // Explicit multi-kind deals sold as one line (protein + fries)
  if (
    /\bfries\b/.test(n) &&
    (/\btenders?\b|\bwings?\b|\bboneless\b|\bwrap\b|\bpiece\b|\bpc\b/.test(n))
  ) {
    return true;
  }
  return false;
}

/**
 * Split OR-choice lists without treating AND lists as alternatives.
 *
 * OR examples (take first only for default audit):
 *   "2 Tenders, 3 Hot Wings or 4 Boneless"
 *   "1 Classic or Spicy Tender or 2 Hot Wings"
 *
 * AND examples (not split here — whole phrase kept for unit parse):
 *   "regular Fries, a regular drink and a Hot Honey dip"
 */
export function splitOrChoiceOptions(opts: string): string[] {
  const raw = opts.replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  // "1 Classic or Spicy Tender" is ONE option (flavour), not Classic | Spicy Tender alone
  const classicOrSpicy = raw.match(
    /^(\d+)\s*classic\s+or\s+spicy\s+(tenders?|fillets?)(.*)$/i
  );
  if (classicOrSpicy) {
    const rest = classicOrSpicy[3].trim();
    const head = `${classicOrSpicy[1]} classic ${classicOrSpicy[2]}`;
    if (!rest) return [head];
    // "... Tender or 2 Hot Wings"
    const more = rest.replace(/^\s*or\s+/i, '');
    return [head, ...splitOrChoiceOptions(more)];
  }

  // Split on " or " first, then commas only when segments look like counted proteins
  const orParts = raw.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of orParts) {
    if (/,/.test(part) && /^\d+\s/.test(part)) {
      const segs = part.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
      // "2 Tenders, 3 Hot Wings" → alternatives; "smoky, spicy sauce" → keep whole
      if (segs.length > 1 && segs.every((s) => /^\d+\s+\w+/.test(s))) {
        out.push(...segs);
        continue;
      }
    }
    out.push(part);
  }
  return out;
}

/** First protein option from "choice of …" copy (default audit path). */
export function firstChoiceFromDescription(description: string): string | null {
  const m = description.match(
    /(?:with a |your |& your )?choice of\s+(.+?)(?=\s*,\s*served|\s+served|\s+and a\s+(?:kids|regular|hot|big)|\.|$)/i
  );
  if (!m) return null;
  const options = splitOrChoiceOptions(m[1]);
  return options[0] || null;
}

/**
 * Parse Popeyes name + shortDescription into comparable units for Mode 1 audit.
 * Choice lines ("2 Tenders, 3 Hot Wings or 4 Boneless") keep only the first option.
 */
function extractPopeyesAtomicUnits(name: string, description: string = ''): Record<string, number> {
  let text = `${name} ${description}`.toLowerCase().replace(/\s+/g, ' ');
  const nameL = name.toLowerCase().replace(/\s+/g, ' ').trim();

  // "tender in a soft bun" / Cruncher = sandwich main, not a loose tender count
  const isCruncherSandwich =
    /\bcruncher\b/.test(text) ||
    /tender in a soft bun|chicken tender in a (?:soft )?bun/.test(text);

  // Collapse "choice of A, B or C" → first option only (OR, not AND "fries and drink")
  text = text.replace(
    /(?:with a |your |& your )?choice of\s+(.+?)(?=\s*,\s*served|\s+served|\s+and a\s+(?:kids|regular|hot|big)|\.|$)/gi,
    (_m, opts: string) => {
      const first = splitOrChoiceOptions(String(opts))[0] || String(opts).split(/,|\bor\b/i)[0];
      return first.trim();
    }
  );

  const units: Record<string, number> = {};

  // Sandwich mains first (so bun tender is not counted as loose tender)
  if (isCruncherSandwich || text.includes('sandwich') || text.includes('superstack')) {
    if (text.includes('superstack')) units.chicken_sandwich = 2;
    else units.chicken_sandwich = 1;
  }
  // Wrap products — not when we're only mentioning wrap in passing
  if (/\bwrap\b/.test(nameL) && !units.chicken_sandwich && !text.includes('mac')) {
    units.chicken_wrap = 1;
  }

  // Loose tenders (packs / free meal sides) — not the sandwich "tender in a bun"
  if (isCruncherSandwich) {
    const extraTender = text.match(/(\d+)\s*(?:classic|spicy)\s*tenders?\b/i);
    if (extraTender) units.boneless_tender = parseInt(extraTender[1], 10);
    else {
      // After choice collapse to "2 tenders"
      const plain = text.match(/(\d+)\s*tenders?\b/i);
      if (plain && !/in a (?:soft )?bun/.test(text)) {
        units.boneless_tender = parseInt(plain[1], 10);
      }
    }
  } else {
    const tender = text.match(/(\d+)\s*(?:classic\s*|spicy\s*|hand\s*breaded\s*)?tenders?\b/i);
    if (tender) units.boneless_tender = parseInt(tender[1], 10);
  }

  // Wings — allow flavour words between count and "wings" (Cajun Citrus / Ghost Pepper)
  const wing = text.match(/(\d+)\s+(?:(?:hot|cajun|citrus|ghost|pepper|saucin['’]?|honey|bbq|garlic|parm|[\w'-]+)\s+){0,5}wings?\b/i);
  if (wing && !units.boneless_tender) units.hot_wing = parseInt(wing[1], 10);

  // Boneless chicken (not wings) — "3 Boneless", "8 Ghost Pepper Boneless"
  if (!units.boneless_tender && !units.hot_wing) {
    const boneless = text.match(/(\d+)\s*(?:\w+\s+){0,3}boneless(?!\s*wing)/i);
    if (boneless) {
      units.chicken_piece = Math.max(units.chicken_piece || 0, parseInt(boneless[1], 10));
    }
  }
  const sigPc = text.match(/(\d+)\s*piece\s+signature/i);
  if (sigPc) units.chicken_piece = parseInt(sigPc[1], 10);
  const pc = text.match(/(\d+)\s*(?:pc|pcs|pieces?)\b/i);
  if (pc && !units.hot_wing && !units.chicken_piece && !units.boneless_tender) {
    units.chicken_piece = parseInt(pc[1], 10);
  }

  // Mac & cheese (kids Poppy meals, sides)
  if (text.includes('mac & cheese') || text.includes('mac and cheese')) {
    units.mac_and_cheese = 1;
  }

  const nug = text.match(/(\d+)\s*(?:shatter\s*)?(?:crunchin['’]?\s*)?nuggets?/i);
  if (nug) units.nugget = parseInt(nug[1], 10);

  // Kids / regular fries (Poppy: "Kids Fries or Kids Salad")
  if (text.includes('fries') || text.includes('kids fries') || text.includes('kids salad')) {
    const friesN = text.match(/(\d+)\s*(?:regular\s*)?fries/i);
    units.fries_reg = friesN ? parseInt(friesN[1], 10) : 1;
  }
  if (text.includes('biscuit')) {
    const b = text.match(/(\d+)\s*biscuits?/i);
    units.biscuit = b ? parseInt(b[1], 10) : 1;
  }
  if (text.includes('smoky beans') || (text.includes('beans') && (text.includes('sharer') || text.includes('feast')))) {
    const bn = text.match(/(\d+)\s*(?:smoky\s*)?beans/i);
    units.beans_reg = bn ? parseInt(bn[1], 10) : 1;
  }
  if (/\b2 regular sides\b/.test(text) || text.includes('choice of 2 regular sides')) {
    units.beans_reg = Math.max(units.beans_reg || 0, 2);
  } else if (text.includes('regular side') && !text.includes('regular sides')) {
    units.beans_reg = Math.max(units.beans_reg || 0, 1);
  }
  if (
    text.includes('drink') ||
    text.includes('kids drink') ||
    text.includes('pepsi') ||
    text.includes('lemonade') ||
    text.includes('bottle of drink') ||
    text.includes('bottled drink') ||
    /\bsoda\b/.test(text) ||
    /\bcoke\b|\bcoca-?\s*cola\b|\bsprite\b|\bfanta\b|\birn\s*bru\b/.test(text)
  ) {
    units.drink_reg = 1;
  }
  // Dip pots only — never mark "Hot Honey Sandwich / Box Meal" as a dip
  const isDipOnlyName =
    /\bdip\b/.test(nameL) ||
    /^(the big )?(hot honey|kickback|ranch|cheese|bold bbq|garlic mayo)$/i.test(nameL);
  if (
    isDipOnlyName &&
    !/sandwich|wrap|superstack|wing|tender|meal|box|boneless/i.test(nameL)
  ) {
    const dipN = text.match(/(\d+)\s*(?:big\s*)?dips?\b/i);
    units.dip = dipN ? parseInt(dipN[1], 10) : 1;
  } else if (/\bhot honey dip\b/.test(text) && !/sandwich|meal|box/i.test(nameL)) {
    units.dip = 1;
  }

  // Common regular sides (avoid opaque UUID units that break Mode 1)
  if (/\bcoleslaw\b|\bcole slaw\b|\bslaw\b/.test(text)) units.coleslaw = 1;
  if (/\bmash(?:ed)?\b|\bmashed potato/.test(text)) units.mash = 1;
  if (/\bcorn\b|\bcobette\b/.test(text) && !/popcorn/.test(text)) units.corn_cob = 1;
  if (/\bgravy\b/.test(text)) units.gravy_reg = 1;
  if (/\brice\b/.test(text) && !/price/.test(text)) units.rice = 1;
  if (/\bsalad\b/.test(text) && !/sandwich|wrap|meal|box/.test(nameL)) units.salad = 1;
  if (/\bcajun\s*fries\b|\bloaded\s*fries\b/.test(text)) {
    units.fries_reg = Math.max(units.fries_reg || 0, 1);
  }

  return units;
}

/** Stable opaque unit key from a product name (never raw POS UUIDs). */
function opaqueUnitKeyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `sku:${slug || 'item'}`;
}

type PopCatalogItem = {
  id: string;
  name: string;
  price: number;
  isCombo?: boolean;
  atomicUnits?: Record<string, number>;
  description?: string;
};

function isSkippedMealOptionName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return /^(no thanks|none|no dip|no sauce|no drink)\b/.test(n);
}

/**
 * Free (price 0) default picks for a meal builder slot.
 * When several free proteins are listed (OR), prefer the option matching
 * description first-choice units (e.g. "2 Tenders" over "3 Hot Wings").
 */
function pickIncludedOptions(
  options: any[] | undefined,
  limit: number | null | undefined,
  preferredUnits?: Record<string, number> | null
): any[] {
  if (!limit || limit <= 0 || !Array.isArray(options) || options.length === 0) return [];
  const free = options.filter((o) => {
    const n = String(o.productName || o.name || '');
    if (isSkippedMealOptionName(n)) return false;
    return parsePrice(o.price) === 0;
  });
  if (!free.length) return [];

  if (preferredUnits && Object.keys(preferredUnits).length && free.length > 1 && limit === 1) {
    const scored = free.map((o) => {
      const u = extractPopeyesAtomicUnits(String(o.productName || o.name || ''), '');
      let score = 0;
      for (const [k, v] of Object.entries(preferredUnits)) {
        if (!v) continue;
        if (u[k] === v) score += 10;
        else if (u[k]) score += 2;
      }
      // Prefer exact protein-only option names over vague matches
      if (score > 0 && Object.keys(u).length === 1) score += 1;
      return { o, score };
    });
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score > 0) return [scored[0].o];
  }
  return free.slice(0, limit);
}

function findCatalogByExternalId(catalog: PopCatalogItem[], externalId: string | undefined): PopCatalogItem | null {
  if (!externalId) return null;
  const id = `pop_${externalId}`;
  return catalog.find((c) => c.id === id && c.price > 0) || null;
}

/** Dip pots / sauces — never use as a box-meal main. */
function isDipOnlyCatalogItem(c: PopCatalogItem): boolean {
  const n = c.name.toLowerCase().trim();
  if (/sandwich|wrap|superstack|meal|box|wing|tender|boneless|fries|piece/i.test(n)) {
    return false;
  }
  if (/\bdip\b/.test(n)) return true;
  // Bare sauce names: "Hot Honey", "Kickback", "Ranch"
  return /^(the big )?(hot honey|kickback|ranch|cheese|bold bbq|garlic mayo)$/i.test(n);
}

function findCatalogByName(
  catalog: PopCatalogItem[],
  want: string,
  opts?: { allowDips?: boolean; preferSandwich?: boolean }
): PopCatalogItem | null {
  const n = want.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return null;
  let usable = catalog.filter((c) => c.price > 0 && !c.isCombo);
  if (!opts?.allowDips) usable = usable.filter((c) => !isDipOnlyCatalogItem(c));

  // Prefer sandwich when resolving a meal main from a short brand prefix ("Hot Honey")
  if (opts?.preferSandwich) {
    const sand = usable.find(
      (c) =>
        /sandwich/i.test(c.name) &&
        (c.name.toLowerCase() === `${n} sandwich` ||
          c.name.toLowerCase().startsWith(`${n} sandwich`) ||
          c.name.toLowerCase().startsWith(n + ' '))
    );
    if (sand) return sand;
  }

  let hit = usable.find((c) => c.name.toLowerCase() === n);
  if (hit) return hit;
  hit = usable.find(
    (c) =>
      (c.name.toLowerCase().startsWith(n) && c.name.length <= want.length + 14) ||
      (n.startsWith(c.name.toLowerCase()) && want.length <= c.name.length + 6)
  );
  return hit || null;
}

/** Meal name → standalone main (e.g. Hot Honey Box Meal → Hot Honey Sandwich). */
function findMealMainAlaCarte(mealName: string, catalog: PopCatalogItem[]): PopCatalogItem | null {
  let base = mealName
    .replace(/\s*(big\s*)?box\s*meal\s*$/i, '')
    .replace(/\s+meal\s*$/i, '')
    .trim();

  const usable = catalog.filter((c) => c.price > 0 && !c.isCombo && !isDipOnlyCatalogItem(c));
  const descImpliesSandwich = /sandwich/i.test(mealName);

  // Prefer explicit sandwich / superstack titles first
  // "Hot Honey" → "Hot Honey Sandwich" (never the £0.89 dip)
  const tryNames = [
    base,
    `${base} Sandwich`,
    base.replace(/\s+sandwich$/i, '') + ' Sandwich',
    `${base} Superstack Sandwich`,
  ];
  // From description-style: "Hot Honey Sandwich with a choice…" already in mealName path
  if (!/\bsandwich\b/i.test(base) && descImpliesSandwich) {
    tryNames.unshift(`${base} Sandwich`);
  }

  for (const tryName of tryNames) {
    const t = tryName.replace(/\s+/g, ' ').trim();
    if (!t || t.length < 4) continue;
    const exact = usable.find((c) => c.name.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
  }

  // Short brand prefix → prefer sandwich (Hot Honey → Hot Honey Sandwich, not dip)
  let hit = findCatalogByName(catalog, base, { preferSandwich: true });
  if (hit && !isDipOnlyCatalogItem(hit)) return hit;

  // Drop size words: "The BIG Chicken Cruncher" → "The Chicken Cruncher"
  base = base
    .replace(/\b(big|large|small|mega|xl)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  hit = findCatalogByName(catalog, base, { preferSandwich: true });
  if (hit && !isDipOnlyCatalogItem(hit)) return hit;

  // Substring: longest sandwich preferred
  const ranked = [...usable].sort((a, b) => {
    const aSand = /sandwich/i.test(a.name) ? 0 : 1;
    const bSand = /sandwich/i.test(b.name) ? 0 : 1;
    if (aSand !== bSand) return aSand - bSand;
    return b.name.length - a.name.length;
  });
  const baseL = base.toLowerCase();
  const mealL = mealName.toLowerCase();
  for (const c of ranked) {
    if (descImpliesSandwich && /wrap/i.test(c.name) && !/sandwich/i.test(c.name)) continue;
    const cn = c.name.toLowerCase().replace(/^the\s+/, '');
    // Require catalogue name to be contained in meal title (or vice versa for short bases)
    if (mealL.includes(cn) || baseL.includes(cn) || cn.includes(baseL)) {
      // Avoid matching bare "honey" style false positives: require substantial overlap
      if (cn.length >= 8 || /sandwich|cruncher|wrap|burger/i.test(cn)) return c;
    }
  }
  return null;
}

/**
 * Map a free meal-builder option to catalogue line + units.
 * Options like "1 Classic Tender" may only exist as meal choices (no street SKU).
 */
function resolveMealOption(
  opt: any,
  catalog: PopCatalogItem[]
): { component?: { itemId: string; name: string; count: number; category: string }; units: Record<string, number> } {
  const name = String(opt.productName || opt.name || '').trim();
  if (!name || isSkippedMealOptionName(name)) return { units: {} };

  const byId = findCatalogByExternalId(catalog, opt.externalId);
  const units = extractPopeyesAtomicUnits(name, '');
  const looksLikeDip =
    isDipOnlyCatalogItem({ id: '', name, price: 1 }) ||
    /\bdip\b/i.test(name) ||
    (/^(hot honey|kickback|ranch|bold bbq|garlic mayo)$/i.test(name.trim()) &&
      !/sandwich|wrap/i.test(name));
  const byName =
    byId ||
    findCatalogByName(catalog, name, {
      allowDips: looksLikeDip,
      preferSandwich: !looksLikeDip && /honey|crunch|cajun|classic|spicy/i.test(name),
    });
  if (byName) {
    const cat = /drink|soda|cola|lemonade|juice|water|pepsi/i.test(byName.name)
      ? 'drink'
      : /fries|side|beans|slaw|mac|corn|biscuit|gravy|mash|salad|rice/i.test(byName.name)
        ? 'side'
        : isDipOnlyCatalogItem(byName)
          ? 'extra'
          : 'main';
    // Prefer parsed option units for pure protein counts ("3 Hot Wings") over
    // a wrongly fuzzy-matched multi-unit SKU (e.g. wrap that mentions tenders).
    const useUnits =
      Object.keys(units).length > 0 &&
      (!byName.atomicUnits ||
        Object.keys(units).some((k) => (units[k] || 0) !== (byName.atomicUnits?.[k] || 0)))
        ? units
        : byName.atomicUnits && Object.keys(byName.atomicUnits).length
          ? { ...byName.atomicUnits }
          : units;
    // If catalog hit is a wrap/sandwich but option is clearly wings/tenders, keep units only
    if (
      (/wrap|sandwich/i.test(byName.name) &&
        (units.hot_wing || units.boneless_tender || units.chicken_piece) &&
        !units.chicken_wrap &&
        !units.chicken_sandwich)
    ) {
      return { units };
    }
    return {
      component: { itemId: byName.id, name: byName.name, count: 1, category: cat },
      units: useUnits,
    };
  }

  // Last resort: still link by externalId when present so Stage 1/2 can id-match
  const ext = String(opt.externalId || '').trim();
  if (ext) {
    const byExt = findCatalogByExternalId(catalog, ext);
    if (byExt) {
      const fallbackUnits =
        Object.keys(units).length > 0
          ? units
          : byExt.atomicUnits && Object.keys(byExt.atomicUnits).length
            ? { ...byExt.atomicUnits }
            : { [opaqueUnitKeyFromName(byExt.name || name)]: 1 };
      return {
        component: {
          itemId: byExt.id,
          name: byExt.name || name,
          count: 1,
          category: 'extra',
        },
        units: fallbackUnits,
      };
    }
    // Option not sold solo — keep name-based opaque unit for incomplete messaging
    if (Object.keys(units).length === 0 && name) {
      return { units: { [opaqueUnitKeyFromName(name)]: 1 } };
    }
  }
  return { units };
}

/**
 * From product-detail mealTypes defaults → components + units (same slots as web builder).
 * GET …/restaurants/{uuid}/menus/{menuId}/items/{externalId}
 */
function resolvePopeyesMealDetail(
  detail: any,
  catalog: PopCatalogItem[],
  mealItemId: string
): {
  components: { itemId: string; name: string; count: number; category: string }[];
  equivalentAlaCarteIds: string[];
  atomicUnits: Record<string, number>;
} | null {
  const mt = detail?.menuItems?.[0]?.mealTypes?.[0];
  if (!mt) return null;

  const components: { itemId: string; name: string; count: number; category: string }[] = [];
  const equivalentAlaCarteIds: string[] = [];
  const atomicUnits: Record<string, number> = {};

  const addUnits = (u: Record<string, number>) => {
    for (const [k, v] of Object.entries(u || {})) {
      if (v) atomicUnits[k] = (atomicUnits[k] || 0) + v;
    }
  };

  const mealName = String(mt.productName || '');
  const mealDesc = String(mt.shortDescription || '');

  // Description first-choice protein (OR list) — prefer over API option order
  const firstChoice = firstChoiceFromDescription(mealDesc);
  const preferredProtein = firstChoice
    ? extractPopeyesAtomicUnits(firstChoice, '')
    : null;
  const proteinKeys = new Set(['boneless_tender', 'hot_wing', 'chicken_piece', 'nugget']);

  // 1) Standalone main (strip “Meal” / Box Meal / size words)
  const main = findMealMainAlaCarte(
    mealName.replace(/\s+box\s+meal\s*$/i, ' Meal').replace(/\s+meal\s*$/i, ''),
    catalog
  );
  // Prefer sandwich over wrap when both match substring
  let mainHit = main;
  if (mainHit && /wrap/i.test(mainHit.name) && /sandwich/i.test(mealName)) {
    const sandwich = catalog.find(
      (c) =>
        !c.isCombo &&
        c.price > 0 &&
        /sandwich/i.test(c.name) &&
        mealName.toLowerCase().includes(c.name.toLowerCase().replace(/\s+sandwich.*/i, ''))
    );
    if (sandwich) mainHit = sandwich;
  }
  // findMealMainAlaCarte on "Cajun Crunch Sandwich" after strip box meal
  if (!mainHit) {
    mainHit = findMealMainAlaCarte(mealName.replace(/\s*(big\s*)?box\s*meal\s*$/i, '').trim(), catalog);
  }

  if (mainHit && mainHit.id !== mealItemId) {
    components.push({ itemId: mainHit.id, name: mainHit.name, count: 1, category: 'main' });
    equivalentAlaCarteIds.push(mainHit.id);
    if (mainHit.atomicUnits) addUnits(mainHit.atomicUnits);
    else addUnits(extractPopeyesAtomicUnits(mainHit.name, mainHit.description || ''));
  } else {
    addUnits(extractPopeyesAtomicUnits(mealName, mealDesc));
  }

  // 2) Free included builder slots (price 0 defaults) — includes sauces/dips
  const slots: {
    opts: any[] | undefined;
    limit: number | null | undefined;
    preferProtein?: boolean;
  }[] = [
    { opts: mt.sides, limit: mt.sidesLimit, preferProtein: true },
    { opts: mt.additionalSides1, limit: mt.additionalSides1Limit, preferProtein: true },
    { opts: mt.additionalSides2, limit: mt.additionalSides2Limit, preferProtein: true },
    { opts: mt.additionalSides3, limit: mt.additionalSides3Limit, preferProtein: true },
    { opts: mt.drinks, limit: mt.drinksLimit },
    { opts: mt.sauces, limit: mt.saucesLimit },
  ];
  let builderProteinSet = false;
  for (const { opts, limit, preferProtein } of slots) {
    const picked = pickIncludedOptions(
      opts,
      limit,
      preferProtein ? preferredProtein : null
    );
    for (const opt of picked) {
      const resolved = resolveMealOption(opt, catalog);
      if (resolved.component) {
        components.push(resolved.component);
        equivalentAlaCarteIds.push(resolved.component.itemId);
      }
      const beforeProtein = [...proteinKeys].some((k) => (atomicUnits[k] || 0) > 0);
      addUnits(resolved.units);
      const afterProtein = [...proteinKeys].some((k) => (atomicUnits[k] || 0) > 0);
      if (!beforeProtein && afterProtein) builderProteinSet = true;
    }
  }

  // 3) Description fill — never add alternate OR proteins once builder/desc choice picked
  const fromDesc = extractPopeyesAtomicUnits(mealName, mealDesc);
  for (const [k, v] of Object.entries(fromDesc)) {
    if (!v) continue;
    if (atomicUnits[k]) continue;
    if (proteinKeys.has(k) && builderProteinSet) continue;
    if (proteinKeys.has(k) && [...proteinKeys].some((pk) => (atomicUnits[pk] || 0) > 0)) continue;
    atomicUnits[k] = v;
  }

  return { components, equivalentAlaCarteIds, atomicUnits };
}

function collectPopeyesItems(categories: any[]): any[] {
  const out: any[] = [];
  const walk = (cats: any[]) => {
    for (const cat of cats || []) {
      const label = String(cat.categoryShortName || cat.categoryLongName || '');
      for (const item of Array.isArray(cat.items) ? cat.items : []) {
        out.push({ ...item, _catLabel: label });
      }
      if (Array.isArray(cat.subcategories) && cat.subcategories.length) {
        walk(cat.subcategories);
      }
    }
  };
  walk(categories);
  return out;
}

function normalizePopeyesMenuBase(raw: any, brandName: string, storeRef: string, menuId: string) {
  const categories = Array.isArray(raw?.categories) ? raw.categories : [];
  const seen = new Set<string>();
  const items: any[] = [];

  for (const rawItem of collectPopeyesItems(categories)) {
    if (rawItem.outOfStock) continue;
    const price = parsePrice(rawItem.price);
    if (price <= 0) continue;
    const posId = String(rawItem.externalId || rawItem.slug || '');
    if (!posId || seen.has(posId)) continue;
    seen.add(posId);

    const name = String(rawItem.productName || rawItem.categoryViewProductName || 'Popeyes Item').trim();
    const description = String(rawItem.shortDescription || '').trim();
    const catLabel = String(rawItem._catLabel || '');
    const isCombo = isPopeyesComboName(name, !!rawItem.isComboMeal);
    const category = mapPopeyesCategory(catLabel, name, isCombo);
    const daypart = /breakfast/i.test(catLabel + name) ? 'breakfast' : undefined;
    const atomicUnits = extractPopeyesAtomicUnits(name, description);
    // Standalone Mac & Cheese (not only inside Poppy meal)
    if (!isCombo && (name.toLowerCase().includes('mac & cheese') || name.toLowerCase().includes('mac and cheese'))) {
      atomicUnits.mac_and_cheese = 1;
      delete atomicUnits[posId];
    }
    // Strip accidental raw UUID unit keys (legacy / bad merges)
    for (const k of Object.keys(atomicUnits)) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k)) delete atomicUnits[k];
    }
    // Ala-carte with no units: name-based opaque key (auditor can still id-match via pop_{uuid})
    if (Object.keys(atomicUnits).length === 0 && !isCombo) {
      atomicUnits[opaqueUnitKeyFromName(name)] = 1;
    }

    items.push({
      id: `pop_${posId}`,
      name,
      category,
      price,
      description: description || undefined,
      imageUrl: rawItem.imageUrl || undefined,
      isCombo: isCombo || undefined,
      daypart,
      atomicUnits: Object.keys(atomicUnits).length ? atomicUnits : undefined,
      // Used only while enriching combo meals from product-detail API
      _externalId: posId,
      _isComboMeal: !!rawItem.isComboMeal || isCombo,
    });
  }

  return {
    id: 'popeyes_uk',
    name: brandName,
    country: 'United Kingdom',
    currencySymbol: '£',
    currencyCode: 'GBP',
    accentColor: '#f15a29',
    logoText: 'POP',
    locationTiers: [
      { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
      { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
      { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
    ],
    daypartConfig: {
      supported: ['breakfast', 'main'],
      defaultFilter: 'main',
      labels: { breakfast: 'Breakfast', main: 'All day', all: 'Full menu' },
      timezone: 'Europe/London',
    },
    disclaimer:
      'Popeyes UK Collection prices are indicative and vary by store. Not official app checkout totals. Item names & descriptions are from the live menu.',
    updatedAt: new Date().toISOString(),
    menuVersion: `live-${storeRef}-${menuId}`,
    items,
    _source: {
      channel: 'Collection',
      storeRef,
      menuId,
      source: 'popeyes_live',
    },
  };
}

/** Product detail — meal builder slots (sides/drinks defaults). Needs restaurant UUID. */
async function fetchPopeyesItemDetail(
  env: LiveEnv,
  restaurantUuid: string,
  menuId: string,
  itemExternalId: string
): Promise<any | null> {
  const base = popeyesApiBase(env);
  const url = `${base}/en/restaurants/${encodeURIComponent(restaurantUuid)}/menus/${encodeURIComponent(menuId)}/items/${encodeURIComponent(itemExternalId)}`;
  try {
    const res = await fetch(url, { headers: popeyesHeaders() });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: any; hasErrors?: boolean };
    if (body?.hasErrors || !body?.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Second pass: for each combo meal, GET item detail and map free builder defaults
 * to catalogue lines (main sandwich, free tender, fries, soda).
 *
 * Bounded so Cloudflare / client timeouts do not fail the whole menu load.
 */
async function enrichPopeyesCombos(
  env: LiveEnv,
  menu: ReturnType<typeof normalizePopeyesMenuBase>,
  restaurantUuid: string,
  menuId: string
) {
  const catalog: PopCatalogItem[] = menu.items.map((i: any) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    isCombo: i.isCombo,
    atomicUnits: i.atomicUnits,
    description: i.description,
  }));

  // Prefer meal-like names first; cap count for latency
  const combos = menu.items
    .filter((i: any) => i._isComboMeal || i.isCombo)
    .sort((a: any, b: any) => {
      const score = (n: string) =>
        (/\bbox meal\b/i.test(n) ? 0 : 2) + (/\bmeal\b/i.test(n) ? 0 : 1);
      return score(a.name) - score(b.name);
    })
    .slice(0, 36);

  const started = Date.now();
  const BUDGET_MS = 12_000;

  await mapPool(combos, 4, async (item: any) => {
    if (Date.now() - started > BUDGET_MS) return;
    const ext = String(item._externalId || '');
    if (!ext) return;
    try {
      const detail = await fetchPopeyesItemDetail(env, restaurantUuid, menuId, ext);
      if (!detail) return;
      const resolved = resolvePopeyesMealDetail(detail, catalog, item.id);
      if (!resolved) return;
      if (resolved.components.length) {
        item.components = resolved.components;
      }
      const allResolved =
        resolved.components.length > 0 && resolved.components.every((c) => !!c.itemId);
      if (allResolved && resolved.equivalentAlaCarteIds.length) {
        item.equivalentAlaCarteIds = resolved.equivalentAlaCarteIds;
      }
      if (Object.keys(resolved.atomicUnits).length) {
        item.atomicUnits = resolved.atomicUnits;
      }
    } catch {
      // skip this combo only
    }
  });

  for (const i of menu.items) {
    delete i._externalId;
    delete i._isComboMeal;
  }
  return menu;
}

function mapPopeyesStore(r: any) {
  if (!r) return null;
  // Coming soon / non-orderable shops still listed for discovery when flag true
  const slug = String(r.slug || '').trim();
  const id = slug || String(r.id || '');
  if (!id) return null;
  if (r.showDetailsAsComingSoonPage && !r.isOrderingAvailable) return null;

  const nameRaw = String(r.storeName || r.name || slug).trim();
  const name = nameRaw.startsWith('Popeyes') ? nameRaw : `Popeyes ${nameRaw}`;
  const { address, city, postcode } = parsePopeyesAddress(String(r.storeAddress || ''));
  let tierId = 'standard';
  if (/london/i.test(city + name)) tierId = 'london_central';
  if (/airport|services|motorway|station/i.test(name + address)) tierId = 'highway_travel';

  const coords = r.storeLocation?.coordinates || r.coordinates;
  return {
    id,
    name,
    address,
    city,
    postcode,
    latitude: coords?.latitude,
    longitude: coords?.longitude,
    tierId,
    isAppMenuAvailable: r.isOrderingAvailable !== false,
    _uuid: r.id,
  };
}

async function fetchPopeyesRestaurant(env: LiveEnv, storeId: string) {
  const base = popeyesApiBase(env);
  const url = `${base}/api/v2/restaurants/${encodeURIComponent(storeId)}`;
  const res = await fetch(url, { headers: popeyesHeaders() });
  if (!res.ok) throw new Error(`Popeyes restaurant HTTP ${res.status} for ${storeId}`);
  const body = (await res.json()) as { data?: any; hasErrors?: boolean };
  if (!body?.data) throw new Error(`Popeyes restaurant empty for ${storeId}`);
  return body.data;
}

/**
 * Prefer Collection / pickup menus from restaurant.menus.
 * API sometimes returns menus: [] — then we probe known menu ids that the SPA uses.
 */
function pickCollectionMenuIdFromList(restaurant: any): string | null {
  const menus: any[] = Array.isArray(restaurant?.menus) ? restaurant.menus : [];
  const collection =
    menus.find(
      (m) =>
        String(m.orderingFlow || '').toLowerCase() === 'collection' && m.isActive !== false
    ) ||
    menus.find((m) => String(m.orderingFlow || '').toLowerCase() === 'collection') ||
    menus.find((m) => /order\s*(lunch|now)/i.test(String(m.id || m.name || ''))) ||
    menus.find((m) => m.isActive !== false && m.id) ||
    menus[0];
  return collection?.id ? String(collection.id) : null;
}

/** Known Collection menu id patterns used by popeyesuk.com when restaurant.menus is empty. */
const POPEYES_MENU_ID_CANDIDATES = [
  'Order Now.',
  'Order Lunch.',
  'Order Now',
  'Order Lunch',
  'Order Now. Collection',
  'Collection',
];

async function fetchPopeyesMenuBody(
  env: LiveEnv,
  ref: string,
  menuId: string
): Promise<{ data: any; menuId: string } | null> {
  const base = popeyesApiBase(env);
  const menuUrl = `${base}/en/restaurants/${encodeURIComponent(ref)}/menus/${encodeURIComponent(menuId)}`;
  try {
    const res = await fetch(menuUrl, { headers: popeyesHeaders() });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: any; hasErrors?: boolean };
    if (!body?.data) return null;
    const cats = body.data.categories;
    // Empty category tree is not a usable menu
    if (Array.isArray(cats) && cats.length === 0) return null;
    return { data: body.data, menuId };
  } catch {
    return null;
  }
}

/**
 * Resolve a working Collection menu id + body.
 * 1) restaurant.menus when present
 * 2) probe known ids (API often returns menus: [] but Order Now. still works)
 */
async function loadPopeyesCollectionMenu(
  env: LiveEnv,
  restaurant: any,
  storeId: string
): Promise<{ data: any; menuId: string; ref: string }> {
  const ref = String(restaurant.slug || restaurant.id || storeId);
  const fromList = pickCollectionMenuIdFromList(restaurant);
  const tried = new Set<string>();
  const candidates = [
    ...(fromList ? [fromList] : []),
    ...POPEYES_MENU_ID_CANDIDATES,
  ];

  for (const id of candidates) {
    if (!id || tried.has(id)) continue;
    tried.add(id);
    const hit = await fetchPopeyesMenuBody(env, ref, id);
    if (hit) return { data: hit.data, menuId: hit.menuId, ref };
  }

  // Last resort: try restaurant UUID path (some edge stores)
  const uuid = String(restaurant.id || '');
  if (uuid && uuid !== ref) {
    for (const id of candidates) {
      if (!id) continue;
      const hit = await fetchPopeyesMenuBody(env, uuid, id);
      if (hit) return { data: hit.data, menuId: hit.menuId, ref: uuid };
    }
  }

  throw new Error(
    `No Collection (pickup) menu for this Popeyes store (${ref}). menus[] empty and known menu ids returned no categories.`
  );
}

export async function fetchPopeyesMenu(env: LiveEnv, storeId: string) {
  const restaurant = await fetchPopeyesRestaurant(env, storeId);
  const { data, menuId, ref } = await loadPopeyesCollectionMenu(env, restaurant, storeId);
  const restaurantUuid = String(restaurant.id || '');
  const menu = normalizePopeyesMenuBase(data, 'Popeyes UK', ref, menuId);

  // Combo detail enrichment is best-effort — never fail the whole menu load
  // (detail fan-out can be slow; list menu alone is enough for browsing)
  if (restaurantUuid) {
    try {
      await enrichPopeyesCombos(env, menu, restaurantUuid, menuId);
    } catch (e) {
      console.warn(
        'Popeyes combo enrichment skipped:',
        e instanceof Error ? e.message : e
      );
    }
  }
  return menu;
}

export async function fetchPopeyesStores(env: LiveEnv, q: string) {
  const base = popeyesApiBase(env);
  const res = await fetch(`${base}/api/v2/restaurants`, { headers: popeyesHeaders() });
  if (!res.ok) throw new Error(`Popeyes stores HTTP ${res.status}`);
  const body = (await res.json()) as { data?: any[] };
  let stores = (Array.isArray(body?.data) ? body.data : [])
    .map(mapPopeyesStore)
    .filter(Boolean) as any[];

  // Prefer shops that can order online
  stores = stores.filter((s) => s.isAppMenuAvailable !== false);

  if (q.trim()) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) => {
      const blob = [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x ?? '').toLowerCase().replace(/\s+/g, ''))
        .join(' ');
      return blob.includes(qq);
    });
  }
  return { stores, source: 'popeyes_live', count: stores.length };
}

