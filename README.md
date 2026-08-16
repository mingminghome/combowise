# ComboWise

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Fast-food **value calculator** for UK chains (KFC, Popeyes, Burger King): audit a box meal, optimise a basket, and compare PPI — using **live store menus**, not a bundled catalogue.

**License:** [MIT](./LICENSE)

```
Browser  →  Pages (SPA)
         →  /api/live/{provider}/{menu|stores}  →  brand ordering APIs
```

---

## Live demo

**Try it:** [https://combowise.pages.dev](https://combowise.pages.dev)

Useful for:

| Mode | What you get |
|------|----------------|
| **Combo Auditor** | Pick a shop → load live menu → check if a box/meal is good value vs a-la-carte |
| **Basket Optimiser** | Build a list → upgrades, alternatives, price diffs |
| **Store search** | Postcode / place search → real `refid` / slug for that location’s prices |

Menus stay **out of the JS bundle**. After you choose a store, prices load from the live proxy. Data stays in your browser (localStorage); confirm everything in official restaurant apps before ordering.

Unofficial brand APIs can change — the demo is best-effort and independent of KFC, Popeyes, and Burger King.

---

## Stack

- React + TypeScript + Vite  
- Cloudflare Pages (static `dist/` + `functions/`)  
- Provider **plugins** (brand shell + live endpoints)  
- Client cache (localStorage) with store gate  

---

## Quick start (local)

```bash
cp .env.example .env.local   # set KFC_API_KEY (see below)
npm install
npm run dev
```

`npm run dev` includes a **dev middleware** for `/api/live/*` (same adapters as Pages Functions).

```bash
# A) Live menus/stores via Vite middleware (default)
npm run dev

# B) Production-like Pages + Functions (uses .dev.vars for Function env)
npm run pages:dev
```

### Required: `KFC_API_KEY`

KFC’s ordering API expects an `x-api-key` header. **No key is committed** to this repo.

1. Open [kfc.co.uk order online](https://www.kfc.co.uk/order-online/choose-your-food)  
2. DevTools → **Network** → any `kfcapi.com` request  
3. Copy request header **`x-api-key`**  
4. Set `KFC_API_KEY=…` in `.env.local` (Vite middleware) and/or `.dev.vars` / Cloudflare Function env  

Popeyes UK does not need a separate secret for the current adapter.

If search shows no stores, click **Retry load stores** or **Clear** local data (stale empty cache), then search again.

---

## Add a restaurant plugin

Chains are **plugins**: a thin brand folder + optional live adapter. Engines never import a specific chain.

| Piece | Path |
|-------|------|
| Client plugin | `src/core/providers/<slug>/index.ts` |
| Contract | `src/core/providers/plugin.ts` |
| Discovery | `import.meta.glob` in `providerRegistry.ts` (no registry edit) |
| Live proxy | `functions/adapters/<brand>.ts` + route in `functions/api/live/…` |
| Full guide | [docs/PROVIDER_PLUGIN_GUIDE.md](./docs/PROVIDER_PLUGIN_GUIDE.md) |

### 1. Client plugin (required)

Create `src/core/providers/example_uk/index.ts`:

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
  // optional: unitLabels, daypart rules — see PROVIDER_PLUGIN_GUIDE.md
});

export const plugin: ProviderPlugin = {
  id: BRAND.id,
  brand: BRAND,
  liveEndpoints: {
    menu: menuEndpoint('example_uk'),
    stores: storesEndpoint('example_uk'),
  },
  createProvider: () =>
    new BaseFastFoodProvider(BRAND, createPassthroughNormalizer()),
};

export default plugin;
```

Reload the app — console should list `example_uk` under loaded providers. **Do not** edit `providerRegistry.ts`.

### 2. Live adapter (for real prices)

1. Add `functions/adapters/example-uk.ts` that returns ComboWise-shaped menu/stores JSON (reuse `menu-pipeline` + brand rules where possible).  
2. Wire the provider id in `functions/api/live/[provider]/[resource].ts` (and `vite.live-api.ts` for local dev).  
3. Prefer **passthrough** normalizer on the client if the Function already normalizes.

Reference implementations: `kfc-uk`, `popeyes-uk` under `src/core/providers/` and `functions/adapters/`.

### 3. Checklist

- [ ] Unique `plugin.id` (e.g. `brand_uk`)  
- [ ] `export const plugin` (or `export default plugin`)  
- [ ] Live menu + stores work for at least one real store id  
- [ ] Categories / daypart sensible for the brand  
- [ ] No secrets in source — use env (like `KFC_API_KEY`)  

Deep dive: **[docs/PROVIDER_PLUGIN_GUIDE.md](./docs/PROVIDER_PLUGIN_GUIDE.md)** · live sources: **[docs/LIVE_MENU_SOURCES.md](./docs/LIVE_MENU_SOURCES.md)**

---

## Env

See **[`.env.example`](./.env.example)**. Never commit `.env`, `.env.local`, or `.dev.vars`.

| Variable | Purpose |
|----------|---------|
| `KFC_API_KEY` | **Required** for KFC live menu/stores |
| `VITE_LIVE_API_BASE` | Default `/api/live` |
| `VITE_GTM_ID` | Optional analytics (never hardcoded) |
| `VITE_GOOGLE_SITE_VERIFICATION` | Optional Search Console meta (never hardcoded) |
| `VITE_BUY_ME_A_PINT_URL` | Optional “Buy me a pint” link (never hardcoded; empty hides UI) |
| `VITE_BUY_ME_A_PINT_IMG` | Optional custom BMC button image |
| `KFC_*` / `POPEYES_*` | Optional host overrides (see docs) |

---

## Docs

| Doc | Topic |
|-----|--------|
| [docs/PROVIDER_PLUGIN_GUIDE.md](./docs/PROVIDER_PLUGIN_GUIDE.md) | Add a chain (full) |
| [docs/LIVE_MENU_SOURCES.md](./docs/LIVE_MENU_SOURCES.md) | Live proxy & KFC ClickAndCollect |
| [docs/MENU_LOADING.md](./docs/MENU_LOADING.md) | Cache, store gate |
| [docs/MENU_CATEGORIES.md](./docs/MENU_CATEGORIES.md) | Categories |
| [docs/DAYPART.md](./docs/DAYPART.md) | Breakfast / daypart |
| [docs/UI_DESIGN_GUIDELINES.md](./docs/UI_DESIGN_GUIDELINES.md) | UI |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Self-host / Cloudflare deploy notes |

---

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Vite dev server + `/api/live` middleware |
| `npm run build` | Typecheck + Vite production build |
| `npm run preview` | Preview `dist/` only (no Functions) |
| `npm run pages:dev` | Build + Wrangler Pages (SPA + Functions) |
| `npm run lint` | Oxlint |

---

## Notes

- **KFC UK** — live adapter (order-online ClickAndCollect); needs `KFC_API_KEY`.  
- **Popeyes UK** — live adapter (popeyesuk.com Collection menus).  
- **Burger King UK** — live adapter (RBI GraphQL stores + Sanity catalogue + store PLU prices).  
- Unofficial brand APIs can change; treat as best-effort.  
- Independent tool: confirm prices in official restaurant apps before ordering.  
