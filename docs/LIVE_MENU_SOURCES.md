# Live menu sources (no demo snapshot)

ComboWise is designed to **not** ship a demo catalogue in the client.  
Menus and stores come from a **live upstream**, proxied by the host (Cloudflare Pages Function).

---

## 1. Why not call brand sites from the browser?

| Blocker | Detail |
|---------|--------|
| **CORS** | Order APIs are not open to third-party SPA origins |
| **Auth headers** | Some feeds expect SPA-like headers / keys |
| **Stability / ToS** | Unofficial APIs can change; treat as best-effort |

So: **client → `/api/live/...` proxy → brand order APIs**.

---

## 2. KFC UK = order-online pickup

```
https://www.kfc.co.uk/order-online/choose-your-food?refid={refid}&modeType=ClickAndCollect
```

| Query | Meaning |
|-------|---------|
| `refid` | Restaurant id (`storeId`) |
| `modeType=ClickAndCollect` | Pickup channel |

**Upstream**

1. Meta: `prod.kfcapi.com/api/v3/restaurants/{refid}/menu?modeType=ClickAndCollect&serviceType=collection`  
2. Body: `menuoutput.prod.platform.kfcapi.com/{refid}-ClickAndCollect.json`  
3. Stores: `prod.kfcapi.com/api/v3/restaurants/all`

**Client**

- `GET /api/live/kfc_uk/stores`  
- `GET /api/live/kfc_uk/menu?storeId={refid}`  

---

## 3. Popeyes UK = collection order SPA

Brand site: [popeyesuk.com](https://popeyesuk.com) (Angular SPA).

**Upstream** (Azure Front Door — same `APP_API_URL` as the SPA)

Base: `https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net`  
(override with `POPEYES_API_BASE`)

1. Stores: `GET /api/v2/restaurants`  
2. Shop detail: `GET /api/v2/restaurants/{slug|uuid}` → pick `menus[]` where `orderingFlow === "Collection"`  
3. Menu: `GET /en/restaurants/{ref}/menus/{menuId}`  
   (e.g. menuId `Order Lunch.` / `Order Lunch` / `Order Now.`)

**Client**

- `GET /api/live/popeyes_uk/stores` — store `id` = **slug** (e.g. `plymouth`)  
- `GET /api/live/popeyes_uk/menu?storeId={slug}`  

Live only — no static menu/store JSON in the repo.

---

## 3b. McDonald’s / Burger King / Tim Hortons UK

These three are **not store-gated**. Opening the chain loads the menu; the store picker is optional. If the official directory is empty or times out, the app skips store pick and still opens Mode 1 / Mode 2.

| Chain | Stores (optional) | Menu |
|-------|-------------------|------|
| McDonald’s UK | OSM Overpass, then official `googleappsv2/geolocation` | Official restaurant JSON when a shop id is known; empty catalogue if the host is blocked |
| Burger King UK | Nearby RBI `GetRestaurants` (postcode / GPS or a few UK hubs) | Official Sanity `prod_bk_gb` + gateway `plusData` (default shop `33001` when none picked) |
| Tim Hortons UK | Official `timhortons.co.uk/find-a-tims` HTML | Official `/menu` page when it publishes £ prices |

**Client**

- `GET /api/live/{provider}/menu` — no `storeId` required
- `GET /api/live/{provider}/stores?q=WA15` — optional nearby list
- `GET /api/live/{provider}/stores?lat=&lng=` — GPS

---

## 4. Architecture

```
Browser (ComboWise)
    │
    │  GET /api/live/{provider}/menu?storeId=…
    │  GET /api/live/{provider}/stores?q=
    ▼
Cloudflare Pages Function  (thin router)
    functions/api/live/[provider]/[resource].ts
    │
    ├─ functions/adapters/kfc-uk.ts
    ├─ functions/adapters/popeyes-uk.ts
    ├─ functions/adapters/mcdonalds-uk.ts
    ├─ functions/adapters/burger-king-uk.ts
    └─ functions/adapters/tim-hortons-uk.ts
    │
    │  OR env *_UPSTREAM override
    ▼
Normalized FastFoodProvider JSON  /  { stores: StoreLocation[] }
```

**Client plugins** (`src/core/providers/<slug>/`) declare brand + `unitLabels` + endpoints.  
**Server adapters** (`functions/adapters/`) own upstream URLs and normalize.  
Do not put every chain’s fetch logic in the router file.

---

## 5. Client path

| Step | Behaviour |
|------|-----------|
| Open chain | KFC / Popeyes: brand shell until a shop is picked. McD / BK / TH: fetch menu immediately (store optional). |
| Load stores | `GET /api/live/{provider}/stores` (optional for McD / BK / TH) |
| Select shop | `GET /api/live/{provider}/menu?storeId=` when a shop is chosen |
| Cache | Per `providerId` or `providerId::storeId` (TTL); Clear wipes all slots |

```ts
menuEndpoint('popeyes_uk')   // → /api/live/popeyes_uk/menu
storesEndpoint('popeyes_uk') // → /api/live/popeyes_uk/stores
```

---

## 6. Configure (Pages)

### Built-in (default)

| Chain | Env required? |
|-------|----------------|
| KFC UK | **Yes — `KFC_API_KEY`** (not committed; copy `x-api-key` from kfc.co.uk DevTools) |
| Popeyes UK | No (public ordering API) |
| McDonald’s UK | No (official locator + restaurant JSON; store optional) |
| Burger King UK | No (nearby RBI GraphQL + Sanity PLU; store optional) |
| Tim Hortons UK | No (official locator HTML + marketing menu; store optional) |

Optional:

| Variable | Purpose |
|----------|---------|
| `KFC_API_KEY` | Required for KFC ClickAndCollect API |
| `KFC_API_BASE` / `KFC_MENU_OUTPUT_BASE` | KFC host overrides |
| `POPEYES_API_BASE` | Popeyes ordering API host |
| `KFC_MENU_UPSTREAM` / `KFC_STORES_UPSTREAM` | Bypass KFC adapter |
| `POPEYES_MENU_UPSTREAM` / `POPEYES_STORES_UPSTREAM` | Bypass Popeyes adapter (`{storeId}` ok) |
| `MCD_*` / `BK_*` / `TH_*` `_UPSTREAM` | Optional host overrides for the three new chains |

---

## 7. Local development & free production

**Production:** GitHub → **Cloudflare Pages Free** — [DEPLOY.md](./DEPLOY.md).

**Local live proxy**

```bash
# Vite dev middleware for /api/live/* (default)
npm run dev

# Or production-like Pages + Functions
npm run pages:dev
```

---

## 8. Production checklist

- [ ] Pages Function deployed (`functions/api/live/...`)
- [ ] Smoke: `/api/live/kfc_uk/stores` and `/api/live/popeyes_uk/stores`  
- [ ] Smoke: `/api/live/burger_king_uk/menu` (no storeId) and `/api/live/burger_king_uk/stores?q=WA15`  
- [ ] Smoke: menu with a real `storeId` / slug for store-gated chains  

---

## 9. Related

- [DEPLOY.md](./DEPLOY.md)  
- [MENU_LOADING.md](./MENU_LOADING.md)  
- [MENU_CATEGORIES.md](./MENU_CATEGORIES.md)  
