# Provider Plugin Design Guide

This document describes how ComboWise loads restaurant chains as **plugins**: thin folders that declare **brand chrome + live endpoints** (and optional brand labels / normalizers). Catalogues are **not** embedded in the client.

**Reference plugins:** `src/core/providers/kfc-uk/`, `src/core/providers/popeyes-uk/`  
**Contract:** `src/core/providers/plugin.ts`  
**Discovery:** `src/core/providers/providerRegistry.ts`  
**Loading:** [MENU_LOADING.md](./MENU_LOADING.md) · **Live sources:** [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md) · **Dayparts:** [DAYPART.md](./DAYPART.md)

---

## 1. Goals

| Goal | How |
|------|-----|
| Add a chain without editing engines | Plugins + shared types |
| Zero registry boilerplate | `import.meta.glob` discovery |
| Live / hosted data only | `/api/live/{id}/{menu\|stores}` (or static JSON in dev) |
| No offline hardcoded catalogue | Brand shell only in JS; fail → empty + Retry |
| Brand product language stays on the plugin | `unitLabels` + brand normalizers — **not** in optimizer / base util |
| Optional dayparts | [DAYPART.md](./DAYPART.md) |
| Brand-safe UI chrome | `accentColor` on avatar only |

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  providers/<slug>/index.ts                                  │
│    brand shell (unitLabels, daypart) + liveEndpoints + plugin│
└────────────────────────────┬────────────────────────────────┘
                             │ import.meta.glob
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ProviderRegistry                                           │
│    ├─ UI provider list                                      │
│    ├─ MenuSyncService   → GET /api/live/…/menu?storeId=     │
│    └─ StoreSearchService → GET /api/live/…/stores           │
└────────────────────────────┬────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ProviderSelector    Mode1 Auditor      Mode2 Optimizer
        (engines use unit *keys* only; labels from provider)
```

**Pages Function** (`functions/api/live/…`) normalizes brand APIs → `FastFoodProvider` JSON.  
**Client normalizer** is usually passthrough (payload already ComboWise-shaped).

### Live menu standardization (shared pipeline)

POS menus often mix sellable products, builder slots, and noisy **name / description / posName** fields. Adapters should **not** each invent a one-off mega-regex.

| Piece | Path |
|-------|------|
| Shared orchestrator + FieldBlob fuzzy match | `functions/adapters/menu-pipeline/` |
| KFC rules (junk, promote, known meals, units) | `functions/adapters/kfc-menu-pipeline.ts` → `kfcMenuRules` |
| Popeyes rules (example / optional) | `functions/adapters/popeyes-menu-rules.ts` → `popeyesMenuRules` |

```ts
import { runMenuPipeline } from './menu-pipeline';
import { kfcMenuRules } from './kfc-menu-pipeline';

const result = runMenuPipeline(
  { name, description, posName, catLabel, price },
  kfcMenuRules
);
// result.action === 'keep' | 'drop'
```

**Levels (fixed):** FieldBlob → junk → role (sellable / slot / promote) → display → category → atomic units → isCombo.  
**Brand-owned:** phrase lists, known meal builds, category map — not the fuzzy tokenizer.

**Important:** Engines never import a specific chain — only `BaseFastFoodProvider`.

---

## 3. Discovery rules

At module load time the registry runs:

```ts
import.meta.glob('./*/index.ts', { eager: true })
```

| Rule | Detail |
|------|--------|
| **Path** | `src/core/providers/<slug>/index.ts` |
| **Required export** | `export const plugin: ProviderPlugin` **or** `export default plugin` |
| **Skip** | Folders whose `index.ts` has no valid `plugin` / default |
| **Id uniqueness** | Duplicate `plugin.id` overwrites with a console warning |
| **No edit needed** | Do **not** add imports to `providerRegistry.ts` for new chains |

Console (dev):  
`[ProviderRegistry] Loaded N provider(s): kfc_uk, popeyes_uk, …`

---

## 4. Plugin contract (`ProviderPlugin`)

```ts
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';
import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';

const BRAND = createBrandShell({
  id: 'example_uk',
  name: 'Example UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#333333',
  logoText: 'EX',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
  ],
  // Brand SKU display names (optional — see §7)
  unitLabels: {
    signature_burger: 'Signature Burger',
  },
  unitPpiLabels: {
    signature_burger: 'burger',
  },
});

export class ExampleUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(BRAND);
  }
}

