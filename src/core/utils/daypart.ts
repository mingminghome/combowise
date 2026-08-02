import type {
  DaypartConfig,
  DaypartFilter,
  FastFoodProvider,
  MenuDaypart,
  MenuItem,
} from '../types/provider';

const DAYPART_ORDER: MenuDaypart[] = ['breakfast', 'main', 'evening', 'all_day'];

const DEFAULT_LABELS: Record<MenuDaypart | 'all', string> = {
  all: 'Full menu',
  all_day: 'All day',
  breakfast: 'Breakfast',
  main: 'All day menu',
  evening: 'Evening',
};

/**
 * Effective daypart for an item. Untagged items count as `main`
 * (standard chicken / lunch catalogue).
 */
export function resolveItemDaypart(item: MenuItem): MenuDaypart {
  return item.daypart ?? 'main';
}

/**
 * Whether an item belongs in a UI/engine daypart filter.
 * - `all` → everything
 * - concrete daypart → that daypart + `all_day` shared items
 */
export function itemMatchesDaypartFilter(item: MenuItem, filter: DaypartFilter): boolean {
  if (filter === 'all') return true;
  const d = resolveItemDaypart(item);
  if (d === 'all_day') return true;
  return d === filter;
}

export function filterItemsByDaypart(items: MenuItem[], filter?: DaypartFilter): MenuItem[] {
  if (!filter || filter === 'all') return items;
  return items.filter((i) => itemMatchesDaypartFilter(i, filter));
}

/** Dayparts present on items (excludes pure `all_day`-only discovery noise). */
export function discoverDaypartsFromItems(items: MenuItem[]): MenuDaypart[] {
  const found = new Set<MenuDaypart>();
  for (const item of items) {
    const d = resolveItemDaypart(item);
    if (d !== 'all_day') found.add(d);
  }
  return DAYPART_ORDER.filter((d) => d !== 'all_day' && found.has(d));
}

export function mergeDaypartConfig(
  fromMenu?: DaypartConfig | null,
  fromPlugin?: DaypartConfig | null
): DaypartConfig | undefined {
  if (!fromMenu && !fromPlugin) return undefined;
  return {
    ...fromMenu,
    ...fromPlugin,
    labels: { ...fromMenu?.labels, ...fromPlugin?.labels },
    windows: { ...fromMenu?.windows, ...fromPlugin?.windows },
    supported: fromPlugin?.supported ?? fromMenu?.supported,
  };
}

/**
 * Dayparts the chain should offer in the UI.
 * Prefer explicit `supported`; else detect from items.
 */
export function resolveSupportedDayparts(
  items: MenuItem[],
  config?: DaypartConfig | null
): MenuDaypart[] {
  if (config?.supported && config.supported.length > 0) {
    return config.supported.filter((d) => d !== 'all_day');
  }
  return discoverDaypartsFromItems(items);
}

/** True when the chain has (or declares) more than a single implicit main menu. */
export function hasDaypartUi(items: MenuItem[], config?: DaypartConfig | null): boolean {
  const supported = resolveSupportedDayparts(items, config);
  if (supported.length >= 2) return true;
  if (supported.length === 1 && supported[0] !== 'main') return true;
  // Explicit breakfast (etc.) in supported even if no items yet — plugin scaffolding
  if (config?.supported?.some((d) => d !== 'main' && d !== 'all_day')) return true;
  return false;
}

export function resolveDefaultDaypartFilter(
  items: MenuItem[],
  config?: DaypartConfig | null
): DaypartFilter {
  if (config?.defaultFilter) return config.defaultFilter;
  if (!hasDaypartUi(items, config)) return 'all';
  return 'main';
}

export function daypartLabel(
  key: DaypartFilter,
  config?: DaypartConfig | null
): string {
  return config?.labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
}

/**
 * Suggest a filter from local clock + optional windows (extendable).
 * Returns null if windows are not configured.
 */
export function suggestDaypartFromClock(
  config?: DaypartConfig | null,
  now: Date = new Date()
): DaypartFilter | null {
  if (!config?.windows) return null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const parse = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };

  const inWindow = (start: string, end: string): boolean => {
    const s = parse(start);
    const e = parse(end);
    if (s === null || e === null) return false;
    if (s <= e) return minutesNow >= s && minutesNow < e;
    // Overnight window
    return minutesNow >= s || minutesNow < e;
  };

  const order: Exclude<MenuDaypart, 'all_day'>[] = ['breakfast', 'main', 'evening'];
  for (const key of order) {
    const w = config.windows[key];
    if (w && inWindow(w.start, w.end)) return key;
  }
  return null;
}

/** Build chip list for UI: All + supported dayparts */
export function daypartFilterOptions(
  items: MenuItem[],
  config?: DaypartConfig | null
): { id: DaypartFilter; label: string }[] {
  const supported = resolveSupportedDayparts(items, config);
  const opts: { id: DaypartFilter; label: string }[] = [
    { id: 'all', label: daypartLabel('all', config) },
  ];
  for (const d of supported) {
    opts.push({ id: d, label: daypartLabel(d, config) });
  }
  return opts;
}

export function daypartConfigFromProvider(data: FastFoodProvider): DaypartConfig | undefined {
  return data.daypartConfig;
}
