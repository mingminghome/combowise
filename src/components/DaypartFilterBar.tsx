import React from 'react';
import type { DaypartFilter } from '../core/types/provider';

interface DaypartFilterBarProps {
  options: { id: DaypartFilter; label: string }[];
  value: DaypartFilter;
  onChange: (next: DaypartFilter) => void;
}

/**
 * Compact daypart chips (Breakfast / All day menu / Full menu).
 * Only render when the provider has daypart support.
 */
export const DaypartFilterBar: React.FC<DaypartFilterBarProps> = ({
  options,
  value,
  onChange,
}) => {
  if (options.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Menu daypart"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        marginBottom: '0.85rem',
      }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            style={{
              padding: '0.35rem 0.7rem',
              fontSize: '0.78rem',
              fontWeight: active ? 800 : 600,
              borderRadius: 8,
              border: `1.5px solid ${active ? 'var(--primary-red)' : 'var(--border-color)'}`,
              background: active ? 'var(--primary-red-glow)' : 'var(--bg-subtle)',
              color: active ? 'var(--primary-red)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              lineHeight: 1.2,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
