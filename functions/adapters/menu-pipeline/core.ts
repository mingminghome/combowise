/**
 * Shared multi-level menu pipeline (provider-agnostic).
 *
 * Standardization step for any chain whose POS JSON mixes sellable products,
 * builder slots, modifiers, and noisy name/description/posName fields.
 *
 * Brand-specific logic lives in a `MenuPipelineRules` object (KFC, Popeyes, …).
 * Engines never import this — only `functions/adapters/<provider>.ts`.
 *
 * Levels (fixed order)
 *   0  FieldBlob   — normalise + tokenise name / description / posName
 *   1  Junk        — fees, test lines, modifiers
 *   2  Role        — sellable | slot | promote-from-desc
 *   3  Display     — customer-facing name + clean description
 *   4  Category    — ComboWise aisle
 *   5  Units       — atomicUnits for auditor / optimizer
 *   6  Combo flag  — Mode 1 eligibility
 */

// ─── Field blob + fuzzy search ──────────────────────────────────────────────

export type FieldBlob = {
  name: string;
  description: string;
  posName: string;
  /** Lowercased, punctuation-light, single-spaced */
  nameN: string;
  descN: string;
  posN: string;
  /** All three fields joined */
  all: string;
  /** Word tokens from all fields */
  tokens: Set<string>;
};

export type TextField = 'name' | 'desc' | 'pos' | 'all';

/** Normalize for matching: case-fold, strip ®™, collapse punctuation/spaces. */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^\w\s.&'+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): Set<string> {
  const set = new Set<string>();
  for (const t of s.split(/[\s/|]+/)) {
    if (t.length >= 2) set.add(t);
  }
  return set;
}

export function buildFieldBlob(
  name: string,
  description: string = '',
  posName: string = ''
): FieldBlob {
  const nameN = normText(name);
  const descN = normText(description);
  const posN = normText(posName);
  const all = [nameN, descN, posN].filter(Boolean).join(' ');
  return {
    name: name.trim(),
    description: (description || '').trim(),
    posName: (posName || '').trim(),
    nameN,
    descN,
    posN,
    all,
    tokens: tokenize(all),
  };
}

function fieldSource(blob: FieldBlob, field: TextField): string {
  if (field === 'name') return blob.nameN;
  if (field === 'desc') return blob.descN;
  if (field === 'pos') return blob.posN;
  return blob.all;
}

/**
 * Fuzzy phrase search: substring on normalized text, or all significant
 * words present as tokens (order-independent).
 */
export function fuzz(
  blob: FieldBlob,
  phrase: string,
  field: TextField = 'all'
): boolean {
  const p = normText(phrase);
  if (!p) return false;
  const src = fieldSource(blob, field);
  if (src.includes(p)) return true;
  const words = p.split(' ').filter((w) => w.length > 1);
  if (words.length >= 2) {
    const tokens = field === 'all' ? blob.tokens : tokenize(src);
    return words.every((w) => tokens.has(w) || src.includes(w));
  }
  return false;
}

/** Shorthand: fuzzy on product name only. */
export function fuzzName(blob: FieldBlob, phrase: string): boolean {
  return fuzz(blob, phrase, 'name');
}

/** True if any phrase matches (fuzzy). */
export function fuzzAny(
  blob: FieldBlob,
  phrases: string[],
  field: TextField = 'all'
): boolean {
  return phrases.some((p) => fuzz(blob, p, field));
}

/** First regex match across ordered fields (name → desc → all by default). */
export function fuzzMatch(
  blob: FieldBlob,
  re: RegExp,
  fields: TextField[] = ['name', 'desc', 'all']
): RegExpMatchArray | null {
  for (const f of fields) {
    const m = fieldSource(blob, f).match(re);
    if (m) return m;
  }
  return null;
}

// ─── Rules contract (per provider) ──────────────────────────────────────────

export type ItemRole =
  | { kind: 'junk' }
  | { kind: 'slot' }
  | { kind: 'promote'; displayName: string }
  | { kind: 'sellable' };

export type DisplayResolved = {
  name: string;
  description?: string;
  /** Original POS text kept for unit extraction after promotion */
  unitContext?: string;
};

export type MenuLineInput = {
  name: string;
  description?: string;
  posName?: string;
  catLabel?: string;
  price: number;
  type?: string;
};

