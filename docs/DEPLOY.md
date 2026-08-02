# Deploy: GitHub → Cloudflare Pages (Free)

Target architecture:

```
git push → GitHub (your-org/combowise)
              │
              │  GitHub Actions (.github/workflows/deploy-cloudflare-pages.yml)
              ▼
         npm run build
              │
              ▼
    wrangler pages deploy dist
              │
              ▼
Cloudflare Pages Free  (your-project.pages.dev)
    ├── Static SPA     → dist/
    └── Pages Functions → functions/api/live/*  (KFC + Popeyes live proxy)
```

**Current setup:** Direct Upload project + **CI auto-deploy on push to `main`**.  
(Not the dashboard “Connect to Git” builder — same result.)

### Build / Function env

| Variable | Where | Notes |
|----------|--------|--------|
| `VITE_GTM_ID` | Pages **Build** env + local `.env` | Optional GTM. Empty = no GTM/GA. |
| `KFC_API_KEY` | Pages **Function / Production** env + local `.dev.vars` / shell | **Required** for KFC UK live menu. See `.env.example`. |

GTM is **not hardcoded**. The SPA loads it only when `VITE_GTM_ID` is set (`src/core/analytics/gtm.ts`).

---

## 1. One-time: Cloudflare API secrets (GitHub)

Auto-deploy needs two secrets on the GitHub repo:

1. Open https://dash.cloudflare.com/profile/api-tokens  
2. **Create Token** → template **Edit Cloudflare Workers**  
   (or custom: Account → **Cloudflare Pages → Edit**, Account → **Account Settings → Read**)  
3. Copy the token.  
4. Account ID: from `npx wrangler whoami` or the right sidebar on any CF dashboard page.

Add secrets (repo → **Settings → Secrets and variables → Actions**):

| Secret | Value |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id |

Or via CLI (when logged into `gh`):

```bash
gh secret set CLOUDFLARE_API_TOKEN   # paste token when prompted
gh secret set CLOUDFLARE_ACCOUNT_ID -b "YOUR_ACCOUNT_ID"
```

Also set **Pages project env** `KFC_API_KEY` (Production + Preview) so Functions can call KFC.

---

## 2. Auto-deploy (every push to `main`)

Workflow: [`.github/workflows/deploy-cloudflare-pages.yml`](../.github/workflows/deploy-cloudflare-pages.yml)

| Trigger | Behaviour |
|---------|-----------|
| `push` to `main` | `npm ci` → `npm run build` → `wrangler pages deploy dist` |
| **Actions → Run workflow** | Manual redeploy |

Checks: GitHub repo → **Actions** tab.

---

## 3. Manual deploy (local)

```bash
npm run build
npx wrangler pages deploy dist --project-name=combowise
```

Requires `npx wrangler login` once on your machine.

First deploy with a new `--project-name` **creates** that Pages project (subdomain `https://combowise.pages.dev`).  
The old `ff-calculator` project can stay or be deleted in the Cloudflare dashboard.

---

## 4. Optional: dashboard “Connect to Git” instead

If you prefer Cloudflare to build on their servers (no GitHub Actions):

1. Dashboard → **Workers & Pages** → **Create** → **Connect to Git**  
2. Select `mingminghome/ff-calculator`  
3. Build: `npm run build`, output `dist`, Node `20`  

You can keep or disable the GitHub Action to avoid double deploys.

---

## 5. Environment variables (Pages)

| Name | Production |
|------|------------|
| `VITE_LIVE_API_BASE` | optional (`/api/live` default) |
| `KFC_*` / `POPEYES_*` | optional overrides — see [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md) |

KFC + Popeyes built-in adapters need **no** env vars by default.

---

## 6. Smoke tests after deploy

```bash
curl -sS "https://combowise.pages.dev/" -o /dev/null -w "%{http_code}\n"
curl -sS "https://combowise.pages.dev/api/live/kfc_uk/stores" | head -c 200
curl -sS "https://combowise.pages.dev/api/live/popeyes_uk/menu?storeId=plymouth" | head -c 200
```

In the app: pick chain → **select store** → Basket Optimiser (default) / Combo Auditor unlock.

---

## 7. Free-tier notes

| Concern | Guidance |
|---------|----------|
| Cost | Pages Free is enough for light personal use |
| Functions | Count toward Workers free request limits |
| Upstream APIs | Unofficial KFC/Popeyes feeds can change |
| Build minutes | GitHub Actions free tier for private repos has monthly limits |

---

## Related

- [LIVE_MENU_SOURCES.md](./LIVE_MENU_SOURCES.md) — live menu proxy  
- [MENU_LOADING.md](./MENU_LOADING.md) — client cache / store gate  
- [PROVIDER_PLUGIN_GUIDE.md](./PROVIDER_PLUGIN_GUIDE.md) — add a chain  
