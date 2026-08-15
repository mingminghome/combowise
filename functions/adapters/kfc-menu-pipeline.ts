/**
 * KFC UK rules for the shared multi-level menu pipeline.
 *
 * Brand-specific phrases, known meal builds, and category mapping live here.
 * Orchestration + FieldBlob fuzzy search → `./menu-pipeline`.
 */
import {
  type FieldBlob,
  type ItemRole,
  type MenuLineInput,
  type MenuPipelineRules,
  type PipelineResult,
  buildFieldBlob,
  fuzz,
  fuzzAny,
  fuzzMatch,
  fuzzName,
  normText,
  runMenuPipeline,
} from './menu-pipeline';

// ─── Level 1: junk ──────────────────────────────────────────────────────────

const JUNK_NAME = [
  /^donate\b/,
  /\bdonation\b/,
  /\bbag fee\b/,
  /\btakeaway bag\b/,
  /\bcarrier bag\b/,
  /^window$/,
  /\balc\b/,
  /do not use/,
  /test item/,
  /\bsyrup\b/,
  /\bcoffee shot\b/,
  /^cheese$/,
  /\b(caramel|vanilla|tiramisu|dark chocolate)\s+sauce\b/,
];

function isJunk(blob: FieldBlob): boolean {
  return JUNK_NAME.some((re) => re.test(blob.nameN));
}

// ─── Level 2: role ──────────────────────────────────────────────────────────

const SELLABLE_MEAL_PHRASES = [
  'box meal',
  'family feast',
  'bargain bucket',
  'party bucket',
  'wicked variety',
  'boneless banquet',
  'mighty bucket',
  'snack bucket',
  'colonels',
  "colonel's",
  'colonel',
];

const PROMOTE_PHRASES = [
  'family feast',
  'bargain bucket',
  'party bucket',
  'wicked variety',
  'boneless banquet',
  'mighty bucket',
];

function isSellableMealName(blob: FieldBlob): boolean {
  if (fuzzAny(blob, SELLABLE_MEAL_PHRASES, 'name')) return true;
  if (/^\d+\s*piece\s+(family feast|bargain bucket|party bucket|wicked)/.test(blob.nameN)) {
    return true;
  }
  if (fuzzName(blob, 'bucket') && !/\bcomponent\b/.test(blob.nameN)) return true;
  return false;
}

function promoteFromDescription(blob: FieldBlob): string | null {
  if (!/\bcomponents?\b/.test(blob.descN) && !/\bmeal\s*comp\b/.test(blob.descN)) return null;

  let cleaned = blob.description
    .replace(/\s+(meal\s+)?components?\.?\s*$/i, '')
    .replace(/\s+meal\s+meal$/i, ' meal')
    .trim();
  cleaned = cleaned.replace(/\s+components?\b.*$/i, '').trim();
  if (!cleaned || /\bcomponent\b/i.test(cleaned)) return null;

  const cleanedN = normText(cleaned);
  if (
    cleanedN.includes('piece box meal') ||
    cleanedN.includes('box meal with') ||
    cleanedN.includes('box meal component')
  ) {
    return null;
  }
  if (/\b(burger|twister|tower|naan)\b/.test(cleanedN)) return null;
  if (/\b(hotwings|popcorn size)\b/.test(cleanedN)) return null;
  if (!PROMOTE_PHRASES.some((p) => cleanedN.includes(normText(p)))) return null;
  if (/^party bucket$/.test(cleanedN) || /^wicked variety bucket$/.test(cleanedN)) return null;
  return cleaned;
}

function isBuilderSlot(blob: FieldBlob): boolean {
  if (isSellableMealName(blob)) return false;
  if (/\bcomponents?\b/.test(blob.all)) return true;
  if (/\bmeal\s*comp\b/.test(blob.all) || /\bmenu\s*comp\b/.test(blob.all)) return true;
  if (/^component\.?$/.test(blob.descN)) return true;
  // Short POS “choice” lines (e.g. “Large popcorn chicken choice”) are meal-builder
  // slot prices, not street ala-carte — same rule as auditor / pureCatalog.
  if (
    /\bchoice\b/.test(blob.descN) &&
    blob.descN.length < 80 &&
    !/your choice of/.test(blob.descN)
  ) {
    return true;
  }
  if (/\bchoice\b/.test(blob.posN) && blob.posN.length < 80) return true;
  return false;
}

function classifyRole(blob: FieldBlob): ItemRole {
  if (isJunk(blob)) return { kind: 'junk' };
  const promoted = promoteFromDescription(blob);
  if (isBuilderSlot(blob)) {
    if (promoted) return { kind: 'promote', displayName: promoted };
    return { kind: 'slot' };
  }
  if (promoted && !isSellableMealName(blob)) {
    return { kind: 'promote', displayName: promoted };
  }
  return { kind: 'sellable' };
}

// ─── Level 3: display ───────────────────────────────────────────────────────

function resolveDisplay(blob: FieldBlob, role: ItemRole) {
  if (role.kind === 'promote') {
    return {
      name: role.displayName,
      description: role.displayName,
      unitContext: `${blob.name} ${blob.description}`.trim(),
    };
  }
  let description = blob.description || undefined;
  if (
    description &&
    isSellableMealName(blob) &&
    /\bcomponents?\b/i.test(description) &&
    description.length < 100
  ) {
    description = blob.name;
  }
  return {
    name: blob.name,
    description,
    unitContext: '',
  };
}

// ─── Level 4: category ──────────────────────────────────────────────────────

const DRINK_HINTS = [
  'drink',
  'pepsi',
  'tango',
  '7up',
  '7 up',
  'kwench',
  'matcha',
  'robinsons',
  'lipton',
  'fruit shoot',
  'fruitshoot',
  'lemonade',
  'still water',
  'sparkling water',
  'latte',
  'cappuccino',
  'flat white',
  'americano',
  'espresso',
  'coffee',
  'oatly',
  'bottle',
  'litre',
  'liter',
  'shake',
  'juice',
  'smoothie',
  'boba',
  'refresher',
];

function isDrinkLine(blob: FieldBlob, displayName: string): boolean {
  const c = normText(`${blob.all} ${displayName}`);
  if (DRINK_HINTS.some((h) => c.includes(h))) {
    if (
      c.includes('bottle') &&
      /bucket|feast|meal|chicken|burger/.test(c) &&
      !/pepsi|tango|water|drink|kwench/.test(c)
    ) {
      return false;
    }
    return true;
  }
  return /\bwater\b/.test(c);
}

