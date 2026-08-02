# Daypart / breakfast (base implementation)

Optional **service daypart** support for chains that split morning vs all-day menus (e.g. Popeyes breakfast).  
Chains without config (KFC today) are unchanged — no extra UI.

Daypart filters apply to the **already loaded** trusted menu (online download or download cache).  
They do not load a separate breakfast file. See [MENU_LOADING.md](./MENU_LOADING.md).

**Status:** Base implementation shipped (types, `BaseFastFoodProvider` filters, Mode 1/2 chips, Popeyes scaffold).

---

## 1. Model

| Field | Where | Meaning |
|-------|--------|---------|
| `MenuItem.daypart` | each item | `breakfast` \| `main` \| `evening` \| `all_day` |
| `FastFoodProvider.daypartConfig` | menu JSON | Supported chips, labels, optional time windows |
| `ProviderPlugin.daypartConfig` | plugin | Merges **on top of** menu config |

### Item rules

| `daypart` value | Behaviour |
|-----------------|-----------|
| **omit** | Treated as **`main`** (standard catalogue) |
| **`main`** | Daytime / all-day chicken menu |
| **`breakfast`** | Morning-only |
| **`evening`** | Optional late menu |
| **`all_day`** | Shown under **every** concrete filter (shared drinks, dips, etc.) |

### Filter matching

```
filter === 'all'        → all items
filter === 'breakfast'  → breakfast + all_day
filter === 'main'       → main + all_day
```

---

## 2. Provider API

```ts
provider.getItems(tierId, { daypart: 'breakfast' })
provider.getCombos(tierId, { daypart: 'main' })
provider.getAlaCarteItems(tierId, { daypart: 'all' })

provider.supportsDaypartFiltering()  // show chips?
provider.getDaypartFilterOptions()
provider.getDefaultDaypartFilter()
provider.suggestDaypartNow()         // if windows configured
provider.getDaypartConfig()
provider.setDaypartConfig(cfg)       // used by registry from plugin
```

**Engines** (auditor / optimizer) call `getItems(tier)` **without** daypart so combo component resolution still sees the full catalogue. Listing UIs pass a filter.

---

## 3. Plugin usage

### Enable for a chain (scaffold, even before breakfast items exist)

```ts
// index.ts
export const plugin: ProviderPlugin = {
  id: 'popeyes_uk',
  // ...
  daypartConfig: {
    supported: ['breakfast', 'main'],
    defaultFilter: 'main',
    labels: { breakfast: 'Breakfast', main: 'All day', all: 'Full menu' },
    windows: {
      breakfast: { start: '06:00', end: '11:00' },
      main: { start: '11:00', end: '23:59' },
    },
    timezone: 'Europe/London',
  },
};
```

Same object may live on `defaultData.daypartConfig` so exported `/menus/*.json` carries it.

### Add a breakfast item later

```ts
{
  id: 'cajun_biscuit',
  name: 'Cajun Chicken Biscuit',
  category: 'burgers',
  daypart: 'breakfast',
  price: 4.49,
  atomicUnits: { breakfast_biscuit: 1 },
}
```

Shared drink:

```ts
{
  id: 'drink_pepsi_max_reg',
  daypart: 'all_day', // visible in Breakfast and All day filters
  // ...
}
```

KFC / single-menu chains: **omit** `daypart` and `daypartConfig` entirely.

---

## 4. UI

`DaypartFilterBar` appears in Mode 1 & Mode 2 only when `supportsDaypartFiltering()` is true.

Popeyes is pre-wired with breakfast + main chips; until items use `daypart: 'breakfast'`, the Breakfast filter only shows `all_day` rows (often empty).

---

## 5. Files

| Path | Role |
|------|------|
| `src/core/types/provider.ts` | `MenuDaypart`, `DaypartConfig`, `MenuQueryOptions` |
| `src/core/utils/daypart.ts` | Match / discover / labels / clock suggest |
| `src/core/providers/baseProvider.ts` | Filtered getters + helpers |
| `src/core/providers/plugin.ts` | `daypartConfig` on plugin |
| `src/core/providers/popeyes-uk/index.ts` | Example: `daypartConfig` on brand; daypart tags come from the live adapter |
| `src/components/DaypartFilterBar.tsx` | Chips in Mode 1 & Mode 2 |
| `docs/MENU_LOADING.md` | When menu data is loaded (online-first) |

---

## 6. Non-goals (this base)

- Per-store breakfast availability  
- Separate breakfast JSON files  
- Forcing optimizer to refuse cross-daypart baskets (wishlist is user-driven)  
- Auto-switching filter from clock in UI (API exists: `suggestDaypartNow`)  

Extend later without changing the item tag model.
