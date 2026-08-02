# ComboWise

Fast-food value calculator for UK chains (KFC, Popeyes).  
**Production path:** static SPA + **Cloudflare Pages Function** live menu proxy (Free Tier).

**License:** [MIT](./LICENSE)

```
Browser  →  Pages (SPA)
         →  /api/live/kfc_uk/{menu|stores}  →  KFC ClickAndCollect APIs
```

Menus are **not** bundled in the JS client. After you pick a shop (`refid`), prices load from the live proxy.

---

## Stack

- React + TypeScript + Vite  
- Cloudflare Pages (static `dist/` + `functions/`)  
- Client cache (localStorage) with store gate  

---

## Quick start (local UI)

```bash
cp .env.example .env.local   # set KFC_API_KEY (see below)
npm install
npm run dev
```

`npm run dev` includes a **dev middleware** for `/api/live/*` (same KFC/Popeyes upstreams as Pages Functions).

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
4. Set `KFC_API_KEY=…` in `.env.local` (Vite middleware) and/or `.dev.vars` / Cloudflare Pages Function env  

Popeyes UK does not need a separate secret for the current adapter.

If search shows no stores, click **Retry load stores** or **Clear** local data (stale empty cache), then search again.

---

## Deploy free: GitHub → Cloudflare Pages

1. **Fork / clone** this repo  
2. Cloudflare → **Workers & Pages** → **Create** → connect the repo (or use Actions + Direct Upload)  
3. Build settings:

   | Field | Value |
   |-------|--------|
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node | `20` (`NODE_VERSION=20` if needed) |

4. Set Function env **`KFC_API_KEY`** (Production + Preview)  
5. Optional build env: `VITE_GTM_ID`  

Full checklist: **[docs/DEPLOY.md](./docs/DEPLOY.md)**

Smoke test after deploy:

```text
GET https://YOUR_PROJECT.pages.dev/api/live/kfc_uk/stores
GET https://YOUR_PROJECT.pages.dev/api/live/kfc_uk/menu?storeId=YOUR_REFID
```

---

## Env

See **[`.env.example`](./.env.example)**. Never commit `.env`, `.env.local`, or `.dev.vars`.

| Variable | Purpose |
|----------|---------|
| `KFC_API_KEY` | **Required** for KFC live menu/stores |
| `VITE_LIVE_API_BASE` | Default `/api/live` |
| `VITE_GTM_ID` | Optional analytics |
| `KFC_*` / `POPEYES_*` | Optional host overrides (see docs) |

GitHub Actions deploy needs repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (not stored in git).

---

## Docs

| Doc | Topic |
|-----|--------|
| [docs/DEPLOY.md](./docs/DEPLOY.md) | GitHub + Cloudflare Free |
| [docs/LIVE_MENU_SOURCES.md](./docs/LIVE_MENU_SOURCES.md) | Live proxy & KFC ClickAndCollect |
| [docs/MENU_LOADING.md](./docs/MENU_LOADING.md) | Cache, store gate |
| [docs/PROVIDER_PLUGIN_GUIDE.md](./docs/PROVIDER_PLUGIN_GUIDE.md) | Add a chain |
| [docs/MENU_CATEGORIES.md](./docs/MENU_CATEGORIES.md) | Categories |
| [docs/DAYPART.md](./docs/DAYPART.md) | Breakfast / daypart |
| [docs/UI_DESIGN_GUIDELINES.md](./docs/UI_DESIGN_GUIDELINES.md) | UI |

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
- Unofficial brand APIs can change; treat as best-effort.  
- Independent tool: confirm prices in official restaurant apps before ordering.  

