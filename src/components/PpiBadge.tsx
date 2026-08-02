import React from 'react';
import { getPPIInfo } from '../core/utils/ppi';
import type { MenuItem } from '../core/types/provider';

interface PpiBadgeProps {
  /** Pre-formatted PPI string, e.g. "£0.72 / wing" */
  value?: string | null;
  /** Or pass item + currency to format via getPPIInfo */
  item?: MenuItem;
  currencySymbol?: string;
  /** Brand unit labels from provider.getUnitLabels() */
  unitLabels?: Record<string, string> | null;
  unitPpiLabels?: Record<string, string> | null;
  /** "PPI" prefix for denser lists (default true) */
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Neutral slate chip for price-per-unit metrics.
 * Amber is reserved for suggestions; green for savings — not used here.
 */
export const PpiBadge: React.FC<PpiBadgeProps> = ({
  value,
  item,
  currencySymbol = '£',
  unitLabels,
  unitPpiLabels,
  showLabel = true,
  className = '',
  style,
}) => {
  const text =
    value ??
    (item ? getPPIInfo(item, currencySymbol, unitLabels, unitPpiLabels) : null);
  if (!text) return null;

  return (
    <span className={`badge badge-ppi ${className}`.trim()} style={style}>
      {showLabel ? `PPI ${text}` : text}
    </span>
  );
};

interface PpiComparisonBadgeProps {
  currentPpi: string;
  suggestedPpi: string;
  savingsPerUnit?: string | null;
}

/**
 * Suggestion-context PPI comparison: amber arrow chip + optional green save chip.
 */
export const PpiComparisonBadges: React.FC<PpiComparisonBadgeProps> = ({
  currentPpi,
  suggestedPpi,
  savingsPerUnit,
}) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
      <span className="badge badge-amber" style={{ fontSize: '0.72rem', padding: '0.12rem 0.5rem' }}>
        PPI {currentPpi}
        <span style={{ opacity: 0.75, margin: '0 0.15rem' }}>→</span>
        <strong style={{ color: 'inherit' }}>{suggestedPpi}</strong>
      </span>
      {savingsPerUnit ? (
        <span className="badge badge-green" style={{ fontSize: '0.72rem', padding: '0.12rem 0.5rem' }}>
          {savingsPerUnit}
        </span>
      ) : null}
    </div>
  );
};