/**
 * Provider-owned rules. Shared pipeline only orchestrates levels + FieldBlob.
 * Prefer phrase lists + small helpers over one mega-regex per chain.
 */
export type MenuPipelineRules = {
  /** e.g. kfc_uk — for logs / debugging */
  id: string;

  /** Level 1 — drop fees / test / pure modifiers */
  isJunk?: (blob: FieldBlob) => boolean;

  /**
   * Level 2 — classify POS line.
   * Default: sellable. Return slot to drop builder components;
   * promote to rename from description.
   */
  classifyRole?: (blob: FieldBlob) => ItemRole;

  /** Level 3 — optional display override */
  resolveDisplay?: (blob: FieldBlob, role: ItemRole) => DisplayResolved;

  /** Level 4 — ComboWise category id */
  mapCategory: (ctx: {
    catLabel: string;
    displayName: string;
    blob: FieldBlob;
    role: ItemRole;
  }) => string;

  /** Level 5 — atomic units for engines */
  extractUnits: (ctx: {
    displayName: string;
    description: string;
    unitContext: string;
    blob: FieldBlob;
    role: ItemRole;
  }) => Record<string, number>;

  /** Level 6 — Mode 1 combo eligibility */
  isCombo: (ctx: {
    displayName: string;
    category: string;
    units: Record<string, number>;
    blob: FieldBlob;
    role: ItemRole;
  }) => boolean;

  /** Optional: e.g. multi-unit sides → meals */
  adjustCategory?: (
    category: string,
    isCombo: boolean,
    units: Record<string, number>
  ) => string;
};

export type PipelineResult =
  | { action: 'drop'; reason: 'junk' | 'slot' | 'zero_price' }
  | {
      action: 'keep';
      name: string;
      description?: string;
      category: string;
      isCombo: boolean;
      atomicUnits: Record<string, number>;
      unitContext: string;
      role: ItemRole['kind'];
    };

function defaultDisplay(blob: FieldBlob, role: ItemRole): DisplayResolved {
  if (role.kind === 'promote') {
    return {
      name: role.displayName,
      description: role.displayName,
      unitContext: `${blob.name} ${blob.description}`.trim(),
    };
  }
  return {
    name: blob.name,
    description: blob.description || undefined,
    unitContext: '',
  };
}

/**
 * Run the standardized multi-level pipeline for one menu line.
 */
export function runMenuPipeline(
  input: MenuLineInput,
  rules: MenuPipelineRules
): PipelineResult {
  if (input.price <= 0) return { action: 'drop', reason: 'zero_price' };

  const blob = buildFieldBlob(
    input.name,
    input.description || '',
    input.posName || ''
  );

  // Level 1
  if (rules.isJunk?.(blob)) return { action: 'drop', reason: 'junk' };

  // Level 2
  const role = rules.classifyRole?.(blob) ?? { kind: 'sellable' as const };
  if (role.kind === 'junk') return { action: 'drop', reason: 'junk' };
  if (role.kind === 'slot') return { action: 'drop', reason: 'slot' };

  // Level 3
  const display = rules.resolveDisplay?.(blob, role) ?? defaultDisplay(blob, role);

  // Level 4
  let category = rules.mapCategory({
    catLabel: input.catLabel || '',
    displayName: display.name,
    blob,
    role,
  });

  // Level 5
  const atomicUnits = rules.extractUnits({
    displayName: display.name,
    description: display.description || '',
    unitContext: display.unitContext || '',
    blob,
    role,
  });

  // Level 6
  let isCombo = rules.isCombo({
    displayName: display.name,
    category,
    units: atomicUnits,
    blob,
    role,
  });

  if (rules.adjustCategory) {
    category = rules.adjustCategory(category, isCombo, atomicUnits);
  }

  return {
    action: 'keep',
    name: display.name,
    description: display.description,
    category,
    isCombo,
    atomicUnits,
    unitContext: display.unitContext || '',
    role: role.kind,
  };
}

/**
 * Map many raw lines through the pipeline (dedupe by id left to the adapter).
 */
export function runMenuPipelineAll(
  lines: MenuLineInput[],
  rules: MenuPipelineRules
): Extract<PipelineResult, { action: 'keep' }>[] {
  const out: Extract<PipelineResult, { action: 'keep' }>[] = [];
  for (const line of lines) {
    const r = runMenuPipeline(line, rules);
    if (r.action === 'keep') out.push(r);
  }
  return out;
}
