import type { MenuItem } from '../types/provider';
import type { BaseFastFoodProvider } from '../providers/baseProvider';
import {
  GENERIC_UNIT_DISPLAY_NAMES,
  GENERIC_UNIT_PPI_LABELS,
  resolveUnitPpiLabel,
  type UnitLabelContext,
} from './unitLabels';

/**
 * Price-per-unit formatting — **no brand product names**.
 * Pass provider labels so chain SKUs resolve correctly.
 */

function isKnownUnitKey(
  unitKey: string,
  unitLabels?: Record<string, string> | null,
  unitPpiLabels?: Record<string, string> | null
): boolean {
  return !!(
    GENERIC_UNIT_PPI_LABELS[unitKey] ||
    GENERIC_UNIT_DISPLAY_NAMES[unitKey] ||
    unitPpiLabels?.[unitKey] ||
    unitLabels?.[unitKey]
  );
}

export function getPPIInfo(
  item: MenuItem,
  currencySymbol: string = '£',
  unitLabels?: Record<string, string> | null,
  unitPpiLabels?: Record<string, string> | null
): string | null {
  if (!item || item.isCombo || !item.atomicUnits || item.price <= 0) return null;

  const entries = Object.entries(item.atomicUnits);
  if (entries.length === 0) return null;

  // Multi-component packs — not a single-unit PPI
  if (entries.length > 1) return null;

  const [unitKey, count] = entries[0];
  if (!count || count <= 0) return null;

  // Opaque POS-id / unknown keys → no "PPI £x / item" noise
  if (/^\d+$/.test(unitKey) || unitKey.length > 24) return null;
  if (!isKnownUnitKey(unitKey, unitLabels, unitPpiLabels)) return null;

  const ppi = Math.round((item.price / count) * 100) / 100;
  const label = resolveUnitPpiLabel(unitKey, unitPpiLabels, unitLabels);

  return `${currencySymbol}${ppi.toFixed(2)} / ${label}`;
}

/** Convenience: pull labels from the active provider instance */
export function getPPIInfoForProvider(
  item: MenuItem,
  provider: BaseFastFoodProvider
): string | null {
  return getPPIInfo(
    item,
    provider.currencySymbol,
    provider.getUnitLabels(),
    provider.getUnitPpiLabels()
  );
}

export function getPPIInfoWithContext(
  item: MenuItem,
  currencySymbol: string,
  ctx?: UnitLabelContext | null
): string | null {
  return getPPIInfo(item, currencySymbol, ctx?.unitLabels, ctx?.unitPpiLabels);
}