function mapCategory(ctx: {
  catLabel: string;
  displayName: string;
  blob: FieldBlob;
}): string {
  const nameL = normText(ctx.displayName);
  const catL = normText(ctx.catLabel);
  const c = `${catL} ${nameL} ${ctx.blob.nameN}`;

  // Kids before drinks — kids boxes mention "drink" in marketing copy and were miscategorised
  if (/\bkids?\b/.test(nameL) || /\bkids?\b/.test(catL)) return 'kids';
  // Food + drink combos ("… Meal", "Snack Box & Drink") are not the drinks aisle
  if (
    isDrinkLine(ctx.blob, ctx.displayName) &&
    !/bucket|feast|banquet|box meal|mega box|burger|chicken piece|popcorn|snack box|rice bowl|\bmeal\b|tender|wing|zinger|fillet|gravy mega/.test(
      nameL
    )
  ) {
    return 'drinks';
  }
  if (c.includes('box meal')) return 'box_meals';
  if (
    c.includes('dine for') ||
    c.includes('sharing') ||
    c.includes('bucket') ||
    c.includes('feast') ||
    c.includes('banquet') ||
    c.includes('mighty')
  ) {
    return 'buckets';
  }
  if (c.includes('rice bowl') || c.includes('street bowl')) return 'meals';
  if (c.includes('twister') || c.includes('burger') || c.includes('wrap') || c.includes('naan')) {
    return 'burgers';
  }
  if (
    c.includes('just chicken') ||
    c.includes('wing') ||
    c.includes('tender') ||
    c.includes('popcorn') ||
    nameL.includes('original recipe chicken')
  ) {
    return 'chicken';
  }
  if (c.includes('sweet') || c.includes('cookie') || c.includes('dessert') || c.includes('sundae')) {
    return 'desserts';
  }
  if (
    nameL.includes('fries') ||
    nameL.includes('gravy') ||
    nameL.includes('beans') ||
    nameL.includes('coleslaw') ||
    nameL.includes('slaw') ||
    nameL.includes('mash') ||
    nameL.includes('cajun rice') ||
    (nameL.includes('rice') && !nameL.includes('rice bowl')) ||
    nameL.includes('salad') ||
    nameL.includes('corn cob') ||
    nameL.includes('cobette') ||
    nameL.includes('hashbrown') ||
    nameL.includes('hash brown')
  ) {
    return 'sides';
  }
  if (
    (nameL.includes('dip') ||
      nameL.includes('mayo') ||
      (nameL.includes('ranch') && !nameL.includes('bowl') && !nameL.includes('burger')) ||
      nameL.endsWith('sauce') ||
      nameL.includes('sauce pot')) &&
    !nameL.includes('fries') &&
    !nameL.includes('burger') &&
    !nameL.includes('bowl') &&
    !nameL.includes('loaded') &&
    !nameL.includes('wrap') &&
    !nameL.includes('tower')
  ) {
    return 'dips';
  }
  if (/\bsides?\b/.test(catL) || catL.includes('classic sides')) return 'sides';
  if (
    /\b(box meal|bucket|feast|banquet|dine for)\b/.test(nameL) ||
    (/\bmeal\b/.test(nameL) && !/component/.test(nameL)) ||
    c.includes('saver')
  ) {
    return 'meals';
  }
  return 'sides';
}

// ─── Level 5: units ─────────────────────────────────────────────────────────

function knownMealUnits(displayName: string): Record<string, number> | null {
  const n = normText(displayName);

  if (/mighty bucket for one/.test(n)) {
    return {
      chicken_piece: 2,
      boneless_tender: 2,
      hot_wing: 2,
      fries_reg: 1,
      drink_reg: 1,
    };
  }
  if (/boneless banquet/.test(n)) {
    return { boneless_tender: 3, fries_reg: 1, drink_reg: 1 };
  }

  // Bargain Bucket — N OR chicken + 4 regular Signature fries (kfc.co.uk copy for 6/10/14 pc)
  const bargain = n.match(/(\d+)\s*piece bargain bucket/);
  if (bargain && !/boneless/.test(n)) {
    const pc = parseInt(bargain[1], 10);
    return { chicken_piece: pc, fries_reg: 4 };
  }
  // Boneless Bargain Bucket — same fry count as bone-in bargain
  const boneBargain = n.match(/(\d+)\s*piece boneless (?:bargain )?bucket/);
  if (boneBargain) {
    const pc = parseInt(boneBargain[1], 10);
    return { boneless_tender: pc, fries_reg: 4 };
  }
  const feast = n.match(/(\d+)\s*piece family feast/);
  if (feast) {
    const pc = parseInt(feast[1], 10);
    return {
      chicken_piece: pc,
      fries_reg: pc >= 10 ? 4 : 2,
      beans_reg: 1,
      coleslaw: 1,
      drink_bottle_1_5l: 1,
    };
  }
  const party = n.match(/(\d+)\s*piece party bucket/);
  if (party) return { chicken_piece: parseInt(party[1], 10) };
  const wicked =
    n.match(/(\d+)\s*piece wicked variety/) || n.match(/wicked variety bucket:\s*(\d+)\s*pc/);
  if (wicked) return { chicken_piece: parseInt(wicked[1], 10) };

  if (/colonel'?s? box meal/.test(n)) {
    return { chicken_piece: 2, fries_reg: 1, drink_reg: 1 };
  }
  if (/hot wings? box meal/.test(n)) {
    return { hot_wing: 6, fries_reg: 1, drink_reg: 1 };
  }
  if (/tenders? box meal/.test(n)) {
    return { boneless_tender: 3, fries_reg: 1, drink_reg: 1 };
  }
  if (/popcorn.*box meal/.test(n)) {
    return { popcorn_chicken: 1, fries_reg: 1, drink_reg: 1 };
  }
  return null;
}

