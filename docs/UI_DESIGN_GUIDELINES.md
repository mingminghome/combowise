# UI Design Guidelines: ComboWise Executive Intelligence System

This document defines the aesthetic, typographic, color, and structural layout standards for **ComboWise** (Smart Basket Optimiser, with optional Combo Value Auditor). Every component and view must adhere to these guidelines to ensure a high-density, professional, and visually aligned user interface.

**Source of truth for tokens:** `src/index.css` (`:root` and `[data-theme="light"]`). Prefer CSS variables over hardcoded hex/rgba.

---

## 1. Typography & Numerical Precision

We use a combination of **Plus Jakarta Sans**, **Outfit**, and **Tabular Numerals** to achieve geometric clarity, high readability, and financial-grade numeric alignment.

### UI & Body Text
- **Font Family**: `'Plus Jakarta Sans', sans-serif` → `var(--font-family)`
- **Usage**: Navigation, labels, item descriptions, toolbar controls, and structural text.
- **Why**: Crisp readability across high-density lists and micro-badges.

### Section Headings & Branding
- **Font Family**: `'Outfit', sans-serif` → `var(--font-heading)`
- **Usage**: Page titles, modal headers, card titles, category labels, and high-impact metrics.
- **Weight**: 700 / 800 / 900 (Bold / ExtraBold / Black).
- **Letter spacing**: slightly tight (`-0.02em` on headings).

### Numeric & Currency Data (Tabular Numerals)
- **CSS Rule**: `font-variant-numeric: tabular-nums;`
- **Usage**: Prices, total savings, percentages, line item subtotals, and Price Per Item (PPI) metrics.
- **Why**: Tabular numerals keep currency digits and decimals aligned for rapid scanning.
- **Badge numbers** inherit tabular numerals via the shared `.badge` class.

### Executive Control & Button Profile
Primary actions, apply-suggestion controls, and dense toolbar chips:
- **Font Size**: `0.78rem`–`0.85rem` (toolbar / actions)
- **Font Weight**: 700–800
- **Toolbar chips**: fixed footprint — padding `0.4rem 0.75rem`, radius `8px`, `line-height: 1.2`, icon `13px`
- Avoid Bootstrap-style oversized default buttons; keep controls compact and aligned.

---

## 2. Color Palette: Simple & Clean (Brand-Agnostic)

UI chrome is **provider-agnostic**. Restaurant brand color (e.g. KFC red) appears **only** on provider avatars via `provider.accentColor` — never as the global primary.

Prefer a **simple, clean** look: neutral surfaces, one restrained primary, muted semantic status colors. Avoid loud ambient gradients and neon chrome.

### Primary (UI chrome only)

| Token | Dark | Light | Role |
|-------|------|-------|------|
| `--primary` | `#6b7cf0` | `#5b6cf0` | Calm indigo — active modes, primary CTAs |
| `--primary-hover` | `#5a6ae0` | `#4a58e0` | Hover state |
| `--primary-deep` | `#4f5fd4` | `#4553d4` | Gradient end |
| `--primary-gradient` | `linear-gradient(135deg, var(--primary), var(--primary-deep))` | same | Mode bars, logo marks, filled CTAs |
| `--primary-glow` | soft indigo | softer indigo | Light elevation only |
| `--primary-soft` / `--primary-border` | tinted surfaces | tinted surfaces | Selected cards, soft highlights |

**Legacy aliases** (still valid): `--primary-red`, `--primary-red-hover`, `--primary-red-glow` → map to `--primary*`. Prefer the new names in new code.

### Status & Value Indicators (semantic)

| Role | Token | Dark hex | Use for |
|------|--------|----------|---------|
| **Savings / positive** | `--accent-green` | `#2bbf9a` muted mint | Savings amounts, “worth it”, applied success, sync OK |
| **Suggestion / upgrade** | `--accent-amber` | `#d4a017` muted gold | Smart tips, upsells, “try this”, suggestion cards |
| **Alert / overpriced** | `--accent-danger` | `#e85a6b` soft rose | Overpriced verdicts, destructive clear, errors |
| **Info / secondary** | `--accent-blue` | `#38bdf8` sky | Secondary intel (e.g. swap-type icons) |
| **Neutral / PPI** | `--text-muted` + `.badge-ppi` | slate | Informational metrics only — **not** a CTA |

Each status color has companion tokens:

- `--accent-*-bg` — solid-ish chip background  
- `--accent-*-border` — outline / dashed suggestion borders  
- `--accent-*-glow` — soft box-shadow  
- `--accent-*-soft` — large card wash  

**Do not** hardcode old Bootstrap values such as `#10b981`, `#f59e0b`, `#e4002b`, or `#4338ca` in components. Use variables so light/dark stay consistent.

### Semantic color rules (critical)

| Content | Color |
|---------|--------|
| Plain price | `--text-main` (tabular) |
| Savings / “you save” | green |
| Suggestion title / upgrade tip | amber |
| Overpriced / delete / error | danger (rose) |
| **PPI** (price per unit) | **neutral** `.badge-ppi` — never amber as default |
| PPI **comparison** inside a suggestion | amber `current → suggested` + green savings chip |
| Category / section labels | `--text-main` (not amber) |

### Provider brand color (avatar only)

- Each provider defines `accentColor` + `logoText` (e.g. KFC UK: `#e4002b`, `KFC`).
- Toolbar avatar and restaurant-picker logo use **solid** `provider.accentColor` with white text and a soft brand-tinted shadow (`${accentColor}55`).
- Do **not** paint global chrome (mode switch, primary buttons) in KFC red.