export const plugin: ProviderPlugin = {
  id: 'example_uk',
  provider: new ExampleUkProvider(),
  defaultData: BRAND, // items: [] only
  syncEndpoint: menuEndpoint('example_uk'),     // → /api/live/example_uk/menu
  storesEndpoint: storesEndpoint('example_uk'), // → /api/live/example_uk/stores
  menuStrategy: { fetchOn: 'store' },
  normalizer: createPassthroughNormalizer(BRAND),
};
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable slug (`kfc_uk`, `popeyes_uk`, …) |
| `provider` | Yes | `BaseFastFoodProvider` instance |
| `defaultData` | Yes | Brand shell via `createBrandShell` — **no catalogue items** |
| `syncEndpoint` | Yes* | Live menu URL (`menuEndpoint(id)` → `/api/live/…/menu`) |
| `storesEndpoint` | Yes* | Live stores URL (`storesEndpoint(id)` → `/api/live/…/stores`) |
| `menuStrategy` | No | `fetchOn: 'store' \| 'provider'` (default provider) |
| `daypartConfig` | No | [DAYPART.md](./DAYPART.md) |
| `normalizer` | No | Defaults to passthrough; empty on bad payload |

\*Required for production chains.

Validation (`extractPlugin`): rejects modules missing `id`, `provider`, or `defaultData`.

---

## 5. Recommended folder layout

```
src/core/providers/
  brandShell.ts / plugin.ts / baseProvider.ts / providerRegistry.ts
  kfc-uk/index.ts              # brand + unitLabels + live endpoints
  popeyes-uk/index.ts
  <slug>/index.ts              # NEW CHAIN: client plugin only

src/core/normalizers/
  baseNormalizer.ts            # generic QSR only (no brand SKUs)
  passthroughNormalizer.ts     # live ComboWise JSON
  kfcLiveNormalizer.ts         # optional client-side raw payload helpers
  popeyesLiveNormalizer.ts

src/core/utils/
  unitLabels.ts                # GENERIC unit keys only (hot_wing, drink_reg, …)
  ppi.ts                       # format only; labels from provider

functions/
  adapters/
    shared.ts                  # cors, parsePrice, LiveEnv, proxyUpstream
    kfc-uk.ts                  # KFC ClickAndCollect fetch + normalize
    popeyes-uk.ts              # Popeyes Collection fetch + normalize
    <providerId>.ts            # NEW CHAIN: server live adapter
  api/live/[provider]/[resource].ts   # thin router only
```

### Adding a provider (checklist)

| Piece | Where |
|-------|--------|
| Brand shell + `unitLabels` | `src/core/providers/<slug>/index.ts` |
| Client endpoints | `menuEndpoint(id)` / `storesEndpoint(id)` |
| Live fetch + normalize | `functions/adapters/<providerId>.ts` |
| Wire router | 2–4 lines in `functions/api/live/.../[resource].ts` |

---

## 6. Step-by-step: add a new provider

1. **Plugin** — `src/core/providers/<slug>/index.ts` with `createBrandShell` + `menuEndpoint` / `storesEndpoint`.  
2. **Live adapter** — add `functions/adapters/<providerId>.ts` exporting `fetch…Menu` / `fetch…Stores`, then register in the thin router `functions/api/live/[provider]/[resource].ts`. Or set `*_UPSTREAM` env. See [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md).  
3. **Brand units** — add `unitLabels` / `unitPpiLabels` on the brand shell (provider-specific, like items live on the chain).  
4. **Normalizer (optional)** — client-side only if needed; keep **brand words out of** `BaseMenuNormalizer`.  
5. **Dev** — `npm run dev` (Vite middleware) or deploy Pages Free.  
6. **Do not** embed menu items or store lists in TypeScript; **do not** put brand adapters only inside a 1000-line `[resource].ts`.

---

## 7. Atomic units & labels (important)

Yes — **brand unit labels are provider-specified**, same idea as not shipping catalogue items in shared engines.

Engines and PPI work on **unit keys**. Display names come from the **plugin brand shell** (and optionally from live menu JSON).

| Layer | Responsibility |
|-------|----------------|
| Menu item `atomicUnits` | Data on each item from live adapter (like `items[]`) |
| `src/core/utils/unitLabels.ts` | **Generic** keys only (`hot_wing`, `drink_reg`, `fries_reg`, …) |
| Brand shell `unitLabels` | **Provider-specific** long names: `zinger_burger`, `chicken_sandwich`, … |
| Brand shell `unitPpiLabels` | **Provider-specific** short PPI words: `burger`, `tender`, … |
| Live menu JSON (optional) | May override labels if returned on `FastFoodProvider` |
| `BaseFastFoodProvider` | Merges brand + menu: `getUnitDisplayName` / `getUnitPpiLabel` |
| Engines | Keys only — never hardcode “Zinger” / “Superstack” |

