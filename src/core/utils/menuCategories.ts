import type { KnownMenuItemCategory, MenuItem, MenuItemCategory } from '../types/provider';

export type CategoryTab = {
  id: MenuItemCategory;
  label: string;
  icon: string;
  /** How many ala-carte items in this category on the current menu */
  itemCount: number;
  /** True when id is not in the known shared set */
  isUnknown: boolean;
};

const KNOWN_META: Record<KnownMenuItemCategory, { label: string; icon: string; order: number }> = {
  burgers: { label: 'Burgers & Wraps', icon: '🍔', order: 10 },
  chicken: { label: 'Chicken & Wings', icon: '🍗', order: 20 },
  meals: { label: 'Meals', icon: '🍱', order: 30 },
  box_meals: { label: 'Box Meals', icon: '📦', order: 40 },
  buckets: { label: 'Buckets & Sharing', icon: '🍗', order: 50 },
  kids: { label: "Kids'", icon: '👶', order: 60 },
  sides: { label: 'Fries & Sides', icon: '🍟', order: 70 },
  drinks: { label: 'Drinks', icon: '🥤', order: 80 },
  desserts: { label: 'Desserts', icon: '🍦', order: 90 },
  dips: { label: 'Dips & Extras', icon: '🌶️', order: 100 },
};

const KNOWN_IDS = new Set<string>(Object.keys(KNOWN_META));

/** Preferred display order for known categories; unknowns sort after. */
export function isKnownMenuCategory(id: string): id is KnownMenuItemCategory {
  return KNOWN_IDS.has(id);
}

/**
 * Humanize free-form category ids from hosted JSON (e.g. `rice_bowl` → "Rice Bowl").
 */
export function humanizeCategoryId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other';
}

export function categoryLabel(id: MenuItemCategory): string {
  if (isKnownMenuCategory(id)) return KNOWN_META[id].label;
  return humanizeCategoryId(id);
}

export function categoryIcon(id: MenuItemCategory): string {
  if (isKnownMenuCategory(id)) return KNOWN_META[id].icon;
  // Distinct marker so unknown / missing mappings are visible in the UI
  return '📁';
}

/**
 * Build Mode 2 pills from whatever categories appear on the loaded ala-carte menu.
 * Unknown ids still get a tab (folder icon + humanized label) so gaps are obvious.
 */
export function buildCategoryTabsFromItems(items: MenuItem[]): CategoryTab[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const cat = item.category || 'sides';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  const tabs: CategoryTab[] = [];
  for (const [id, itemCount] of counts) {
    tabs.push({
      id,
      label: categoryLabel(id),
      icon: categoryIcon(id),
      itemCount,
      isUnknown: !isKnownMenuCategory(id),
    });
  }

  tabs.sort((a, b) => {
    const orderA = isKnownMenuCategory(a.id) ? KNOWN_META[a.id].order : 1000;
    const orderB = isKnownMenuCategory(b.id) ? KNOWN_META[b.id].order : 1000;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });

  return tabs;
}