### Surfaces & Backgrounds

| Token | Dark | Light |
|-------|------|-------|
| `--bg-dark` | `#0c0e12` near-black | `#f7f8fa` quiet gray |
| `--bg-card` | `#161a22` solid | `#ffffff` solid |
| `--bg-subtle` | `#12161e` | `#eef0f4` |
| `--bg-input` | `#10141b` | `#ffffff` |
| `--border-color` | slate white ~12% | slate black ~8% |
| `--text-main` | `#eef1f6` | `#0f172a` |
| `--text-muted` | `#94a3b8` | `#64748b` |
| `--shadow` | soft dark | soft slate |

**No** dual-color ambient body radials — flat canvas, clean cards, light shadows.

---

## 3. Layout & Page Alignment

### Shell structure (ref babywise)

```
.app-page
  └── .app-shell
        ├── Navbar (home only) | .app-sticky-header (in-session)
        ├── .app-main
        └── .app-footer
```

### Breakpoints

| Range | Role | Behavior |
|-------|------|----------|
| **&lt; 720px** | App | Full-bleed phone frame, shell max ~480px, main scrolls inside shell, safe-area insets, compact mode switcher, results dock |
| **720–1023px** | Framed app | Phone card on canvas (~440px), rounded elevated shell |
| **≥ 1024px** | Web | Wide shell (~1100px), full mode switcher, 2-col mode grids, no results dock |

### Component Consistency
- **Card border radius**: `14px`–`16px` (`var(--radius-md)` / `16px` for premium modals).
- **Input border radius**: `10px`–`12px`.
- **Search inputs**: height ~`42px`, icon inset ~`14px`, `var(--bg-input)`.

### App shell flow
1. **Provider select** (`ProviderSelector`) when no chain chosen.  
2. After select: **provider toolbar** → mode switch → Mode 1 / Mode 2 body.  
3. **Change** returns to provider select; **Clear** wipes local login/synced data via portaled modal.

### Attribution
- Footer and home navbar link to GitHub: `https://github.com/mingminghomework`.

---

## 4. Components & Micro-Interactions

### Clean Card (`glass-card`)
- Background `var(--bg-card)`, `1px solid var(--border-color)`.
- Soft elevation `var(--shadow)` (alias `--shadow-glow`).
- No heavy multi-stop decorative fills or strong glass blur on cards.

### Toolbar (provider header)
Control order (left → right of actions):

1. **Store** — primary location picker  
2. **Sync** — menu freshness  
3. **Rewards** — loyalty  
4. **Clear** — privacy / wipe local data  
5. **Change** — switch restaurant  

All chips share the same footprint (see §1). Rewards may use amber **only when vouchers are applied**.

### Modals (portaled)
- Render with `ReactDOM.createPortal(..., document.body)`.
- Backdrop: `rgba(0,0,0,0.85)` + blur `14px`, `z-index: 999999`.
- Panel: `glass-card`, max-width ~`440–550px`, radius `16px`, header icon tile + Outfit title + close control.
- Used for: Rewards, Clear local data.  
- **Never** use low-z absolute dropdowns for destructive confirmations (they clip under the mode bar).

### Status badges (`.badge`)

| Class | Role |
|-------|------|
| `.badge-green` | Savings / positive |
| `.badge-amber` | Suggestion / upgrade |
| `.badge-red` | Alert / overpriced (uses `--accent-danger`) |
| `.badge-ppi` | Neutral PPI / metadata |

Shared rules: pill radius, `font-size: 0.72rem`, weight 700, `tabular-nums`, `white-space: nowrap`.

### PPI components
- **`PpiBadge`**: neutral chip, e.g. `PPI £0.72 / wing`.
- **`PpiComparisonBadges`**: amber comparison + optional green per-unit save (suggestion context only).
- Guide example format:  
  `PPI £0.74 / wing → £0.72 / wing` + green `Save £0.02 / wing`.

### Verdict / savings surfaces
- Worth it / savings hero: green borders, green metrics, `CheckCircle2`.
- Overpriced: danger rose, `AlertTriangle`.
- Neutral equal: amber/scale icon only when meaning is “neither win nor loss”.

### Buttons
- Primary filled: `var(--primary-gradient)` or solid `--primary` / `--accent-green` for apply-savings.
- Destructive: danger gradient / danger tokens (Clear delete).
- Ghost / secondary: `var(--bg-subtle)` + `var(--border-color)` + muted text.

---

## 5. Theming

- Theme stored via theme service; apply `data-theme="light"` or dark (default) on root.
- All semantic colors and surfaces must switch via CSS variables — no one-off light-mode hex in components.
- Provider `accentColor` is **not** theme-dependent (brand identity).

---

## 6. Do / Don’t

| Do | Don’t |
|----|--------|
| Use `--primary-gradient` for chrome CTAs | Paint the whole app in KFC red |
| Use `.badge-ppi` for unit economics | Use amber for every PPI chip |
| Use green only for savings / success | Use green for raw menu prices |
| Use amber for suggestions | Use amber for category headers |
| Use danger for alerts / delete | Mix old Bootstrap reds with new tokens |
| Portal modals for confirmations | Absolute popovers under stacked layout |
| Match toolbar button height/padding | One-off oversized Rewards styling |

---

## 7. Author & System Attribution

- **Product name**: ComboWise  
- **Description**: Smart basket optimiser for UK fast food  
- **Author**: mingminghomework  
- **Token file**: `src/index.css`  
- **Badge / PPI helpers**: `src/components/PpiBadge.tsx`
