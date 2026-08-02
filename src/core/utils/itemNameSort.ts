/**
 * Family-aware menu name sorting.
 *
 * Pack sizes of the same product group together and order by count:
 *   "3 Hot Wings", "6 Hot Wings", "10 Hot Wings"
 * → family "hot wing", sizes 3 / 6 / 10
 *
 * Also normalises "hotwings" ↔ "hot wings", plurals, and leading counts.
 */

export type ItemNameSortParts = {
  /** Base product key used for grouping */
  family: string;
  /** Pack / piece count if detected, else 0 */
  size: number;
};

/** Unit words that often follow a pack count in fast-food menus */
const PACK_UNIT =
  '(?:hot\\s*wings?|wings?|chicken\\s*tenders?|tenders?|chicken\\s*nuggets?|nuggets?|pc|pcs|pieces?|burgers?|fillets?|strips?|dips?)';

const PROTEIN_UNIT_KEYS = ['hot_wing', 'boneless_tender', 'nugget', 'chicken_piece'] as const;

function packSizeFromUnits(units?: Record<string, number>): number {
  if (!units) return 0;
  for (const k of PROTEIN_UNIT_KEYS) {
    if (units[k]) return units[k];
  }
  const vals = Object.values(units);
  if (vals.length === 1) return vals[0] || 0;
  return 0;
}

/**
 * Parse a display name into { family, size } for sorting.
 */
export function parseNameForSort(name: string): ItemNameSortParts {
  let s = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.\s/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop promo price tails: "20 Hot Wings for £7.99"
  s = s.replace(/\bfor\s*[£$€]?\s*\d+(?:\.\d+)?\b/g, ' ');
  s = s.replace(/[£$€]\s*\d+(?:\.\d+)?/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // hotwings / hot wings → hot wing (stable token)
  s = s.replace(/\bhot\s*wings?\b/g, 'hot wing');

  let size = 0;

  // "3 hot wing", "6 x tenders", "10 pc original recipe", "6 piece bucket"
  const packRe = new RegExp(`\\b(\\d+)\\s*(?:x\\s*)?(${PACK_UNIT})\\b`, 'i');
  const packMatch = s.match(packRe);
  if (packMatch) {
    size = parseInt(packMatch[1], 10);
    // Keep the unit word, drop the count: "3 hot wing" → "hot wing"
    s = s.replace(
      new RegExp(`\\b${packMatch[1]}\\s*(?:x\\s*)?(${PACK_UNIT})\\b`, 'i'),
      '$1'
    );
  } else {
    // Leading bare number: "3 Classic Tenders & a dip" (if unit regex missed)
    const lead = s.match(/^(\d+)\s+(.*)$/);
    if (lead) {
      size = parseInt(lead[1], 10);
      s = lead[2];
    }
  }

  // Drop common add-on tails so "3 Tenders & a dip" groups with "6 Tenders"
  s = s
    .replace(/\b(?:and|with)\s+(?:a\s+)?dip\b/g, ' ')
    .replace(/\b(?:and|with)\s+(?:a\s+)?drink\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Light singularisation so "wings" / "wing" group
  s = s
    .replace(/\bhot wings\b/g, 'hot wing')
    .replace(/\bwings\b/g, 'wing')
    .replace(/\btenders\b/g, 'tender')
    .replace(/\bnuggets\b/g, 'nugget')
    .replace(/\bpieces\b/g, 'piece')
    .replace(/\bburgers\b/g, 'burger')
    .replace(/\bfillets\b/g, 'fillet')
    .replace(/\bstrips\b/g, 'strip')
    .replace(/\bdips\b/g, 'dip')
    .replace(/\bpcs\b/g, 'pc')
    .replace(/\s+/g, ' ')
    .trim();

  return { family: s || name.toLowerCase(), size };
}

export type NamedSortable = {
  name: string;
  atomicUnits?: Record<string, number>;
};

/**
 * Compare two menu/combo items by product family, then pack size, then full name.
 * @param direction family A–Z (`asc`) or Z–A (`desc`). Pack size is always small→large within a family.
 */
export function compareByItemFamily(
  a: NamedSortable,
  b: NamedSortable,
  direction: 'asc' | 'desc' = 'asc'
): number {
  const ap = parseNameForSort(a.name);
  const bp = parseNameForSort(b.name);

  if (!ap.size) ap.size = packSizeFromUnits(a.atomicUnits);
  if (!bp.size) bp.size = packSizeFromUnits(b.atomicUnits);

  const dir = direction === 'asc' ? 1 : -1;
  const fam = ap.family.localeCompare(bp.family, undefined, {
    sensitivity: 'base',
    numeric: true,
  });
  if (fam !== 0) return fam * dir;

  // Within family: 3-pack before 6-pack (stable, useful for browsing)
  if (ap.size !== bp.size) return ap.size - bp.size;

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) * dir;
}
