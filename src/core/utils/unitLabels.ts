/**
 * Atomic-unit display labels (chain-agnostic defaults only).
 *
 * Brand SKUs (zinger_burger, chicken_sandwich, …) → provider `unitLabels` /
 * `unitPpiLabels` on the brand shell — never hardcode them here or in engines.
 */

/** Cross-chain form factors → long display name (optimizer "covers" text). */
export const GENERIC_UNIT_DISPLAY_NAMES: Record<string, string> = {
  hot_wing: 'Hot Wings',
  chicken_piece: 'Chicken Pieces',
  boneless_tender: 'Tenders',
  nugget: 'Nuggets',
  fries_reg: 'Regular Fries',
  fries_lrg: 'Large Fries',
  drink_reg: 'Regular Drink',
  drink_lrg: 'Large Drink',
  drink_bottle_1_5l: '1.5L Bottle',
  drink_bottle: 'Bottle Drink',
  gravy_reg: 'Regular Gravy',
  gravy_lrg: 'Large Gravy',
  beans_reg: 'Regular Beans',
  beans_lrg: 'Large Beans',
  coleslaw: 'Coleslaw',
  coleslaw_lrg: 'Large Coleslaw',
  mash: 'Mash',
  mash_lrg: 'Large Mash',
  cajun_rice: 'Cajun Rice',
  cajun_rice_lrg: 'Large Cajun Rice',
  salad_reg: 'Side Salad',
  salad_lrg: 'Large Side Salad',
  corn_cob: 'Corn Cob',
  dip: 'Dip',
  side_reg: 'Regular Side',
  biscuit: 'Biscuit',
  chicken_wrap: 'Chicken Wrap',
  mac_and_cheese: 'Mac & Cheese',
};

/** Cross-chain short labels for PPI ("£0.50 / wing"). */
export const GENERIC_UNIT_PPI_LABELS: Record<string, string> = {
  hot_wing: 'wing',
  chicken_piece: 'pc chicken',
  boneless_tender: 'tender',
  nugget: 'nugget',
  fries_reg: 'fries',
  fries_lrg: 'fries',
  drink_reg: 'drink',
  drink_lrg: 'large drink',
  drink_bottle_1_5l: '1.5L bottle',
  drink_bottle: 'bottle',
  gravy_reg: 'gravy',
  gravy_lrg: 'gravy',
  beans_reg: 'beans',
  beans_lrg: 'beans',
  coleslaw: 'coleslaw',
  coleslaw_lrg: 'coleslaw',
  mash: 'mash',
  mash_lrg: 'mash',
  cajun_rice: 'rice',
  cajun_rice_lrg: 'rice',
  salad_reg: 'salad',
  salad_lrg: 'salad',
  corn_cob: 'cob',
  dip: 'dip',
  side_reg: 'side',
  biscuit: 'biscuit',
  chicken_wrap: 'wrap',
  mac_and_cheese: 'mac',
};

/** Humanize unknown keys: `zinger_burger` → `zinger burger` */
export function humanizeUnitKey(unitKey: string): string {
  return unitKey.replace(/_/g, ' ').trim() || unitKey;
}

/**
 * Resolve a display label: provider map → generic map → humanized key.
 */
export function resolveUnitDisplayName(
  unitKey: string,
  providerLabels?: Record<string, string> | null
): string {
  return (
    providerLabels?.[unitKey] ||
    GENERIC_UNIT_DISPLAY_NAMES[unitKey] ||
    humanizeUnitKey(unitKey)
  );
}

/** Short PPI unit word: provider short map → generic short → humanized */
export function resolveUnitPpiLabel(
  unitKey: string,
  providerPpiLabels?: Record<string, string> | null,
  providerDisplayLabels?: Record<string, string> | null
): string {
  return (
    providerPpiLabels?.[unitKey] ||
    GENERIC_UNIT_PPI_LABELS[unitKey] ||
    (providerDisplayLabels?.[unitKey] || GENERIC_UNIT_DISPLAY_NAMES[unitKey] || humanizeUnitKey(unitKey))
      .split(/\s+/)
      .pop()!
      .toLowerCase()
  );
}

/** Optional bag of brand labels for PPI / UI helpers */
export type UnitLabelContext = {
  unitLabels?: Record<string, string> | null;
  unitPpiLabels?: Record<string, string> | null;
};