function parseUnitsFromText(text: string, nameOnly: string): Record<string, number> {
  const units: Record<string, number> = {};
  const isLarge = /\blarge\b/.test(text);
  const isRegular = /\bregular\b/.test(text);

  const wing = text.match(/(\d+)\s+(?:[\w'-]+\s+){0,3}wings?\b/);
  if (wing) units.hot_wing = parseInt(wing[1], 10);

  const tender = text.match(/(\d+)\s*(?:boneless\s*)?(?:mini\s*)?tenders?/);
  if (tender) units.boneless_tender = parseInt(tender[1], 10);
  if (!units.boneless_tender) {
    const miniFillet = text.match(/(\d+)\s*mini\s*fillets?/);
    if (miniFillet) units.boneless_tender = parseInt(miniFillet[1], 10);
    else if (/\ba\s+tender\b/.test(text) || /\bone\s+tender\b/.test(text)) units.boneless_tender = 1;
    // Standalone product name "Tender" / "Kids Tender"
    else if (/^tender$/.test(nameOnly) || nameOnly.endsWith(' tender')) units.boneless_tender = 1;
  }

  // Twister / Naan / Vegan mains (no numeric pack pattern)
  if (/\btwister\b/.test(nameOnly) || /\btwister\b/.test(text)) units.twister_wrap = 1;
  if (/\bnaan\b/.test(nameOnly)) units[`sku:${nameOnly}`] = 1;
  // Stable unit key so “Original Recipe Vegan Burger” matches “Vegan Burger 🌱”
  if (/\bvegan burger\b/.test(nameOnly) || /\boriginal recipe vegan burger\b/.test(nameOnly)) {
    units.vegan_burger = 1;
  }
  // Rice-bowl extras — no fair street SKU (POS £0). Opaque key → incomplete audit, not a full burger.
  if (/^extra fillet$/i.test(nameOnly.trim())) units[`sku:extra fillet`] = 1;
  if (/^extra zinger$/i.test(nameOnly.trim())) units[`sku:extra zinger`] = 1;

  if (text.includes('corn cob') || text.includes('cobette')) {
    const cobN = text.match(/(\d+)\s*(?:pc|pcs|pieces?|corn)/);
    units.corn_cob = cobN ? parseInt(cobN[1], 10) : text.includes('2 ') ? 2 : 1;
  }

  const bonelessBucket = text.match(/(\d+)\s*piece\s+boneless\s+(?:bargain\s+)?bucket/);
  const pieceFeast = text.match(/(\d+)\s*piece\s+family\s*feast/);
  const pieceBargain = text.match(/(\d+)\s*piece\s+bargain\s*bucket/);
  const pieceParty = text.match(/(\d+)\s*piece\s+party\s*bucket/);
  const pieceWicked = text.match(/(\d+)\s*piece\s+wicked\s*variety/);
  const wickedPc = text.match(/wicked variety bucket:\s*(\d+)\s*pc/);
  if (bonelessBucket) {
    units.boneless_tender = parseInt(bonelessBucket[1], 10);
  } else if (pieceFeast || pieceBargain || pieceParty || pieceWicked || wickedPc) {
    const n =
      pieceFeast?.[1] ||
      pieceBargain?.[1] ||
      pieceParty?.[1] ||
      pieceWicked?.[1] ||
      wickedPc?.[1];
    if (n) units.chicken_piece = parseInt(n, 10);
  }

  if (!units.chicken_piece) {
    const orPieces =
      text.match(
        /(\d+)\s+pieces?\s+of\s+(?:our\s+)?(?:famous\s+)?original\s+recipe(?:\s+chicken)?/
      ) ||
      nameOnly.match(/original recipe chicken:\s*(\d+)\s*pc/) ||
      text.match(/one piece of original recipe/);
    if (orPieces) {
      units.chicken_piece = orPieces[1] ? parseInt(orPieces[1], 10) : 1;
    } else if (
      !text.includes('corn cob') &&
      !text.includes('cobette') &&
      !text.includes('portion') &&
      /original recipe|chicken piece|\bpc\b/.test(nameOnly) &&
      !/wing|tender|popcorn|burger|fillet meal|bucket|feast/.test(nameOnly)
    ) {
      const pc = nameOnly.match(/(\d+)\s*(?:pc|pcs|pieces?)/);
      if (pc) units.chicken_piece = parseInt(pc[1], 10);
    }
  }

  // Fries — "4 regular Signature fries" in meal copy, or SKU name "2x Regular Signature Fries"
  // (KFC Bargain Bucket UI lists fries as two lines of 2x = 4 total)
  if (text.includes('fries') || nameOnly.includes('fries')) {
    const friesQty =
      text.match(/(\d+)\s*x\s*(?:regular\s*)?(?:signature\s*)?fries/) ||
      text.match(/(\d+)\s*(?:regular\s+)?(?:signature\s+)?fries/) ||
      nameOnly.match(/^(\d+)\s*x\s*/);
    const n = friesQty ? parseInt(friesQty[1], 10) : 1;
    // Guard: "6 pieces … fries" must not take the 6 from chicken pieces
    const explicitFries =
      /\d+\s*x\s*(?:regular\s*)?(?:signature\s*)?fries/.test(text) ||
      /\d+\s+(?:regular\s+)?(?:signature\s+)?fries/.test(text) ||
      /^\d+\s*x\s*.*fries/.test(nameOnly);
    units[isLarge ? 'fries_lrg' : 'fries_reg'] = explicitFries ? n : 1;
  }
  if (text.includes('gravy')) units[isLarge ? 'gravy_lrg' : 'gravy_reg'] = 1;
  if (text.includes('beans')) units[isLarge ? 'beans_lrg' : 'beans_reg'] = 1;
  if (
    text.includes('coleslaw') ||
    text.includes('colslaw') ||
    (text.includes('slaw') && !text.includes('pickled'))
  ) {
    units[isLarge ? 'coleslaw_lrg' : 'coleslaw'] = 1;
  }
  if (text.includes('mash')) units[isLarge ? 'mash_lrg' : 'mash'] = 1;
  if (
    text.includes('cajun rice') ||
    (text.includes('rice') && !text.includes('rice bowl') && !text.includes('street bowl'))
  ) {
    units[isLarge ? 'cajun_rice_lrg' : 'cajun_rice'] = 1;
  }
  if (text.includes('salad') && !text.includes('mixed leaf')) {
    units[isLarge ? 'salad_lrg' : 'salad_reg'] = 1;
  }

  if (
    (nameOnly.includes('dip') ||
      nameOnly.includes('mayo') ||
      (nameOnly.includes('ranch') && !nameOnly.includes('bowl') && !nameOnly.includes('burger')) ||
      /\bsauce\b/.test(nameOnly)) &&
    !nameOnly.includes('fries') &&
    !nameOnly.includes('beans') &&
    !nameOnly.includes('burger') &&
    !nameOnly.includes('loaded') &&
    !nameOnly.includes('bowl') &&
    !nameOnly.includes('wrap') &&
    !nameOnly.includes('tower')
  ) {
    units.dip = 1;
  }

  const zingerN = text.match(/(\d+)\s*zinger/);
  if (zingerN) {
    units.zinger_burger = parseInt(zingerN[1], 10);
  } else if (text.includes('zinger') && (text.includes('burger') || text.includes('stacker'))) {
    units.zinger_burger = text.includes('stacker') ? 2 : 1;
  }
  if (text.includes('mini fillet') && text.includes('burger')) {
    units.mini_fillet_burger = 1;
  } else if (
    text.includes('fillet') &&
    text.includes('burger') &&
    !text.includes('tower') &&
    !units.zinger_burger
  ) {
    const n = text.match(/(\d+)\s*fillet/);
    units.fillet_burger = n ? parseInt(n[1], 10) : 1;
  } else if (text.includes('stacker') && !units.zinger_burger) {
    units.fillet_burger = 2;
  }
  if (
    text.includes('tower') &&
    (text.includes('burger') || text.includes('zinger') || text.includes('fillet'))
  ) {
    units.tower_burger = 1;
    delete units.zinger_burger;
    delete units.fillet_burger;
  }
  if (text.includes('twister')) units.twister_wrap = 1;
  if (text.includes('popcorn')) units.popcorn_chicken = 1;

  const drinkText = DRINK_HINTS.some((h) => text.includes(h)) || /\bwater\b/.test(text);
  if (drinkText && !/bucket|feast|box meal|burger.*fries/.test(nameOnly)) {
    if (/\b1\.5\s*l\b/.test(text) || text.includes('1.5 litre') || text.includes('1.5 liter')) {
      units.drink_bottle_1_5l = 1;
    } else if (text.includes('bottle')) {
      units.drink_bottle = 1;
    } else if (isLarge) {
      units.drink_lrg = 1;
    } else if (
      isRegular ||
      text.includes('shot') ||
      text.includes('iced') ||
      text.includes('latte') ||
      text.includes('coffee') ||
      text.includes('water') ||
      text.includes('lemonade') ||
      text.includes('lipton') ||
      text.includes('robinsons') ||
      text.includes('fruit shoot') ||
      text.includes('kwench') ||
      text.includes('matcha') ||
      text.includes('boba') ||
      text.includes('refresher')
    ) {
      units.drink_reg = 1;
    } else if (!text.includes('burger') && !text.includes('box')) {
      units.drink_reg = 1;
    }
  }

  return units;
}

export function extractAtomicUnits(
  displayName: string,
  description: string = '',
  unitContext: string = ''
): Record<string, number> {
  const nameL = normText(displayName);
  const known = knownMealUnits(displayName);
  if (known) return { ...known };

  if (/rice bowl|street bowl/.test(nameL)) return { rice_bowl: 1 };

  const descL = normText(description);
  const extraL = normText(unitContext);
  const nameLooksMulti =
    /dine for|for two|for 2\b|box meal|bucket|feast|banquet|variety|family|\bmeal\b|&|\bplus\b|:\s*\d+\s*pc|\d+\s*(pc|pcs|pieces?|tenders?|wings?|burgers?)/.test(
      nameL
    );
  const descLooksMulti =
    !!descL &&
    (/\d+\s*(?:hot\s*)?(?:wings?|tenders?|pieces?|burgers?|mini fillets?)/.test(descL) ||
      /\bplus\b.{0,40}\b(fries|gravy|drink|tender|wing)/.test(descL) ||
      /\bwith\b.{0,40}\d+\s*(?:regular|large)?\s*(?:signature\s*)?fries/.test(descL) ||
      /\band\b.{0,20}\d+\s*(?:hot\s*)?(?:wings?|tenders?)/.test(descL));

  const text =
    nameLooksMulti || descLooksMulti || extraL
      ? `${nameL} ${descL} ${extraL}`.replace(/\s+/g, ' ').trim()
      : nameL;

  return parseUnitsFromText(text, nameL);
}

/** Slots that customise the main (mayo on a wrap) — not separate ala-carte pots. */
function isFlavourOnlySlot(slotName: string): boolean {
  const s = normText(slotName);
  return (
    s.includes('flavour') ||
    s.includes('flavor') ||
    s.includes('choose your sauce') ||
    (s.includes('mayo') && !s.includes('dip'))
  );
}

/**
 * Walk KFC `mealComponents` (same structure the website uses for “add to basket”).
 * Each slot’s default level-1 option is included — e.g. Bargain Bucket:
 *   Original Recipe Chicken: 6 pc + 2x Regular Fries + 2x Regular Fries.
 *
 * Skips “Choose your flavour” (mayo on the item, not a side dip pot).
 */
export function extractUnitsFromMealComponents(
  mealComponents: any[],
  mealName = ''
): Record<string, number> {
  const units: Record<string, number> = {};
  if (!Array.isArray(mealComponents)) return units;
  const mealN = normText(mealName);

  const add = (partial: Record<string, number>) => {
    for (const [k, v] of Object.entries(partial)) {
      if (!v) continue;
      units[k] = (units[k] || 0) + v;
    }
  };

  for (const mc of mealComponents) {
    const slotName = String(mc?.name || '');
    if (isFlavourOnlySlot(slotName)) continue;

    const pick = defaultSlotPick(mc);
    const pickedName = pick?.name ? String(pick.name) : '';
    // Wrapper “Your main order” that just restates the meal name
    if (mealN && pickedName && normText(pickedName) === mealN) continue;
    if (!pickedName) continue;

    let partial = extractAtomicUnits(pickedName, '', '');
    // Mains with no pack pattern (Naan, Vegan Burger, Fillet Twister) still need a unit key
    if (Object.keys(partial).length === 0) {
      partial = { [`sku:${normText(pickedName)}`]: 1 };
    }
    add(partial);
  }
  return units;
}

/** First option in a slot = website/app default (Pepsi MAX, Regular fries, …). */
function componentUpcharge(ci: any, upsellLevelId = 1): number {
  const prices = Array.isArray(ci?.prices) ? ci.prices : [];
  const hit =
    prices.find((p: any) => Number(p?.upsellLevelId) === upsellLevelId) || prices[0];
  const n = parseFloat(String(hit?.price ?? ''));
  return !isNaN(n) && n > 0 ? n : 0;
}

function defaultSlotPick(mc: any): any | null {
  const groups = Array.isArray(mc?.componentItemGroups) ? mc.componentItemGroups : [];
  for (const g of groups) {
    const cis = Array.isArray(g?.componentItems) ? g.componentItems : [];
    const level1 = cis.find((ci: any) => ci?.levelId === 1) || cis[0];
    if (level1) return level1;
  }
  return null;
}

function defaultSlotUpcharge(mc: any): number {
  if (isFlavourOnlySlot(String(mc?.name || ''))) return 0;
  const pick = defaultSlotPick(mc);
  return pick ? componentUpcharge(pick, 1) : 0;
}

function mealBasePrice(rawItem: any): number {
  const top = parseFloat(String(rawItem?.price ?? ''));
  if (!isNaN(top) && top > 0) return top;
  const levels = Array.isArray(rawItem?.levels) ? rawItem.levels : [];
  const lv = levels.find((l: any) => l?.levelId === 1) || levels[0];
  const p = parseFloat(String(lv?.price ?? ''));
  return !isNaN(p) && p > 0 ? p : 0;
}

/**
 * What the app shows after “add to basket” defaults.
 * KFC now stores food-only on levels[] and puts drink/side/size extras on
 * mealComponent option prices (e.g. 10pc wings meal 7.71 + Pepsi 1.28 = 8.99).
 */
export function resolveKfcItemPrice(rawItem: any): number {
  const base = mealBasePrice(rawItem);
  if (base <= 0) return 0;
  const extras = Array.isArray(rawItem?.mealComponents)
    ? rawItem.mealComponents.reduce((sum: number, mc: any) => sum + defaultSlotUpcharge(mc), 0)
    : 0;
  return Math.round((base + extras) * 100) / 100;
}

/** Size-picker shells (“Hot Wings Box Meal”) — real SKUs are the 6pc / 10pc children. */
export function isKfcSizeChooserMeal(rawItem: any): boolean {
  if (rawItem?.type !== 'Meal') return false;
  const mcs = rawItem?.mealComponents;
  if (!Array.isArray(mcs)) return false;
  return mcs.some((mc: any) => /choose your size/i.test(String(mc?.name || '')));
}

/** SI-UK-compris-19881 is the unsellable twin of MI-UK-compris-19881. */
export function kfcCatalogSuffix(objectKey: unknown): string {
  const m = String(objectKey || '').match(/^(?:MI|SI|MIL)-(.+)$/i);
  return m ? m[1] : '';
}

export type ResolvedMealLine = {
  name: string;
  count: number;
  itemId?: string;
  /** For auditor Stage 2 */
  category?: 'main' | 'side' | 'drink' | 'extra';
};

/**
 * Map mealComponents defaults → concrete catalogue lines (same split as web basket).
 * Resolves Mini Fillet Burger / Caramel Krunch Shake / 2x fries by name against the
 * full menu (including priced singles that fuzzy unit-match missed).
 */
export function resolveMealComponentLines(
  mealComponents: any[],
  catalog: { id: string; name: string; price: number; description?: string; isCombo?: boolean; atomicUnits?: Record<string, number> }[],
  mealName = ''
): {
  components: ResolvedMealLine[];
  equivalentAlaCarteIds: string[];
  atomicUnits: Record<string, number>;
} {
  const components: ResolvedMealLine[] = [];
  const equivalentAlaCarteIds: string[] = [];
  const atomicUnits: Record<string, number> = {};

  const addUnits = (u: Record<string, number>, mult = 1) => {
    for (const [k, v] of Object.entries(u || {})) {
      if (v) atomicUnits[k] = (atomicUnits[k] || 0) + v * mult;
    }
  };

  const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

  /**
   * Street ala-carte only — what you'd actually pay buying the food as singles.
   * Never: combos, multi-unit deals (Zinger+fries), promo “for £X” packs, or
   * “Extra N pieces” upsell rows (those are add-on prices, not full street SKUs).
   * No hard-coded meal recipes — only catalogue signals.
   *
   * Kids street sides (Kids Beans, Kids Coleslaw, …) ARE pure SKUs — they price kids
   * boxes. Adult meals must not pick them (see findByName kids filter).
   */
  const isPureStreetSku = (c: (typeof catalog)[0]) => {
    if (c.price <= 0) return false;
    const n = c.name.toLowerCase();
    const d = (c.description || '').toLowerCase();
    const blob = `${n} ${d}`;
    // Component / builder-only rows (same price as parent meal — not street)
    if (/\bcomponents?\b/.test(d) || /\bmeal component\b/.test(d) || /\bbundle component\b/.test(d)) {
      return false;
    }
    // Short POS “choice” rows only — not marketing “your choice of sauce”
    if (/\bchoice\b/.test(d) && d.length < 80 && !/your choice of/.test(d)) return false;
    if (/\bbox meal|bargain bucket|family feast|meal for one/i.test(d) && /\bcomponent/i.test(d)) {
      return false;
    }
    // Bundled saver / deal copy
    if (/plus a (regular )?signature fries|plus a drink|with fries/i.test(d)) return false;
    // Promo priced rows (“10 Tenders for £7.99”, “for just £7.99” / “for 7.99”)
    if (/for\s*(just\s*)?(£\s*)?\d+(\.\d+)?/i.test(blob)) return false;
    // Upsell add-ons (“Extra 4 pieces…”) — not full street packs
    if (/\bextra\s+\d+\s*(pc|pcs|pieces?|tenders?|wings?)\b/i.test(blob)) return false;
    if (/^\s*extra\b/i.test(d.trim())) return false;
    // Multi-buy bucket/share names that are not pure singles
    if (/\b(bargain\s+)?bucket\b|\bfamily\s+feast\b|\bparty\s+bucket\b/i.test(n)) return false;
    // Full multi-part meals are not pure street (but single-unit “Twister Wrap” Meal type is OK)
    if (c.isCombo && /\b(meal|box|bucket|feast|bargain)\b/i.test(n)) return false;
    const keys = Object.keys(c.atomicUnits || {});
    // Single unit-kind only (pure zinger / pure fries / N-piece chicken…)
    if (keys.length !== 1) return false;
    return true;
  };

  const isKidsSku = (c: { name: string; description?: string }) =>
    /\bkids?\b/i.test(c.name) || /\bkids?\b/i.test(c.description || '');

  /** Drop promo outliers: unit price well below the median for that unit kind. */
  const filterFairUnitPrice = (rows: (typeof catalog)[0][]) => {
    const byUnit = new Map<string, number[]>();
    for (const c of rows) {
      const uk = Object.keys(c.atomicUnits || {})[0];
      if (!uk) continue;
      const qty = c.atomicUnits![uk] || 1;
      const ppu = c.price / qty;
      if (!byUnit.has(uk)) byUnit.set(uk, []);
      byUnit.get(uk)!.push(ppu);
    }
    const medianOf = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const medians = new Map<string, number>();
    for (const [uk, ppus] of byUnit) medians.set(uk, medianOf(ppus));

    return rows.filter((c) => {
      const uk = Object.keys(c.atomicUnits || {})[0];
      if (!uk) return false;
      const med = medians.get(uk) || 0;
      if (med <= 0) return true;
      const qty = c.atomicUnits![uk] || 1;
      const ppu = c.price / qty;
      // Keep packs within a fair band of the median street price
      return ppu >= med * 0.55;
    });
  };

  const pureCatalog = filterFairUnitPrice(catalog.filter(isPureStreetSku));

  const rankPure = (a: (typeof pureCatalog)[0], b: (typeof pureCatalog)[0]) => {
    // Prefer fair retail: higher unit price among pure packs of same size
    const uk = Object.keys(a.atomicUnits || {})[0];
    const ua = (a.atomicUnits || {})[uk] || 1;
    const ub = (b.atomicUnits || {})[uk] || 1;
    if (ua !== ub) return ub - ua;
    return b.price / ub - a.price / ua;
  };

  /**
   * Cover a protein qty with pure packs from the live catalogue (no hard-coded recipes).
   * Per pack-size keep the *highest* street price (full retail, not a cheaper twin),
   * then min-cost exact cover — e.g. chicken_piece:10 → 8pc+2pc / 6pc+3pc+1pc.
   */
  const coverWithPurePacks = (
    unitKey: string,
    need: number
  ): { item: (typeof pureCatalog)[0]; count: number }[] => {
    if (need <= 0) return [];
    const raw = pureCatalog.filter((c) => (c.atomicUnits || {})[unitKey]);
    if (!raw.length) return [];

    // One fair SKU per size — highest price wins (avoids promo twin undercuts)
    const bySize = new Map<number, (typeof pureCatalog)[0]>();
    for (const p of raw) {
      const size = p.atomicUnits![unitKey];
      const prev = bySize.get(size);
      if (!prev || p.price > prev.price) bySize.set(size, p);
    }
    const packs = [...bySize.values()];

    const INF = 1e12;
    const bestCost = Array<number>(need + 1).fill(INF);
    const prev = Array<{ packIdx: number; prevNeed: number } | null>(need + 1).fill(null);
    bestCost[0] = 0;

    for (let n = 1; n <= need; n++) {
      for (let pi = 0; pi < packs.length; pi++) {
        const p = packs[pi];
        const size = p.atomicUnits![unitKey];
        if (size <= 0 || size > n) continue;
        const cand = bestCost[n - size] + p.price;
        if (cand < bestCost[n] - 1e-9) {
          bestCost[n] = cand;
          prev[n] = { packIdx: pi, prevNeed: n - size };
        } else if (Math.abs(cand - bestCost[n]) < 1e-9 && prev[n]) {
          const curSize = packs[prev[n]!.packIdx].atomicUnits![unitKey];
          if (size > curSize) prev[n] = { packIdx: pi, prevNeed: n - size };
        }
      }
    }

    if (bestCost[need] >= INF) {
      const sorted = [...packs].sort((a, b) => {
        const ua = a.atomicUnits![unitKey];
        const ub = b.atomicUnits![unitKey];
        if (ub !== ua) return ub - ua;
        return b.price / ua - a.price / ub; // higher unit price first
      });
      const out: { item: (typeof pureCatalog)[0]; count: number }[] = [];
      let remaining = need;
      while (remaining > 0 && sorted.length) {
        const fit = sorted.find((p) => p.atomicUnits![unitKey] <= remaining);
        if (!fit) break;
        const size = fit.atomicUnits![unitKey];
        const n = Math.floor(remaining / size);
        if (n <= 0) break;
        out.push({ item: fit, count: n });
        remaining -= n * size;
      }
      return remaining === 0 ? out : [];
    }

    const counts = new Map<string, { item: (typeof pureCatalog)[0]; count: number }>();
    let cur = need;
    while (cur > 0 && prev[cur]) {
      const { packIdx, prevNeed } = prev[cur]!;
      const item = packs[packIdx];
      const ent = counts.get(item.id) || { item, count: 0 };
      ent.count += 1;
      counts.set(item.id, ent);
      cur = prevNeed;
    }
    return cur === 0 ? [...counts.values()] : [];
  };

  const stripDecor = (s: string) =>
    normName(s)
      .replace(/[🌱🔥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const catalogIdFromObjectKey = (objectKey: string) =>
    `kfc_${String(objectKey).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  /**
   * Resolve a meal-builder pick to a pure street SKU.
   * @param wantKids when true (Kids' Box sides), prefer Kids Beans over Large Beans.
   */
  const findByName = (want: string, wantKids = false) => {
    const n = stripDecor(want);
    if (!n) return null;

    // Adult meals must never price with kids-only SKUs; kids meals prefer them.
    const pool = pureCatalog.filter((c) => {
      const kids = isKidsSku(c);
      if (wantKids) return true;
      return !kids;
    });

    const rankKidsAware = (a: (typeof pool)[0], b: (typeof pool)[0]) => {
      if (wantKids) {
        const ak = isKidsSku(a) ? 0 : 1;
        const bk = isKidsSku(b) ? 0 : 1;
        if (ak !== bk) return ak - bk;
      }
      return rankPure(a, b);
    };

    // Exact pure street SKU only (never Zinger+fries deal or Bargain-as-chicken)
    const exact = pool.filter((c) => stripDecor(c.name) === n);
    if (exact.length) return [...exact].sort(rankKidsAware)[0];

    // Same pack size by unit (spacing/punctuation / Fillet Twister ↔ Twister Wrap)
    const wantUnits = extractAtomicUnits(want, '', '');
    const packUnitKeys = [
      'chicken_piece',
      'boneless_tender',
      'hot_wing',
      'popcorn_chicken',
    ] as const;
    // Counted protein packs: ONLY exact size match — never "6 Tenders" → "4 Tenders".
    // Missing sizes fall through to coverWithPurePacks (e.g. 6 → 4+1+1).
    for (const uk of packUnitKeys) {
      if (!wantUnits[uk]) continue;
      const byUnit = pool.filter((c) => c.atomicUnits?.[uk] === wantUnits[uk]);
      if (byUnit.length) return [...byUnit].sort(rankKidsAware)[0];
      // Do not fuzzy-match a different pack size for this protein
      return null;
    }

    const unitKeys = [
      'zinger_burger',
      'fillet_burger',
      'tower_burger',
      'mini_fillet_burger',
      'twister_wrap',
      'vegan_burger',
      'rice_bowl',
    ] as const;
    for (const uk of unitKeys) {
      if (!wantUnits[uk]) continue;
      const byUnit = pool.filter((c) => c.atomicUnits?.[uk] === wantUnits[uk]);
      if (byUnit.length) return [...byUnit].sort(rankKidsAware)[0];
    }

    // Prefix for pure mains (e.g. "Zinger Burger" → "Zinger Burger 🔥")
    // Skip when want is a counted pack ("6 Tenders") — size must match exactly above
    if (!/^\d+\s/.test(n)) {
      const starts = pool.filter((c) => {
        const cn = stripDecor(c.name);
        return (
          cn === n ||
          (cn.startsWith(n) && c.name.length <= want.length + 6) ||
          (n.startsWith(cn) && want.length <= c.name.length + 6)
        );
      });
      if (starts.length) return [...starts].sort(rankKidsAware)[0];
    }

    // Token overlap with required anchors so “Fillet Twister” ≠ Fillet Burger,
    // “Mini Fillet” ≠ Tower Fillet, “Extra Fillet” is not fuzzy-matched at all.
    if (/^extra\b/i.test(n)) return null;
    // Never fuzzy across pack sizes (6 Tenders ≠ 4 Tenders)
    if (/^\d+\s+(tenders?|wings?|pieces?|pc|pcs)\b/i.test(n)) return null;
    // Kids Beans must not fuzzy-match Large Beans / Regular Beans via “beans” alone
    if (wantKids && /beans|coleslaw|cob|salad|cajun rice|fries/i.test(n)) {
      const kidsExact = pool.filter(
        (c) => isKidsSku(c) && stripDecor(c.name).includes(n.replace(/^kids\s+/, ''))
      );
      if (kidsExact.length) return [...kidsExact].sort(rankKidsAware)[0];
      // No adult side substitute for an explicit kids side pick
      if (/beans|coleslaw|cob|salad|cajun rice/i.test(n)) return null;
    }

    const stop = new Set([
      'original',
      'recipe',
      'famous',
      'with',
      'the',
      'and',
      'for',
      'your',
      'choice',
      'of',
      'a',
      'fillet', // too common alone — pair with mini/tower/twister/burger
      'kids',
      'kid',
    ]);
    const wantToks = n.split(/\s+/).filter((t) => t.length > 2 && !stop.has(t));
    // Anchors that must appear in the catalogue name when present in the want string
    const anchors = n
      .split(/\s+/)
      .filter((t) =>
        /^(twister|wrap|vegan|zinger|tower|mini|naan|popcorn|stacker|cruncher|bear|yoyo|yoyos)$/i.test(
          t
        )
      );
    if (wantToks.length || anchors.length) {
      const scored = pool
        .map((c) => {
          const cn = stripDecor(c.name);
          if (anchors.some((a) => !cn.includes(a) && !(a === 'yoyos' && cn.includes('yoyo'))))
            return null;
          // Mini must stay mini; never map mini → tower/full fillet
          if (/\bmini\b/.test(n) && !/\bmini\b/.test(cn)) return null;
          if (/\btwister\b/.test(n) && !/\btwister\b/.test(cn)) return null;
          if (/\bvegan\b/.test(n) && !/\bvegan\b/.test(cn)) return null;
          // Mini Fillet ≠ Mini Burger; Fillet Twister handled by twister anchor
          if (/\bfillet\b/.test(n) && !/\bfillet\b/.test(cn) && !/\btwister\b/.test(n)) return null;
          if (/\btower\b/.test(n) && !/\btower\b/.test(cn)) return null;
          // Same pack count when both names include a number
          const wantNum = n.match(/\b(\d+)\b/);
          const catNum = cn.match(/\b(\d+)\b/);
          if (wantNum && catNum && wantNum[1] !== catNum[1]) return null;
          const cToks = cn.split(/\s+/).filter((t) => t.length > 2 && !stop.has(t));
          const hit = wantToks.filter((t) => cToks.some((ct) => ct.includes(t) || t.includes(ct)));
          // Require a strong hit — one weak token ("strawberry") must not map Yoyos → Boba
          if (hit.length === 0 && !anchors.length) return null;
          if (hit.length < 2 && anchors.length === 0 && wantToks.length >= 2) return null;
          return {
            c,
            score:
              hit.length * 10 +
              anchors.length * 15 -
              Math.abs(cToks.length - wantToks.length) +
              (wantKids && isKidsSku(c) ? 20 : 0),
          };
        })
        .filter(Boolean) as { c: (typeof pool)[0]; score: number }[];
      scored.sort((a, b) => b.score - a.score || rankKidsAware(a.c, b.c));
      if (scored.length) return scored[0].c;
    }
    return null;
  };

  /** Prefer linked singleItemObjectKey when that SKU is pure street; else name match. */
  const resolvePick = (
    pickedName: string,
    singleItemObjectKey?: string,
    wantKids = false
  ): (typeof pureCatalog)[0] | null => {
    if (singleItemObjectKey) {
      const id = catalogIdFromObjectKey(singleItemObjectKey);
      const direct = catalog.find((c) => c.id === id);
      if (direct && isPureStreetSku(direct)) {
        // Direct hit only if kids-ness agrees (or want is kids and this is kids / neutral dessert/drink)
        if (!wantKids && isKidsSku(direct)) {
          // fall through to name
        } else {
          return direct as (typeof pureCatalog)[0];
        }
      }
    }
    let hit = findByName(pickedName, wantKids);
    // Kids Mini Burger (component-only) → Mini Burger street SKU
    if (!hit && wantKids) {
      const stripped = stripDecor(pickedName).replace(/^kids\s+/, '').trim();
      if (stripped && stripped !== stripDecor(pickedName)) {
        hit = findByName(stripped, false);
      }
    }
    return hit;
  };

  if (!Array.isArray(mealComponents)) {
    return { components, equivalentAlaCarteIds, atomicUnits };
  }

  const mealN = normText(mealName);

  for (const mc of mealComponents) {
    const slot = String(mc?.name || '');
    if (isFlavourOnlySlot(slot)) continue;

    const pick = defaultSlotPick(mc);
    const pickedName = pick?.name ? String(pick.name).trim() : '';
    const singleItemObjectKey = pick?.singleItemObjectKey
      ? String(pick.singleItemObjectKey)
      : undefined;
    if (mealN && pickedName && normText(pickedName) === mealN) continue;
    if (!pickedName) continue;

    let count = 1;
    let searchName = pickedName;
    const wantKids = /\bkids?\b/i.test(pickedName) || /\bkids?\b/i.test(slot);

    // "2x Regular Signature Fries"
    const dual = searchName.match(/^(\d+)\s*x\s+(.+)$/i);
    if (dual) {
      count = parseInt(dual[1], 10);
      searchName = dual[2].trim();
    }
    // "1 Tender" / "6 Tenders"
    const qtyName = searchName.match(/^(\d+)\s+(.+)$/i);
    if (qtyName && /tender|wing|piece|fillet|burger|popcorn/i.test(qtyName[2])) {
      // Don't strip "6 Tenders" — keep full for exact match; units parse handles qty
      // Only strip bare "1 Tender" → "Tender"
      if (parseInt(qtyName[1], 10) === 1 && !/s$/i.test(qtyName[2].trim())) {
        searchName = qtyName[2].trim();
      }
    }

    const hit =
      resolvePick(searchName, singleItemObjectKey, wantKids) ||
      resolvePick(pickedName, singleItemObjectKey, wantKids);
    if (hit) {
      components.push({
        name: hit.name,
        count,
        itemId: hit.id,
        category: /drink|shake|latte|pepsi|water|fruit shoot/i.test(hit.name)
          ? 'drink'
          : /fries|side|gravy|beans|slaw|mash|rice|salad|cob|yoyo/i.test(hit.name)
            ? /yoyo|bear/i.test(hit.name)
              ? 'extra'
              : 'side'
            : 'main',
      });
      for (let i = 0; i < count; i++) equivalentAlaCarteIds.push(hit.id);
      if (hit.atomicUnits && Object.keys(hit.atomicUnits).length) {
        addUnits(hit.atomicUnits, count);
      } else {
        addUnits(extractAtomicUnits(pickedName, '', ''), 1);
      }
      continue;
    }

    // No pure SKU at this exact name/size — cover protein qty with pure packs
    // (e.g. "Original Recipe Chicken: 10 pc" → 6pc + 4pc). No hard-coded meals.
    const parsed = extractAtomicUnits(pickedName, '', '');
    // Self-named feast/bucket component: only take protein units (sides come from other slots)
    const proteinKeys = [
      'chicken_piece',
      'boneless_tender',
      'hot_wing',
      'zinger_burger',
      'fillet_burger',
      'tower_burger',
      'mini_fillet_burger',
      'popcorn_chicken',
      'twister_wrap',
      'vegan_burger',
      'rice_bowl',
    ];
    const protein: Record<string, number> = {};
    for (const k of proteinKeys) {
      if (parsed[k]) protein[k] = parsed[k];
    }
    // "10 Piece Family Feast" as main order line → chicken_piece only
    if (
      Object.keys(protein).length === 0 &&
      /(\d+)\s*piece/.test(normText(pickedName)) &&
      /feast|bucket|bargain|variety|party/i.test(pickedName)
    ) {
      const m = normText(pickedName).match(/(\d+)\s*piece/);
      if (m) protein.chicken_piece = parseInt(m[1], 10);
    }

    let covered = false;
    for (const [uk, need] of Object.entries(protein)) {
      const cover = coverWithPurePacks(uk, need * count);
      if (!cover.length) continue;
      covered = true;
      for (const { item, count: n } of cover) {
        components.push({
          name: item.name,
          count: n,
          itemId: item.id,
          category: 'main',
        });
        for (let i = 0; i < n; i++) equivalentAlaCarteIds.push(item.id);
        addUnits(item.atomicUnits || {}, n);
      }
    }

    if (!covered) {
      if (Object.keys(parsed).length) addUnits(parsed, count);
      else addUnits({ [`sku:${normText(pickedName)}`]: 1 }, count);
      components.push({ name: pickedName, count, category: 'extra' });
    }
  }

  // Pure street SKUs only — never drop fries lines. Multi-unit deals (burger+fries)
  // are excluded from pureCatalog, so a separate fries mealComponent stays priced.
  return {
    components,
    equivalentAlaCarteIds,
    atomicUnits:
      Object.keys(atomicUnits).length > 0
        ? atomicUnits
        : extractUnitsFromMealComponents(mealComponents, mealName),
  };
}

// ─── Level 6: combo ─────────────────────────────────────────────────────────

function isComboItem(
  displayName: string,
  category: string,
  units: Record<string, number>
): boolean {
  const n = normText(displayName);
  const keys = Object.keys(units);
  if (category === 'drinks' && keys.length <= 1) return false;
  if (units.rice_bowl && keys.length === 1) return false;
  if (
    /dine for|for two|for 2\b|box meal|feast|banquet|family feast|variety|bargain bucket|party bucket|mighty bucket|colonel|wicked/.test(
      n
    )
  ) {
    return true;
  }
  // Promo multi-buys (“10 Tenders for £7.99”, “20 Hot Wings for £7.99”).
  // normText strips £ → match “for 7.99” as well as “for £7.99” on raw names.
  if (/for\s*(just\s*)?(£\s*)?\d+(\.\d+)?/.test(n) || /for\s*(just\s*)?£\s*\d/.test(displayName)) {
    return true;
  }
  if (/\bmeal\b/.test(n) && !/component/.test(n)) return true;
  if (keys.length > 1) return true;
  if (/\bstacker\b/.test(n) && (units.zinger_burger || units.fillet_burger || 0) >= 2) return true;
  return false;
}

// ─── Rules object + entry ───────────────────────────────────────────────────

/** Reusable by adapter + smoke tests — plug into `runMenuPipeline`. */
export const kfcMenuRules: MenuPipelineRules = {
  id: 'kfc_uk',
  isJunk,
  classifyRole,
  resolveDisplay,
  mapCategory,
  extractUnits: ({ displayName, description, unitContext }) =>
    extractAtomicUnits(displayName, description, unitContext),
  isCombo: ({ displayName, category, units }) => isComboItem(displayName, category, units),
  adjustCategory: (category, isCombo, units) => {
    if (isCombo && category === 'sides' && Object.keys(units).length > 1) return 'meals';
    return category;
  },
};

/** Run KFC multi-level pipeline for one raw line. */
export function pipelineItem(input: MenuLineInput): PipelineResult {
  return runMenuPipeline(input, kfcMenuRules);
}

// Re-export shared helpers so existing smoke imports keep working
export {
  buildFieldBlob,
  classifyRole,
  fuzz,
  fuzzAny,
  fuzzMatch,
  fuzzName,
  type FieldBlob,
  type ItemRole,
  type PipelineResult,
};
