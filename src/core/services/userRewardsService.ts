import type { RewardCoupon } from '../types/provider';

const REWARDS_STORAGE_KEY_PREFIX = 'ff_calc_user_rewards_';

export class UserRewardsService {
  private static subscribers: Set<() => void> = new Set();

  static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
  }

  /**
   * Get provider-scoped reward vouchers from local storage only.
   * No sandbox / demo catalogue — empty unless a real integration writes here later.
   */
  static getVouchers(providerId: string): RewardCoupon[] {
    try {
      const stored = localStorage.getItem(`${REWARDS_STORAGE_KEY_PREFIX}${providerId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(`Failed to load rewards for ${providerId}:`, e);
    }
    return [];
  }

  static setSyncedVouchers(providerId: string, vouchers: RewardCoupon[]) {
    try {
      localStorage.setItem(`${REWARDS_STORAGE_KEY_PREFIX}${providerId}`, JSON.stringify(vouchers));
      this.notifySubscribers();
    } catch (e) {
      console.warn(`Failed to save synced rewards for ${providerId}:`, e);
    }
  }

  static toggleVoucher(providerId: string, voucherId: string) {
    const vouchers = this.getVouchers(providerId);
    const updated = vouchers.map((v) =>
      v.id === voucherId ? { ...v, isApplied: !v.isApplied } : v
    );
    try {
      localStorage.setItem(`${REWARDS_STORAGE_KEY_PREFIX}${providerId}`, JSON.stringify(updated));
      this.notifySubscribers();
    } catch (e) {
      console.warn(`Failed to save rewards for ${providerId}:`, e);
    }
  }

  static getAppliedVouchers(providerId: string): RewardCoupon[] {
    return this.getVouchers(providerId).filter((v) => v.isApplied);
  }

  static clearVouchers(providerId: string) {
    try {
      localStorage.removeItem(`${REWARDS_STORAGE_KEY_PREFIX}${providerId}`);
      this.notifySubscribers();
    } catch (e) {
      console.warn(`Failed to clear rewards for ${providerId}:`, e);
    }
  }

  static hasVouchers(providerId: string): boolean {
    try {
      return localStorage.getItem(`${REWARDS_STORAGE_KEY_PREFIX}${providerId}`) !== null;
    } catch {
      return false;
    }
  }

  static clearLogin(providerId: string) {
    try {
      localStorage.removeItem(`ff_calc_user_email_${providerId}`);
      this.notifySubscribers();
    } catch (e) {
      console.warn(`Failed to clear login for ${providerId}:`, e);
    }
  }

  static hasLogin(providerId: string): boolean {
    try {
      return localStorage.getItem(`ff_calc_user_email_${providerId}`) !== null;
    } catch {
      return false;
    }
  }

  static clearAccountData(providerId: string) {
    this.clearLogin(providerId);
    this.clearVouchers(providerId);
  }
}
