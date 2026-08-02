/**
 * Popeyes UK rules for the shared multi-level menu pipeline.
 *
 * Demonstrates provider-agnostic reuse: same `runMenuPipeline` + FieldBlob
 * as KFC; only phrases / unit parsing differ. Wire into popeyes-uk when ready
 * (menu tree is already cleaner than KFC POS — less promote/slot work).
 */
import {
  type FieldBlob,
  type MenuPipelineRules,
  fuzzAny,
  fuzzName,
  normText,
  runMenuPipeline,
} from './menu-pipeline';

function isJunk(blob: FieldBlob): boolean {
  return fuzzAny(blob, ['do not use', 'test item', 'donation'], 'name');
}

function isComboName(displayName: string, blob: FieldBlob): boolean {
  const n = normText(displayName);
  if (fuzzAny(blob, ['box meal', 'big box', 'sharer', 'feast', 'banquet', 'poppy meal'], 'name')) {
    return true;
  }
  if (/\bbox\b/.test(n) && !/\b\d+\s/.test(n)) return true;
  return false;
}

function mapCategory(ctx: {
  catLabel: string;
  displayName: string;
  blob: FieldBlob;
}): string {
  const nameL = normText(ctx.displayName);
  const c = `${normText(ctx.catLabel)} ${nameL}`;
  const combo = isComboName(ctx.displayName, ctx.blob);

  if (c.includes('kid') || c.includes('poppy')) return 'kids';
  if (c.includes('box meal') || c.includes('big box') || (combo && c.includes('box'))) {
    return 'box_meals';
  }
  if (c.includes('sharer') || c.includes('feast') || c.includes('family')) return 'buckets';
  if (
    /\b\d+\s*(classic\s*|spicy\s*)?tenders?\b/.test(nameL) ||
    /\b\d+\s*(hot\s*)?wings?\b/.test(nameL) ||
    /\b\d+\s*boneless\b/.test(nameL) ||
    nameL.includes('signature louisiana') ||
    (nameL.includes('tender') && !nameL.includes('sandwich') && !combo)
  ) {
    return 'chicken';
  }
  if (
    c.includes('shake') ||
    c.includes('whipz') ||
    c.includes('cookie') ||
    c.includes('dessert') ||
    c.includes('ice cream') ||
    c.includes('mud pie')
  ) {
    return 'desserts';
  }
  if (
    c.includes('drink') ||
    c.includes('lemonade') ||
    c.includes('pepsi') ||
    c.includes('coke') ||
    c.includes('sprite') ||
    c.includes('fanta') ||
    c.includes('water') ||
    c.includes('juice')
  ) {
    return 'drinks';
  }
  if (
    c.includes('side') ||
    c.includes('fries') ||
    c.includes('biscuit') ||
    c.includes('beans') ||
    c.includes('coleslaw') ||
    c.includes('mac') ||
    c.includes('mash') ||
    c.includes('corn')
  ) {
    return 'sides';
  }
  if (
    c.includes('wrap') ||
    c.includes('sandwich') ||
    c.includes('superstack') ||
    c.includes('burger')
  ) {
    return 'burgers';
  }
  if (nameL.includes('mac & cheese') || nameL.includes('mac and cheese')) return 'sides';
  if (c.includes('dip') || (/\bsauce\b/.test(nameL) && !nameL.includes('fries'))) return 'dips';
  if (c.includes('tender') || c.includes('wing') || c.includes('boneless') || c.includes('chicken')) {
    return 'chicken';
  }
  if (combo || c.includes('meal') || c.includes('saver')) return 'meals';
  return 'sides';
}

/** Lightweight unit parse (full logic still lives in popeyes-uk until fully migrated). */
function extractUnits(ctx: {
  displayName: string;
  description: string;
}): Record<string, number> {
  let text = `${ctx.displayName} ${ctx.description}`.toLowerCase().replace(/\s+/g, ' ');
  text = text.replace(
    /(?:with a |your )?choice of\s+(.+?)(?=\s+and a\s+(?:kids|regular|hot|big)|\.|\s+served|$)/gi,
    (_m, opts: string) => String(opts).split(/,|\bor\b/i)[0].trim()
  );
  const units: Record<string, number> = {};
  const tender = text.match(/(\d+)\s*(?:classic\s*|spicy\s*|hand\s*breaded\s*)?tenders?/i);
  if (tender) units.boneless_tender = parseInt(tender[1], 10);
  const wing = text.match(/(\d+)\s*(?:hot\s*)?wings?/i);
  if (wing) units.hot_wing = parseInt(wing[1], 10);
  if (text.includes('sandwich') || text.includes('superstack')) {
    units.chicken_sandwich = text.includes('superstack') ? 2 : 1;
  }
  if (text.includes('fries')) units.fries_reg = 1;
  if (text.includes('biscuit')) units.biscuit = 1;
  if (text.includes('mac & cheese') || text.includes('mac and cheese')) units.mac_and_cheese = 1;
  if (text.includes('drink') || text.includes('pepsi') || text.includes('lemonade')) {
    units.drink_reg = 1;
  }
  if (/\bcoleslaw\b|\bslaw\b/.test(text)) units.coleslaw = 1;
  if (/\bmash(?:ed)?\b/.test(text)) units.mash = 1;
  if (/\bcorn\b|\bcobette\b/.test(text) && !/popcorn/.test(text)) units.corn_cob = 1;
  if (/\bgravy\b/.test(text)) units.gravy_reg = 1;
  if (/\brice\b/.test(text)) units.rice = 1;
  if (/\bsalad\b/.test(text) && !/sandwich|wrap|meal|box/.test(text)) units.salad = 1;
  return units;
}

export const popeyesMenuRules: MenuPipelineRules = {
  id: 'popeyes_uk',
  isJunk,
  classifyRole: (blob) => {
    if (isJunk(blob)) return { kind: 'junk' };
    // Popeyes SPA rarely emits builder "component" slots
    if (fuzzName(blob, 'component')) return { kind: 'slot' };
    return { kind: 'sellable' };
  },
  mapCategory,
  extractUnits,
  isCombo: ({ displayName, blob }) => isComboName(displayName, blob),
};

/** Optional entry: run one Popeyes line through the shared pipeline. */
export function pipelinePopeyesItem(input: {
  name: string;
  description?: string;
  catLabel?: string;
  price: number;
}) {
  return runMenuPipeline(input, popeyesMenuRules);
}
