# Menu categories

How ComboWise groups food items for Mode 2 filters, basket grouping, and (optionally) vouchers.

Related: [MENU_LOADING.md](./MENU_LOADING.md) · [PROVIDER_PLUGIN_GUIDE.md](./PROVIDER_PLUGIN_GUIDE.md) · normalizers (`mapCategory`).

---

## 1. Two layers

| Layer | Purpose |
|-------|---------|
| **Item `category`** | String on each menu item (from live adapter). Used by engines loosely; UI tabs derive from it. |
| **Mode 2 pills** | **Dynamic** from the **loaded** ala-carte menu — only categories that have items. |

Unknown / provider-specific ids still get a tab so you can see what’s missing from the known set.

---

## 2. Known shared categories

Type: `KnownMenuItemCategory` in `src/core/types/provider.ts`.

| Id | Typical use |
|----|-------------|
| `burgers` | Burgers, wraps, sandwiches |
| `chicken` | Pieces, wings, tenders, nuggets |
| `meals` | Standard meals / bowls as mains |
| `box_meals` | Loaded box deals (often combos) |
| `buckets` | Sharing packs |
| `kids` | Kids meals |
| `sides` | Fries, gravy, rice, mac |
| `drinks` | Soft drinks, shakes, pints if not split |
| `desserts` | Sweets |
| `dips` | Sauces / dips |

`MenuItemCategory` = known id **or** any other string (e.g. `bowls`, `noodles`, `alcohol`).

---

## 3. Mapping new foods (gravy, rice bowl, noodles, pints)

**Prefer mapping into a known bucket** unless you need a separate tab forever:

| Product | Suggested `category` |
|---------|----------------------|
| Gravy | `sides` (or `dips` if tiny add-on) |
| Rice bowl | `meals` if a main plate |
| Noodles | `meals` or free-form `noodles` |
| Pints / beer | `drinks` or free-form `alcohol` |

On each menu item (live payload):

```json
{
  "id": "gravy_reg",
  "name": "Regular Gravy",
  "category": "sides",
  "price": 1.49,
  "atomicUnits": { "gravy_reg": 1 }
}
```

Or use a free-form id — Mode 2 will still show a pill:

```json
{ "category": "rice_bowls", "name": "Cajun Rice Bowl", ... }
```

→ pill **📁 Rice Bowls** with a **new** badge (unknown / not in known list).

---

## 4. Dynamic Mode 2 pills

Built by `buildCategoryTabsFromItems()` in `src/core/utils/menuCategories.ts`:

1. Scan loaded ala-carte items (after daypart filter).  
2. Unique `item.category` values → tabs.  
3. Known ids → fixed label + emoji.  
4. Unknown ids → humanized label (`rice_bowls` → “Rice Bowls”) + 📁 + **new** badge.  
5. Sort: known order first, then A–Z unknowns.

Empty menu / no store → no pills (“load a store menu first”).

---

## 5. Optimizer / auditor

Engines care more about **`price`**, **`isCombo`**, **`atomicUnits`**, **`equivalentAlaCarteIds`** than about category name.

Category is used for:

- Mode 2 tabs & basket grouping  
- Optional voucher `applicableCategory`  
- Loose UI filters for suggestions  

---

## 6. Normalizer extension

Loose remote payloads without a clean `category` use `BaseMenuNormalizer.mapCategory()`.  
Override per provider if needed; prefer setting `category` in the live adapter.

```ts
protected mapCategory(raw: string) {
  if (raw.toLowerCase().includes('pint')) return 'drinks';
  return super.mapCategory(raw);
}
```

---

## 7. When to extend `KnownMenuItemCategory`

Add a known id when:

- Several chains use it, or  
- You want a stable label/icon without the **new** badge  

Otherwise free-form string categories are fine and stay visible in Mode 2.