Do **not** grow a mega-map of every chain’s products in `unitLabels.ts` or `optimizer.ts`.

### Brand shell example (KFC)

```ts
unitLabels: {
  chicken_piece: 'Original Recipe Chicken Pieces',
  zinger_burger: 'Zinger Burger',
  fillet_burger: 'Fillet Burger',
  // …
},
unitPpiLabels: {
  chicken_piece: 'pc chicken',
  zinger_burger: 'burger',
  // …
},
```

### Generic vs brand

| Put in shared code | Put on the plugin |
|--------------------|-------------------|
| `hot_wing`, `drink_reg`, `drink_bottle_1_5l` | `zinger_burger`, `twister_wrap` |
| Count patterns like `(\d+) wings` | Pepsi / Kwench / Superstack name rules |
| Optimizer pack math by unit key | Demo SKU ids (`hot_wings_6`) — **never** |

Live adapters should set distinct drink units (`drink_reg` vs `drink_bottle_1_5l`) so the optimizer does not swap a bottle for a fountain cup.

---

## 8. Normalizers

| Class | Role |
|-------|------|
| `BaseMenuNormalizer` | Shared category heuristics + **generic** pack extraction |
| `PassthroughNormalizer` | Production path when Function already returns ComboWise JSON |
| `KfcLiveNormalizer` | KFC-only units / categories (client-side raw payloads) |
| `PopeyesLiveNormalizer` | Popeyes-only units / categories |

**Rule:** Do not add chain product names to `BaseMenuNormalizer.extractAtomicUnits`. Override on the brand normalizer (or finish mapping in the Pages Function).

---

## 9. Data model notes (for optimization quality)

Types: `src/core/types/provider.ts`.

### Menu items

| Field | Why it matters |
|-------|----------------|
| `category` | Mode 2 pills + basket grouping — [MENU_CATEGORIES.md](./MENU_CATEGORIES.md) |
| `isCombo` | Mode 1 vs Mode 2; multi-component deals (e.g. Dine For Two) |
| `price` | Base before tier multiplier |
| `description` | Helps live extract (e.g. “2 Zinger Burgers & 4 Hot Wings”) |
| `components` / `equivalentAlaCarteIds` | Combo vs ala-carte audit |
| `atomicUnits` | Optimizer bundling + PPI |

### Location tiers

`BaseFastFoodProvider.getItems(tierId)` multiplies by `locationTiers[].priceMultiplier`.  
Store selection supplies `tierId`.

### Brand colour

| Use | Field |
|-----|--------|
| Avatar / picker logo | `provider.accentColor` |
| App chrome (modes, CTAs) | Global `--primary` — **not** chain red |

---

## 10. What registration wires

When `registerPlugin` runs:

1. **`provider`** → registry map → UI  
2. **`defaultData` + normalizer + `syncEndpoint`** → `MenuSyncService`  
3. **`storesEndpoint`** → `StoreSearchService`  

### Local storage keys (scoped by `id`)

| Key prefix | Content |
|------------|---------|
| `ff_calc_provider_<id>` or `…_<id>::<storeId>` | Downloaded menu |
| `ff_calc_menu_meta_<id>…` | Menu sync meta |
| `ff_calc_stores_<id>` | Store directory |
| `ff_calc_selected_store_<id>` | Chosen store |

**Clear** removes these for the active provider only.

---

## 11. Engines & UI expectations

### Engines stay chain-agnostic

| Module | Role | Provider-specific? |
|--------|------|--------------------|
| `ComboAuditor` | Combo vs ala-carte via `atomicUnits` + multi-unit credit | **No** — only unit keys + name-overlap |
| `BasketOptimizer` | Bundle packing + pack upsize/swap | **No** — discovers pack sizes from menu |
| `UpgradeEngine` | Optional plugin-registered rules | Only if a plugin calls `registerRule` |
| Live adapters | Fetch + normalize + set `atomicUnits` | **Yes** (`functions/adapters/*`) |
| Brand shell | `unitLabels` / daypart | **Yes** (`providers/*/index.ts`) |

Engines use:

- items + `isCombo` + `atomicUnits`
- `provider.getUnitDisplayName(unitKey)` for display  
- **No** hard-coded item ids, brand product names, or fixed pack size lists  

If a chain needs a weird rule, fix **adapter units** first; only then add an `UpgradeEngine` rule in the plugin.

### Where brand logic belongs

