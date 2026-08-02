# Menu & store loading (live proxy)

ComboWise runs on **client hosting** (e.g. Cloudflare Pages).  
**Catalogue and store directories are not embedded in the JS bundle.**

| Source | Role |
|--------|------|
| `GET /api/live/{provider}/menu?storeId=` | Live menu proxy (Pages Function → brand upstream) |
| `GET /api/live/{provider}/stores` | Live store directory proxy |

Plugins only declare **brand chrome + endpoints**. See [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md).

---

## 1. Concept

| In the JS bundle | Via live proxy |
|------------------|----------------|
| Chain id, name, logo, accent | Full menu items |
| Endpoint paths (`menuEndpoint` / `storesEndpoint`) | Full store list |
| Optional default tier ids | Per-store prices |

**No offline hardcoded catalogue.** Failed fetch → empty UI + error/Retry, not demo prices.

---

## 2. End-to-end flow

```
Choose restaurant
        │
        ▼
  GET /api/live/{provider}/stores  → cache
        │
        ▼
  fetchOn === 'store'?
    │ yes                                    │ no (provider)
    ▼                                        ▼
  Pick shop (id = KFC refid)           GET /api/live/{provider}/menu
    │
    ▼
  GET /api/live/{provider}/menu?storeId={refid}
        │
        ▼
  Cache key: providerId::storeId  (per-shop prices)
        │
        ▼
  Mode 1 / Mode 2 (tier from selected store)
```

- **Store-gated** (`fetchOn: 'store'`, e.g. KFC UK ClickAndCollect): no shop ⇒ **no menu items**. Menu is the same pipeline as  
  `kfc.co.uk/order-online/choose-your-food?refid=…&modeType=ClickAndCollect`.  
- **Provider-gated** (`fetchOn: 'provider'`): menu loads when the chain opens; shop optional for tier.  

---

## 3. Plugin shape (no data.ts / stores.ts)

```ts
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

const BRAND = createBrandShell({
  id: 'kfc_uk',
  name: 'KFC UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#e4002b',
  logoText: 'KFC',
  locationTiers: [ /* optional defaults; menu JSON can override */ ],
});

export const plugin: ProviderPlugin = {
  id: 'kfc_uk',
  provider: new KfcUkProvider(),
  defaultData: BRAND,                 // items: [] always
  syncEndpoint: menuEndpoint('kfc_uk'),
  storesEndpoint: storesEndpoint('kfc_uk'),
  menuStrategy: { fetchOn: 'store' },
  normalizer: createPassthroughNormalizer(BRAND),
};
```

---

## 4. Data quality

| Fact | Implication |
|------|-------------|
| Live upstreams are unofficial | Treat prices as indicative |
| Real app often has **size variants** | Adapter should expose each sellable line |
| Prices **vary by store** | Always load menu with a real `storeId` |

If an item looks wrong or missing: fix the **live adapter** (`functions/adapters/…`), then Clear local menu cache (or hard refresh) so the client re-downloads.

After a menu change, users with a **fresh 24h cache** still see old data until TTL expires, **Sync**, or **Clear**.

---

## 5. Cache keys

| Key | Content |
|-----|---------|
| `ff_calc_provider_<id>` | Downloaded menu |
| `ff_calc_menu_meta_<id>` | Menu meta (`source: network\|cache`) |
| `ff_calc_stores_<id>` | Downloaded store list |
| `ff_calc_selected_store_<id>` | Chosen shop |

**Clear** drops menu cache, store list cache, and selection.  
In-flight fetches are invalidated (generation counter).

---

## 6. Failures

| Case | UI |
|------|-----|
| No store (store-gated) | Empty menu + “Select a store…” |
| Network fail + prior download | Degraded + Retry (trusted cache only) |
| Network fail + no cache | Empty + error + Retry |
| Bad JSON | Empty + error |

Never inject bundled demo items/stores.

---

## 7. Related

- [PROVIDER_PLUGIN_GUIDE.md](./PROVIDER_PLUGIN_GUIDE.md)  
- [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md)  
- [DAYPART.md](./DAYPART.md)  
