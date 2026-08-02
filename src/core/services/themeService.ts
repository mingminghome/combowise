export type ThemeMode = 'dark' | 'light' | 'auto';

const THEME_STORAGE_KEY = 'ff_calc_theme';

export class ThemeService {
  private static subscribers: Set<() => void> = new Set();
  private static mediaQuery: MediaQueryList | null = null;

  static init() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', () => {
        if (this.getThemeMode() === 'auto') {
          this.applyTheme();
        }
      });
      this.applyTheme();
    }
  }

  static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
  }

  static getThemeMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light' || stored === 'auto') {
        return stored;
      }
    } catch {
      // Fallback to auto
    }
    return 'auto';
  }

  static setThemeMode(mode: ThemeMode) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Failed to save theme setting:', e);
    }
    this.applyTheme();
    this.notifySubscribers();
  }

  static getResolvedTheme(): 'dark' | 'light' {
    const mode = this.getThemeMode();
    if (mode === 'auto') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return mode;
  }

  static applyTheme() {
    const resolved = this.getResolvedTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    // Keep browser chrome / PWA status bar in sync
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolved === 'light' ? '#f5f6f8' : '#0b0d11');
    }
  }
}
