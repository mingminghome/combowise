import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Scale, Check, X as XIcon, Minus } from 'lucide-react';
import { BaseFastFoodProvider } from '../core/providers/baseProvider';
import { StoreSearchService } from '../core/services/storeSearchService';
import { ComboAuditor } from '../core/engine/auditor';
import { PriceDiffCard } from './PriceDiffCard';
import { DaypartFilterBar } from './DaypartFilterBar';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ListSortBar } from './ListSortBar';
import { MenuItemThumb } from './MenuItemImage';
import { MobileResultsDock, scrollToModeResults, isAppLayout } from './MobileResultsDock';
import { compareByItemFamily } from '../core/utils/itemNameSort';
import type { DaypartFilter } from '../core/types/provider';
import type { AuditResult } from '../core/types/optimizer';

type ListVerdict = 'WORTH_IT' | 'OVERPRICED' | 'EQUAL' | 'UNAVAILABLE';
type VerdictFilter = 'all' | ListVerdict;
type Mode1Sort =
  | 'default'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'best-value'
  | 'worst-value';

const MODE1_SORT_OPTIONS = [
  { id: 'default', label: 'Default (group packs)' },
  { id: 'best-value', label: 'Best value first' },
  { id: 'worst-value', label: 'Overpriced first' },
  { id: 'price-asc', label: 'Price: low → high' },
  { id: 'price-desc', label: 'Price: high → low' },
  { id: 'name-asc', label: 'Name A–Z' },
];

interface Mode1AuditorProps {
  provider: BaseFastFoodProvider;
  locationTierId: string;
}

const COMBO_CATEGORIES = [
  { id: 'all', label: 'All Combos & Meals', icon: '✨' },
  { id: 'box_meals', label: 'Box Meals', icon: '📦' },
  { id: 'meals', label: 'Standard Meals', icon: '🍔' },
  { id: 'buckets', label: 'Sharing Buckets', icon: '🍗' },
  { id: 'kids', label: "Kids' Bucket Boxes", icon: '👶' },
];

function listVerdictFromAudit(audit: AuditResult | null): ListVerdict {
  if (!audit) return 'UNAVAILABLE';
  // Incomplete / no main SKU — not scored as Save/Over
  if (
    audit.incomplete ||
    audit.componentsAlaCarte.length === 0 ||
    /unavailable|partial match|can'?t (fully )?compare|can't compare/i.test(audit.summary)
  ) {
    return 'UNAVAILABLE';
  }
  return audit.verdict;
}

/** Compact ✓ / ✗ / = badge for the combo selection list */
function VerdictBadge({ verdict }: { verdict: ListVerdict }) {
  if (verdict === 'WORTH_IT') {
    return (
      <span
        className="badge badge-green combo-verdict-badge"
        title="Worth it — combo cheaper than a la carte"
        aria-label="Worth it"
      >
        <Check size={12} strokeWidth={3} />
        Save
      </span>
    );
  }
  if (verdict === 'OVERPRICED') {
    return (
      <span
        className="badge badge-red combo-verdict-badge"
        title="Overpriced — a la carte is cheaper"
        aria-label="Overpriced"
      >
        <XIcon size={12} strokeWidth={3} />
        Over
      </span>
    );
  }
  if (verdict === 'EQUAL') {
    return (
      <span
        className="badge badge-amber combo-verdict-badge"
        title="Equal price to a la carte"
        aria-label="Equal price"
      >
        <Minus size={12} strokeWidth={3} />
        Equal
      </span>
    );
  }
  return (
    <span
      className="badge badge-ppi combo-verdict-badge"
      title="Can't fully compare — main item has no standalone street price"
      aria-label="Can't fully compare"
    >
      ?
    </span>
  );
}

