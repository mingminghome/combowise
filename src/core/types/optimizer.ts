import type { MenuItem } from './provider';

export interface WishlistItem {
  itemId: string;
  count: number;
}

export interface AuditResult {
  comboItem: MenuItem;
  comboPrice: number;
  componentsAlaCarte: {
    item: MenuItem;
    count: number;
    subtotal: number;
  }[];
  alaCarteTotalPrice: number;
  priceDifference: number; // comboPrice - alaCarteTotalPrice
  savingsPercentage: number;
  isComboCheaper: boolean;
  verdict: 'WORTH_IT' | 'OVERPRICED' | 'EQUAL';
  summary: string;
  /** True when main item(s) lack a standalone SKU — not scored as over/under */
  incomplete?: boolean;
}

export interface OptimisedBundle {
  bundleItem: MenuItem;
  count: number;
  price: number;
  itemsCovered: {
    itemId: string;
    name: string;
    count: number;
  }[];
}

export interface OptimizationResult {
  originalAlaCarteTotal: number;
  optimalTotal: number;
  savingsAmount: number;
  savingsPercentage: number;
  bundlesToBuy: OptimisedBundle[];
  standaloneItemsToBuy: {
    item: MenuItem;
    count: number;
    subtotal: number;
  }[];
  recommendations: Recommendation[];
}

export type RecommendationType =
  | 'UPGRADE_TO_MEAL'
  | 'SWAP_FOR_BUCKET'
  | 'ADD_SIDE_FOR_MEAL';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  priceChange: number; // Negative = savings, Positive = small extra cost for high value
  isSavings: boolean;
  ppiComparison?: {
    currentPpi: string;   // e.g. "£0.74 / wing"
    suggestedPpi: string; // e.g. "£0.72 / wing"
    unitLabel: string;    // e.g. "wing"
    savingsPerUnit?: string; // e.g. "Save £0.02 / wing"
  };
  itemsToModify: {
    action: 'add' | 'remove' | 'swap';
    itemId: string;
    count: number;
  }[];
}
