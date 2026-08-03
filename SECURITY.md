# Security — ComboWise

## Summary

ComboWise is a local-first SPA on Cloudflare Pages with a stateless live menu proxy (`/api/live/*`).

| Area | Approach |
|------|----------|
| API keys | Server secrets only (`.dev.vars` / Pages secrets). Never accept client keys. |
| Menu / store data | Browser storage only — no ComboWise user accounts |
| Basket / wishlist | Session / local only — not synced to a ComboWise server |
| Live proxy | Fetches restaurant menus/stores; does not store personal baskets |
| Analytics | Optional GTM via `VITE_GTM_ID` only (never hardcoded) |

## Threat model

| Threat | Mitigation |
|--------|------------|
| Key theft | Secrets only in CF / `.dev.vars` (gitignored) |
| Cross-origin browser abuse | Same-origin SPA + Pages Functions path |
| Stale or wrong prices | Indicative snapshots; user must confirm in official apps |
| Tracking without consent | GTM off unless `VITE_GTM_ID` is set at build time |

## Secrets checklist

- Never commit `.env`, `.env.local`, or `.dev.vars`
- `KFC_API_KEY` and similar live-proxy keys are server-only
- Client build env (`VITE_*`) is public — do not put secrets there

## Reporting

Please open a private security advisory or issue on the GitHub repo if you find a vulnerability.