export const Mode1Auditor: React.FC<Mode1AuditorProps> = ({ provider, locationTierId }) => {
  const showDaypart = provider.supportsDaypartFiltering();
  const daypartOptions = useMemo(
    () => (showDaypart ? provider.getDaypartFilterOptions() : []),
    [provider, showDaypart]
  );
  const [daypart, setDaypart] = useState<DaypartFilter>(() =>
    showDaypart ? provider.getDefaultDaypartFilter() : 'all'
  );

  useEffect(() => {
    setDaypart(showDaypart ? provider.getDefaultDaypartFilter() : 'all');
  }, [provider.id, showDaypart]);

  // Re-read when store selection / menu cache changes (parent remounts via refreshKey too)
  const storeSelected = !!StoreSearchService.getSelectedStore(provider.id);
  const combos = useMemo(
    () =>
      provider.getCombos(locationTierId, showDaypart ? { daypart } : undefined),
    [provider, locationTierId, daypart, showDaypart, storeSelected]
  );
  const [selectedComboId, setSelectedComboId] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all');
  const [sortBy, setSortBy] = useState<Mode1Sort>('default');

  /** Precompute audits for list badges + value sort (combo count is small) */
  const auditById = useMemo(() => {
    const map = new Map<string, AuditResult | null>();
    for (const c of combos) {
      map.set(c.id, ComboAuditor.auditCombo(provider, c.id, locationTierId));
    }
    return map;
  }, [combos, provider, locationTierId]);

  const verdictById = useMemo(() => {
    const map = new Map<string, ListVerdict>();
    for (const [id, audit] of auditById) {
      map.set(id, listVerdictFromAudit(audit));
    }
    return map;
  }, [auditById]);

  const filteredCombos = useMemo(() => {
    let list = combos.filter((c) => {
      const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const verdict = verdictById.get(c.id) || 'UNAVAILABLE';
      const matchesVerdict = verdictFilter === 'all' || verdict === verdictFilter;
      return matchesCategory && matchesSearch && matchesVerdict;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'default' || sortBy === 'name-asc') {
        // Group pack sizes of the same product (e.g. 3 / 6 Hot Wings)
        return compareByItemFamily(a, b, 'asc');
      }
      const da = auditById.get(a.id);
      const db = auditById.get(b.id);
      const va = listVerdictFromAudit(da ?? null);
      const vb = listVerdictFromAudit(db ?? null);
      // Unavailable sort last
      const rank = (v: ListVerdict) =>
        v === 'UNAVAILABLE' ? 99 : v === 'EQUAL' ? 50 : 0;
      if (rank(va) !== rank(vb) && (va === 'UNAVAILABLE' || vb === 'UNAVAILABLE')) {
        return rank(va) - rank(vb);
      }
      // priceDifference: negative = combo cheaper (worth it)
      const diffA = da?.priceDifference ?? 0;
      const diffB = db?.priceDifference ?? 0;
      if (sortBy === 'best-value') return diffA - diffB; // most savings first
      if (sortBy === 'worst-value') return diffB - diffA; // most overpriced first
      return 0;
    });

    return list;
  }, [combos, activeCategory, searchQuery, verdictFilter, sortBy, verdictById, auditById]);

  useEffect(() => {
    if (filteredCombos.length === 0) {
      if (!combos.some((c) => c.id === selectedComboId)) setSelectedComboId('');
      return;
    }
    if (!filteredCombos.some((c) => c.id === selectedComboId)) {
      setSelectedComboId(filteredCombos[0].id);
    }
  }, [filteredCombos, combos, selectedComboId]);

  const auditResult = useMemo(() => {
    if (!selectedComboId) return null;
    return auditById.get(selectedComboId) ?? ComboAuditor.auditCombo(provider, selectedComboId, locationTierId);
  }, [provider, selectedComboId, locationTierId, auditById]);

  const toggleVerdictFilter = (v: ListVerdict) => {
    setVerdictFilter((prev) => (prev === v ? 'all' : v));
  };

  /** Only scroll on intentional user pick — never on initial auto-selected combo */
  const handleSelectCombo = (comboId: string) => {
    const changed = comboId !== selectedComboId;
    setSelectedComboId(comboId);
    if (changed && isAppLayout()) {
      window.requestAnimationFrame(() => scrollToModeResults());
    }
  };

  const dockTone =
    auditResult?.verdict === 'WORTH_IT'
      ? 'green'
      : auditResult?.verdict === 'OVERPRICED'
        ? 'danger'
        : 'amber';

  const dockTitle = !auditResult
    ? ''
    : auditResult.verdict === 'WORTH_IT'
      ? `Save ${provider.currencySymbol}${Math.abs(auditResult.priceDifference).toFixed(2)}`
      : auditResult.verdict === 'OVERPRICED'
        ? `+${provider.currencySymbol}${Math.abs(auditResult.priceDifference).toFixed(2)} extra`
        : 'Equal price';

  const dockSubtitle = auditResult
    ? `Combo ${provider.currencySymbol}${auditResult.comboPrice.toFixed(2)} · Ala-carte ${provider.currencySymbol}${auditResult.alaCarteTotalPrice.toFixed(2)}`
    : undefined;

  return (
    <div>
      {/* Main 2-Column Layout Aligned with Mode 2 */}
      <div
        className="mode-grid-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(400px, 1.35fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Search, Category Filter Pills & Combo Cards */}
        <div className="mode-select-col">
          {showDaypart && (
            <DaypartFilterBar
              options={daypartOptions}
              value={daypart}
              onChange={setDaypart}
            />
          )}
          {/* SEARCH BAR INPUT */}
          <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <Search
              size={16}
              color="var(--text-muted)"
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search combos (e.g. Zinger, Trilogy, Bucket)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 2.4rem 0.65rem 2.6rem',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
                outline: 'none',
                boxShadow: 'var(--shadow-glow)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {!searchQuery.trim() && (
            <CategoryFilterBar
              options={COMBO_CATEGORIES.map((cat) => {
                const catCount =
                  cat.id === 'all'
                    ? combos.length
                    : combos.filter((c) => c.category === cat.id).length;
                return {
                  id: cat.id,
                  label: cat.label,
                  icon: cat.icon,
                  count: catCount,
                  title: `${catCount} combo(s)`,
                };
              })}
              value={activeCategory}
              onChange={setActiveCategory}
              ariaLabel="Filter combos by category"
            />
          )}

          {searchQuery.trim() && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
              Showing {filteredCombos.length} search result(s) for &quot;<strong>{searchQuery}</strong>&quot;
            </div>
          )}

          {/* Verdict filters (clickable) + sort */}
          {combos.length > 0 && (
            <div className="list-toolbar">
              <div className="combo-verdict-legend" role="group" aria-label="Filter by value verdict">
                <button
                  type="button"
                  className={`badge badge-green combo-verdict-badge combo-verdict-filter-btn${verdictFilter === 'WORTH_IT' ? ' is-active' : ''}`}
                  aria-pressed={verdictFilter === 'WORTH_IT'}
                  title="Show only combos that save money vs a la carte"
                  onClick={() => toggleVerdictFilter('WORTH_IT')}
                >
                  <Check size={11} strokeWidth={3} /> Save
                </button>
                <button
                  type="button"
                  className={`badge badge-red combo-verdict-badge combo-verdict-filter-btn${verdictFilter === 'OVERPRICED' ? ' is-active' : ''}`}
                  aria-pressed={verdictFilter === 'OVERPRICED'}
                  title="Show only overpriced combos"
                  onClick={() => toggleVerdictFilter('OVERPRICED')}
                >
                  <XIcon size={11} strokeWidth={3} /> Over
                </button>
                <button
                  type="button"
                  className={`badge badge-amber combo-verdict-badge combo-verdict-filter-btn${verdictFilter === 'EQUAL' ? ' is-active' : ''}`}
                  aria-pressed={verdictFilter === 'EQUAL'}
                  title="Show only equal-price combos"
                  onClick={() => toggleVerdictFilter('EQUAL')}
                >
                  <Minus size={11} strokeWidth={3} /> Equal
                </button>
                <span className="combo-verdict-filter-hint">
                  {verdictFilter === 'all'
                    ? 'vs buying items separately · tap to filter'
                    : `Filter: ${verdictFilter === 'WORTH_IT' ? 'Save' : verdictFilter === 'OVERPRICED' ? 'Over' : 'Equal'} · tap again to clear`}
                </span>
              </div>
              <ListSortBar
                value={sortBy}
                options={MODE1_SORT_OPTIONS}
                onChange={(id) => setSortBy(id as Mode1Sort)}
                countLabel={`${filteredCombos.length} combo${filteredCombos.length === 1 ? '' : 's'}`}
              />
            </div>
          )}

          {/* Combo List Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredCombos.length > 0 ? (
              filteredCombos.map((c) => {
                const isSelected = c.id === selectedComboId;
                const verdict = verdictById.get(c.id) || 'UNAVAILABLE';
                // Free-form description from live provider menu (not synthetic)
                const freeDesc = (c.description || '').trim();

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCombo(c.id)}
                    className="glass-card"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectCombo(c.id);
                      }
                    }}
                    style={{
                      padding: '1.1rem',
                      borderRadius: '14px',
                      border: `1.5px solid ${isSelected ? 'var(--primary-red)' : 'var(--border-color)'}`,
                      background: isSelected ? 'var(--primary-red-glow)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 16px var(--primary-red-glow)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <MenuItemThumb item={c} size="md" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '0.98rem',
                              color: 'var(--text-main)',
                              minWidth: 0,
                              lineHeight: 1.3,
                            }}
                          >
                            {c.name}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem', flexShrink: 0 }}>
                            <span style={{ fontWeight: 800, color: 'var(--accent-green)', fontSize: '1.05rem' }}>
                              {provider.currencySymbol}{c.price.toFixed(2)}
                            </span>
                            <VerdictBadge verdict={verdict} />
                          </div>
                        </div>

                        {freeDesc ? (
                          <p
                            style={{
                              fontSize: '0.82rem',
                              color: 'var(--text-muted)',
                              marginTop: '0.4rem',
                              lineHeight: 1.4,
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {freeDesc}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', borderRadius: '14px' }}>
                {searchQuery.trim() ? (
                  <>
                    No combo meals found matching &quot;<strong>{searchQuery}</strong>&quot;.
                    <br />
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        marginTop: '0.75rem',
                        background: 'var(--bg-subtle-hover)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      Clear Search
                    </button>
                  </>
                ) : combos.length === 0 ? (
                  <>
                    No menu loaded yet.
                    <br />
                    <span style={{ fontSize: '0.82rem' }}>
                      Select a store above to download the current menu.
                    </span>
                  </>
                ) : verdictFilter !== 'all' ? (
                  <>
                    No combos match this value filter.
                    <br />
                    <button
                      type="button"
                      onClick={() => setVerdictFilter('all')}
                      style={{
                        marginTop: '0.75rem',
                        background: 'var(--bg-subtle-hover)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      Clear value filter
                    </button>
                  </>
                ) : (
                  <>No combos in this category / daypart.</>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Audit Result Display (Sticky on desktop) */}
        <div
          id="mode-results-panel"
          className="mode-results-col"
          style={{ position: 'sticky', top: '1.5rem' }}
        >
          {auditResult ? (
            <PriceDiffCard
              auditResult={auditResult}
              currencySymbol={provider.currencySymbol}
              unitLabels={provider.getUnitLabels()}
              unitPpiLabels={provider.getUnitPpiLabels()}
            />
          ) : (
            <div className="glass-card audit-result-empty">
              <Scale size={44} style={{ opacity: 0.28, marginBottom: '0.85rem' }} />
              <h3>Select a combo to audit</h3>
              <p>
                Pick a meal on the left to compare combo price vs itemized ala-carte and see the
                value verdict.
              </p>
            </div>
          )}
        </div>
      </div>

      <MobileResultsDock
        visible={!!auditResult}
        title={dockTitle}
        subtitle={dockSubtitle}
        tone={dockTone}
        actionLabel="View audit"
        onViewDetails={() => scrollToModeResults()}
      />
    </div>
  );
};