```
OK in engines:     unit keys, prices, isCombo, pack discovery from allItems
OK on provider:    unitLabels, daypartConfig, endpoints
OK in adapters:    upstream URLs, category/unit extraction, brand name keywords
NOT in engines:    "Zinger", "Pepsi", hot_wings_6, KFC-only meal ids
```

### UI

- **ProviderSelector** — registered plugins  
- **StoreSearchBar** — store / sync / rewards / clear for `currentProvider.id`  
- **Mode1 / Mode2** — `provider` + `locationTierId`; PPI via `getPPIInfoForProvider` / provider labels  

---

## 12. Imperative / test registration

```ts
providerRegistry.registerPlugin(myPlugin);
// or provider-only (no stores/sync):
providerRegistry.register(new MyProvider());
```

Prefer `registerPlugin` so menu and stores stay consistent.

---

## 13. Checklist before shipping a plugin

- [ ] Folder `src/core/providers/<slug>/` with `export const plugin`  
- [ ] `plugin.id === defaultData.id`  
- [ ] Brand shell has `items: []` and at least `locationTiers` with `standard`  
- [ ] `syncEndpoint` / `storesEndpoint` via `liveEndpoints` (`/api/live/…`)  
- [ ] Live Function (or upstream env) returns ComboWise JSON for this id  
- [ ] Store-gated chains use `menuStrategy: { fetchOn: 'store' }`  
- [ ] Combos set `isCombo: true`; multi-component deals get multi-key `atomicUnits`  
- [ ] Brand SKUs documented in `unitLabels` / `unitPpiLabels`  
- [ ] No brand product names added to `optimizer.ts` or `baseNormalizer.ts`  
- [ ] Drinks: bottles vs fountain use different unit keys when form factor differs  
- [ ] Prices in major currency units (GBP pounds, not pence)  
- [ ] `accentColor` + `logoText` for avatar  
- [ ] Optional `daypartConfig` if breakfast matters  
- [ ] Dev: chain appears under “Loaded N provider(s)”  
- [ ] Mode 1 combos / Mode 2 ala-carte after successful load  

---

## 14. Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Hardcoding KFC/Popeyes in optimizer / auditor | Unit keys + provider labels |
| `UNIT_DISPLAY_NAMES` mega-map in engines | `unitLabels` on brand shell + `unitLabels.ts` generics |
| Zinger / Pepsi rules in `BaseMenuNormalizer` | Brand normalizer / Function adapter |
| Silent offline `defaultData` as live prices | Network + trusted cache only |
| Demo SKU ids in recommendations | Discover packs from current menu `atomicUnits` |
| Treating 1.5L bottle as `drink_reg` | `drink_bottle_1_5l` (or brand-specific key + labels) |
| Editing `providerRegistry` for each chain | Export `plugin` from folder |
| Chain red as global `--primary` | `accentColor` on avatar only |
| Global localStorage without provider id | Always suffix with `providerId` |

---

## 15. Related files

| Path | Role |
|------|------|
| `src/core/providers/plugin.ts` | Contract |
| `src/core/providers/providerRegistry.ts` | Discovery + wiring |
| `src/core/providers/baseProvider.ts` | Menu access + `getUnitDisplayName` / PPI labels |
| `src/core/providers/brandShell.ts` | Brand chrome factory |
| `src/core/providers/kfc-uk/` · `popeyes-uk/` | Reference plugins |
| `src/core/config/liveEndpoints.ts` | Live vs static path helper |
| `src/core/utils/unitLabels.ts` | Generic unit keys + resolve helpers |
| `src/core/utils/ppi.ts` | PPI formatting (provider-aware) |
| `src/core/normalizers/*` | Base + brand + passthrough |
| `src/core/services/menuSyncService.ts` | Online-first menu cache / store gate |
| `src/core/services/storeSearchService.ts` | Stores / search |
| `src/core/engine/optimizer.ts` | Basket optimization (unit-based) |
| `src/core/engine/auditor.ts` | Combo value audit |
| `functions/api/live/…` | Cloudflare Free live proxy adapters |
| `docs/LIVE_MENU_SOURCES.md` | KFC ClickAndCollect + Popeyes Collection |
| `docs/MENU_LOADING.md` | Client cache / shop gate |
| `docs/MENU_CATEGORIES.md` | Categories |
| `docs/DAYPART.md` | Breakfast / daypart |
| `docs/DEPLOY.md` | GitHub → Cloudflare Pages Free |
| `docs/UI_DESIGN_GUIDELINES.md` | Visual / token rules |

---

## 16. Versioning note

Plugin discovery is **build-time** (Vite eager glob). Adding a folder requires a rebuild / HMR cycle; plugins are not loaded from arbitrary runtime URLs in this version.
