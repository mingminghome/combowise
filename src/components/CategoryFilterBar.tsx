import React from 'react';

export type CategoryFilterOption = {
  id: string;
  label: string;
  icon?: string;
  /** Optional count badge (basket qty, combo count, etc.) */
  count?: number;
  /**
   * Amber “has selection” highlight (Basket Optimiser basket qty).
   * Independent of `count` so informational badges (e.g. combo totals)
   * do not force amber on every non-empty category.
   */
  hasItems?: boolean;
  /** Tooltip */
  title?: string;
  /** Visual marker for unknown / unmapped categories */
  isUnknown?: boolean;
};

interface CategoryFilterBarProps {
  options: CategoryFilterOption[];
  value: string;
  onChange: (id: string) => void;
  /** Shown when options is empty */
  emptyLabel?: string;
  className?: string;
  /** Accessible name for the group */
  ariaLabel?: string;
}

/**
 * Shared category filters (Basket Optimiser reference layout).
 * Amber `has-items` is only applied when the option sets `hasItems: true`
 * (e.g. basket qty &gt; 0). A plain `count` only shows a badge.
 */
export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  options,
  value,
  onChange,
  emptyLabel = 'No categories yet — load a store menu first.',
  className = '',
  ariaLabel = 'Filter by category',
}) => {
  return (
    <div
      className={`menu-cat-pills ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {options.length === 0 ? (
        <div className="menu-cat-pills-empty">{emptyLabel}</div>
      ) : (
        options.map((cat) => {
          const isActive = value === cat.id;
          const count = cat.count ?? 0;
          const showCount = cat.count != null && count > 0;
          const hasItems = Boolean(cat.hasItems);
          return (
            <button
              key={cat.id}
              type="button"
              className={`menu-cat-pill${isActive ? ' is-active' : ''}${hasItems ? ' has-items' : ''}${cat.isUnknown && !isActive ? ' is-unknown' : ''}`}
              title={
                cat.title ||
                (cat.isUnknown ? `Category “${cat.id}”` : cat.label)
              }
              aria-pressed={isActive}
              onClick={() => onChange(cat.id)}
            >
              <span className="menu-cat-pill-label">
                {cat.icon != null && cat.icon !== '' && (
                  <span className="menu-cat-pill-icon" aria-hidden>
                    {cat.icon}
                  </span>
                )}
                <span className="menu-cat-pill-text">{cat.label}</span>
              </span>
              {showCount && <span className="menu-cat-pill-count">{count}</span>}
            </button>
          );
        })
      )}
    </div>
  );
};

export default CategoryFilterBar;
