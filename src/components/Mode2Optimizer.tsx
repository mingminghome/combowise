import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Minus, RotateCcw, TrendingDown, CheckCircle2, ShoppingBag, ArrowRight, Lightbulb, Check, Search, X } from 'lucide-react';
import { BaseFastFoodProvider } from '../core/providers/baseProvider';
import { StoreSearchService } from '../core/services/storeSearchService';
import { BasketOptimizer } from '../core/engine/optimizer';
import type { Recommendation, WishlistItem } from '../core/types/optimizer';
import type { DaypartFilter, MenuItemCategory } from '../core/types/provider';
import { getPPIInfoForProvider } from '../core/utils/ppi';
import { buildCategoryTabsFromItems, categoryIcon, categoryLabel } from '../core/utils/menuCategories';
import { PpiBadge, PpiComparisonBadges } from './PpiBadge';
import { MenuItemThumb } from './MenuItemImage';
import { DaypartFilterBar } from './DaypartFilterBar';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ListSortBar } from './ListSortBar';
import { MobileResultsDock, scrollToModeResults } from './MobileResultsDock';
import { compareByItemFamily } from '../core/utils/itemNameSort';

type Mode2Sort = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

const MODE2_SORT_OPTIONS = [
  { id: 'default', label: 'Default (group packs)' },
  { id: 'price-asc', label: 'Price: low → high' },
  { id: 'price-desc', label: 'Price: high → low' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
];

interface Mode2OptimizerProps {
  provider: BaseFastFoodProvider;
  locationTierId: string;
}

export const Mode2Optimizer: React.FC<Mode2OptimizerProps> = ({ provider, locationTierId }) => {
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

  const storeSelected = !!StoreSearchService.getSelectedStore(provider.id);
  /** Ala-carte + pure multi-packs (wings/tenders packs) — same SKUs Mode 1 prices against */
  const items = useMemo(
    () =>
      provider.getSelectableMenuItems(locationTierId, showDaypart ? { daypart } : undefined),
    [provider, locationTierId, daypart, showDaypart, storeSelected]
  );

  /** Pills from loaded menu only — unknown categories still appear (📁 + humanized id). */
  const categoryTabs = useMemo(() => buildCategoryTabsFromItems(items), [items]);

  const [wishlist, setWishlist] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<MenuItemCategory>('burgers');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<Mode2Sort>('default');

  // Prefer a tab that exists; prefer chicken when burgers missing (wings live there)
  useEffect(() => {
    if (categoryTabs.length === 0) return;
    if (!categoryTabs.some((t) => t.id === activeCategory)) {
      const prefer =
        categoryTabs.find((t) => t.id === 'chicken') ||
        categoryTabs.find((t) => t.id === 'burgers') ||
        categoryTabs[0];
      setActiveCategory(prefer.id);
    }
  }, [categoryTabs, activeCategory]);

  const handleQuantityChange = (itemId: string, delta: number) => {
    setWishlist((prev) => {
      const current = prev[itemId] || 0;
      const updated = Math.max(0, current + delta);
      if (updated === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: updated };
    });
  };

  const handleReset = () => {
    setWishlist({});
  };

  const wishlistArray: WishlistItem[] = useMemo(() => {
    return Object.entries(wishlist).map(([itemId, count]) => ({ itemId, count }));
  }, [wishlist]);

  const optimizationResult = useMemo(() => {
    if (wishlistArray.length === 0) return null;
    return BasketOptimizer.optimizeBasket(provider, wishlistArray, locationTierId);
  }, [provider, wishlistArray, locationTierId]);

  const handleApplyRecommendation = (rec: Recommendation) => {
    setWishlist((prev) => {
      const copy = { ...prev };
      // Removals first so adds on the same id are not wiped
      rec.itemsToModify.forEach((mod) => {
        if (mod.action === 'remove') {
          const next = (copy[mod.itemId] || 0) - (mod.count || 0);
          if (next <= 0) delete copy[mod.itemId];
          else copy[mod.itemId] = next;
        }
      });
      rec.itemsToModify.forEach((mod) => {
        if (mod.action === 'add' || mod.action === 'swap') {
          copy[mod.itemId] = (copy[mod.itemId] || 0) + mod.count;
        }
      });
      return copy;
    });
  };

  const totalItemsCount = Object.values(wishlist).reduce((a, b) => a + b, 0);

  // Group user selected items by category
  const selectedItemsGrouped = useMemo(() => {
    const groups: Record<string, { item: any; count: number }[]> = {};
    Object.entries(wishlist).forEach(([itemId, count]) => {
      const item = items.find((i) => i.id === itemId);
      if (item && count > 0) {
        if (!groups[item.category]) {
          groups[item.category] = [];
        }
        groups[item.category].push({ item, count });
      }
    });
    return groups;
  }, [wishlist, items]);

  // Compute item counts per category for tab badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(wishlist).forEach(([itemId, qty]) => {
      const item = items.find((i) => i.id === itemId);
      if (item) {
        counts[item.category] = (counts[item.category] || 0) + qty;
      }
    });
    return counts;
  }, [wishlist, items]);

  // Filter + sort items based on active category, search, and sort
  const filteredMenuItems = useMemo(() => {
    let list = items.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

      if (searchQuery.trim()) {
        return matchesSearch; // Global search across all categories when searching
      }

      return item.category === activeCategory;
    });

    // Default + name sorts group pack sizes of the same product
    // e.g. "3 Hot Wings" / "6 Hot Wings" under "hot wing", size 3 then 6
    list = [...list].sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'name-desc') return compareByItemFamily(a, b, 'desc');
      // default + name-asc
      return compareByItemFamily(a, b, 'asc');
    });

    return list;
  }, [items, activeCategory, searchQuery, sortBy]);

  return (
    <div>

      {/* PRICE COMPARISON & SAVINGS BANNER */}
      {optimizationResult && (
        <div
          className="glass-card"
          style={{
            padding: '1.25rem 1.75rem',
            marginBottom: '1.5rem',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--accent-green-border)',
            boxShadow: 'var(--shadow-glow)',
            borderRadius: '16px',
          }}
        >
          {optimizationResult.savingsAmount > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Ala-Carte Wishlist Total
                  </span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                    {provider.currencySymbol}{optimizationResult.originalAlaCarteTotal.toFixed(2)}
                  </span>
                </div>

                <ArrowRight size={24} color="var(--accent-green)" />

                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--accent-green)', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>
                    Optimized Bundled Price
                  </span>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-green)', lineHeight: 1.1 }}>
                    {provider.currencySymbol}{optimizationResult.optimalTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <span className="badge badge-green" style={{ fontSize: '1.1rem', padding: '0.55rem 1.25rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingDown size={18} /> SAVE {provider.currencySymbol}{optimizationResult.savingsAmount.toFixed(2)} ({optimizationResult.savingsPercentage}%)
                </span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'var(--accent-green-bg)',
                  border: '1.5px solid var(--accent-green-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CheckCircle2 size={28} color="var(--accent-green)" />
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-green)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Best Price Verified • Lowest Cost Combination
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '0.1rem', lineHeight: 1.1 }}>
                    {provider.currencySymbol}{optimizationResult.optimalTotal.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Your selected items are already at the lowest possible cost! No extra bundling required.
                  </div>
                </div>
              </div>

              <span className="badge badge-green" style={{ fontSize: '0.95rem', padding: '0.55rem 1.15rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', boxShadow: '0 4px 14px var(--accent-green-glow)' }}>
                <CheckCircle2 size={16} /> Lowest Price Guaranteed
              </span>
            </div>
          )}
        </div>
      )}

      {/* MAIN 2-COLUMN LAYOUT */}
      <div
        className="mode-grid-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(400px, 1.35fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left Column: full height when basket empty; compact when results exist */}
        <div
          className={
            totalItemsCount > 0
              ? 'mode-select-col mode-select-col--compact'
              : 'mode-select-col'
          }
        >
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
              placeholder="Search items (e.g. Popcorn, Wings, Pepsi, Gravy)..."
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
              options={categoryTabs.map((cat) => {
                const basketQty = categoryCounts[cat.id] || 0;
                return {
                  id: cat.id,
                  label: cat.label,
                  icon: cat.icon,
                  count: basketQty,
                  // Amber only when this category has items in the basket
                  hasItems: basketQty > 0,
                  isUnknown: cat.isUnknown,
                  title: cat.isUnknown
                    ? `Category “${cat.id}”`
                    : basketQty > 0
                      ? `${basketQty} selected · ${cat.itemCount} on menu`
                      : `${cat.itemCount} item(s) on menu`,
                };
              })}
              value={activeCategory}
              onChange={(id) => setActiveCategory(id as MenuItemCategory)}
              emptyLabel="No categories yet — load a store menu first."
              ariaLabel="Filter menu by category"
            />
          )}

          {searchQuery.trim() && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
              Showing {filteredMenuItems.length} search result(s) for &quot;<strong>{searchQuery}</strong>&quot;
            </div>
          )}

          {items.length > 0 && (
            <div className="list-toolbar">
              <ListSortBar
                value={sortBy}
                options={MODE2_SORT_OPTIONS}
                onChange={(id) => setSortBy(id as Mode2Sort)}
                countLabel={`${filteredMenuItems.length} item${filteredMenuItems.length === 1 ? '' : 's'}`}
              />
            </div>
          )}

          {/* Menu items — list on phone, 2-col card grid on desktop */}
          <div className="menu-item-list">
            {filteredMenuItems.length > 0 ? (
              filteredMenuItems.map((item) => {
                const count = wishlist[item.id] || 0;
                const unitKeys = Object.keys(item.atomicUnits || {});
                const isPurePack =
                  unitKeys.length === 1 && (item.atomicUnits?.[unitKeys[0]] || 0) > 1;
                return (
                  <div
                    key={item.id}
                    className={`glass-card menu-item-card${count > 0 ? ' is-in-basket' : ''}`}
                  >
                    <div className="menu-item-card-top">
                      <MenuItemThumb item={item} size="md" />
                      <div className="menu-item-card-body">
                        <h4 className="menu-item-card-title">
                          <span>{item.name}</span>
                          {isPurePack && (
                            <span className="badge badge-ppi" title="Pack size">
                              Pack
                            </span>
                          )}
                        </h4>
                        {item.description && (
                          <p className="menu-item-card-desc">{item.description}</p>
                        )}
                        <div className="menu-item-card-price-row">
                          <span className="menu-item-card-price">
                            {provider.currencySymbol}
                            {item.price.toFixed(2)}
                          </span>
                          <PpiBadge
                            item={item}
                            currencySymbol={provider.currencySymbol}
                            unitLabels={provider.getUnitLabels()}
                            unitPpiLabels={provider.getUnitPpiLabels()}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="menu-item-card-actions">
                      {count > 0 && (
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, -1)}
                          aria-label={`Remove one ${item.name}`}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Minus size={15} />
                        </button>
                      )}
                      {count > 0 && (
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            minWidth: 20,
                            textAlign: 'center',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {count}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.id, 1)}
                        aria-label={`Add one ${item.name}`}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          border: 'none',
                          background: 'var(--primary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px var(--primary-glow)',
                        }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                {searchQuery.trim() ? (
                  <>
                    No items found matching &quot;<strong>{searchQuery}</strong>&quot;.
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
                ) : items.length === 0 ? (
                  <>
                    No menu loaded yet.
                    <br />
                    <span style={{ fontSize: '0.82rem' }}>
                      Select a store above to download the current menu.
                    </span>
                  </>
                ) : (
                  <>No items in this category / daypart.</>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: sticky on desktop; hidden on app when basket empty */}
        <div
          id="mode-results-panel"
          className={
            totalItemsCount > 0
              ? 'mode-results-col'
              : 'mode-results-col mode-results-col--empty'
          }
          style={{ position: 'sticky', top: '1.5rem' }}
        >
          {optimizationResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* GROUPED USER SELECTED BASKET WITH INLINE SUGGESTIONS */}
              <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShoppingBag size={20} color="var(--primary-red)" />
                    Your Selected Basket
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {totalItemsCount} items
                    </span>
                    {totalItemsCount > 0 && (
                      <button
                        onClick={handleReset}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-muted)',
                          padding: '0.3rem 0.65rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <RotateCcw size={12} /> Clear Basket
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {Object.entries(selectedItemsGrouped).map(([catId, groupItems]) => {
                    const catObj = {
                      id: catId,
                      label: categoryLabel(catId),
                      icon: categoryIcon(catId),
                    };

                    const relevantRecs = optimizationResult.recommendations.filter((rec) => {
                      // Never surface “upgrades” that make £/unit worse
                      if (
                        rec.ppiComparison?.currentPpi &&
                        rec.ppiComparison?.suggestedPpi
                      ) {
                        const cur = parseFloat(
                          rec.ppiComparison.currentPpi.replace(/[^0-9.]/g, '')
                        );
                        const sug = parseFloat(
                          rec.ppiComparison.suggestedPpi.replace(/[^0-9.]/g, '')
                        );
                        if (!Number.isNaN(cur) && !Number.isNaN(sug) && sug > cur + 0.005) {
                          return false;
                        }
                      }
                      // Only surface real value trades (meals / packs), not "remove line to save"
                      if (catId === 'chicken' && (rec.type === 'SWAP_FOR_BUCKET' || rec.type === 'UPGRADE_TO_MEAL' || rec.id.includes('wing') || rec.id.includes('chicken'))) return true;
                      if (catId === 'burgers' && (rec.type === 'UPGRADE_TO_MEAL' || rec.type === 'ADD_SIDE_FOR_MEAL' || rec.id.includes('burger'))) return true;
                      if (catId === 'sides' && (rec.type === 'ADD_SIDE_FOR_MEAL' || rec.type === 'UPGRADE_TO_MEAL')) return true;
                      if (catId === 'drinks' && rec.type === 'UPGRADE_TO_MEAL') return true;
                      return false;
                    });

                    return (
                      <div
                        key={catId}
                        style={{
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          padding: '1.1rem',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-heading)' }}>
                          <span>{catObj?.icon || '📌'}</span>
                          <span>{catObj?.label || catId}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {groupItems.map(({ item, count }) => {
                            const ppiStr = getPPIInfoForProvider(item, provider);
                            return (
                              <div
                                key={item.id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.65rem',
                                  fontSize: '0.9rem',
                                  color: 'var(--text-main)',
                                  padding: '0.45rem 0.5rem',
                                  borderRadius: '10px',
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                                  <MenuItemThumb item={item} size="sm" />
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ fontWeight: 700 }}>{item.name}</span>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      {provider.currencySymbol}
                                      {item.price.toFixed(2)} each
                                      {ppiStr ? ` · ${ppiStr}` : ''}
                                    </span>
                                  </span>
                                </span>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    aria-label={`Remove one ${item.name}`}
                                    onClick={() => handleQuantityChange(item.id, -1)}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-subtle)',
                                      color: 'var(--text-main)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                    {count}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Add one ${item.name}`}
                                    onClick={() => handleQuantityChange(item.id, 1)}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-subtle)',
                                      color: 'var(--text-main)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <span style={{ fontWeight: 800, minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {provider.currencySymbol}
                                    {(item.price * count).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {relevantRecs.slice(0, 2).map((rec) => (
                          <div
                            key={rec.id}
                            style={{
                              marginTop: '0.85rem',
                              padding: '0.85rem 1rem',
                              background: rec.isSavings ? 'var(--accent-green-bg)' : 'var(--accent-amber-bg)',
                              border: `1.5px dashed ${rec.isSavings ? 'var(--accent-green-border)' : 'var(--accent-amber-border)'}`,
                              borderRadius: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.65rem',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: rec.isSavings ? 'var(--accent-green)' : 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Lightbulb size={15} /> {rec.title}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                                {rec.description}
                              </div>
                              {rec.ppiComparison && (
                                <div style={{ marginTop: '0.4rem' }}>
                                  <PpiComparisonBadges
                                    currentPpi={rec.ppiComparison.currentPpi}
                                    suggestedPpi={rec.ppiComparison.suggestedPpi}
                                    savingsPerUnit={rec.ppiComparison.savingsPerUnit}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyRecommendation(rec)}
                              className="btn-primary"
                              style={{
                                padding: '0.55rem 1rem',
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                borderRadius: '10px',
                                alignSelf: 'flex-start',
                                background: rec.isSavings ? 'var(--accent-green)' : 'var(--primary)',
                                color: '#ffffff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                cursor: 'pointer',
                                border: 'none',
                              }}
                            >
                              <Check size={16} strokeWidth={3} /> Apply to basket
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* FINAL ORDER CHECKLIST */}
              <div
                className="glass-card"
                style={{
                  padding: '1.5rem',
                  borderColor: 'var(--border-color)',
                  background: 'var(--bg-card)',
                  borderRadius: '16px',
                }}
              >
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, marginBottom: '0.35rem' }}>
                  Recommended Order Breakdown
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.85rem', lineHeight: 1.4 }}>
                  Cheapest pack mix that covers your wishlist. Line totals use live menu prices.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {optimizationResult.bundlesToBuy.map((b, idx) => (
                    <div
                      key={`b-${idx}`}
                      style={{
                        padding: '0.85rem 1.1rem',
                        background: 'var(--primary-soft)',
                        border: '1px solid var(--primary-border)',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                          {b.count}× {b.bundleItem.name}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          <span>
                            Covers {b.itemsCovered.map((ic) => `${ic.count}× ${ic.name}`).join(', ')}
                          </span>
                          <span>
                            · {provider.currencySymbol}
                            {b.bundleItem.price.toFixed(2)} each
                          </span>
                          <PpiBadge
                            item={b.bundleItem}
                            currencySymbol={provider.currencySymbol}
                            unitLabels={provider.getUnitLabels()}
                            unitPpiLabels={provider.getUnitPpiLabels()}
                          />
                        </span>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent-green)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {provider.currencySymbol}
                        {b.price.toFixed(2)}
                      </span>
                    </div>
                  ))}

                  {optimizationResult.standaloneItemsToBuy.map((s, idx) => {
                    const ppiStr = getPPIInfoForProvider(s.item, provider);
                    return (
                      <div
                        key={`s-${idx}`}
                        style={{
                          padding: '0.85rem 1.1rem',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                          fontSize: '0.88rem',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                            {s.count}× {s.item.name}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {provider.currencySymbol}
                            {s.item.price.toFixed(2)} each
                            {ppiStr ? ` · ${ppiStr}` : ''}
                          </span>
                        </span>
                        <span style={{ fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {provider.currencySymbol}
                          {s.subtotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}

                  {(optimizationResult.bundlesToBuy.length > 0 ||
                    optimizationResult.standaloneItemsToBuy.length > 0) && (
                    <div
                      style={{
                        marginTop: '0.25rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 800,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Order total</span>
                      <span style={{ color: 'var(--accent-green)', fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>
                        {provider.currencySymbol}
                        {optimizationResult.optimalTotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div
              className="glass-card"
              style={{
                padding: '4rem 2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                borderRadius: '16px',
              }}
            >
              <ShoppingBag size={52} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-main)', marginBottom: '0.5rem', fontWeight: 800 }}>
                Your Basket is Empty
              </h3>
              <p style={{ fontSize: '0.92rem', maxWidth: 400, margin: '0 auto' }}>
                Select items from the food & drink categories on the left to see your grouped basket, inline suggestions, and before vs. optimized prices.
              </p>
            </div>
          )}
        </div>
      </div>

      <MobileResultsDock
        visible={!!optimizationResult && totalItemsCount > 0}
        title={
          optimizationResult && optimizationResult.savingsAmount > 0
            ? `Save ${provider.currencySymbol}${optimizationResult.savingsAmount.toFixed(2)}`
            : optimizationResult
              ? `Best price ${provider.currencySymbol}${optimizationResult.optimalTotal.toFixed(2)}`
              : ''
        }
        subtitle={
          optimizationResult
            ? `${totalItemsCount} items · Optimized ${provider.currencySymbol}${optimizationResult.optimalTotal.toFixed(2)} · Ala-carte ${provider.currencySymbol}${optimizationResult.originalAlaCarteTotal.toFixed(2)}`
            : undefined
        }
        tone={optimizationResult && optimizationResult.savingsAmount > 0 ? 'green' : 'primary'}
        actionLabel="View basket"
        onViewDetails={() => scrollToModeResults()}
      />
    </div>
  );
};
