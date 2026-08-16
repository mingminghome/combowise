/**
 * Dev-only middleware: serves /api/live/* using the **same** adapters as
 * Cloudflare Pages Functions (`functions/adapters/*`).
 *
 * Previously this file had a stub normalizer (atomicUnits: { [posId]: 1 } only,
 * no mealComponents / combo enrichment). That made Combo Auditor work on
 * Cloudflare but fail on localhost — breakdown data never existed in dev menus.
 */
import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { LiveEnv } from './functions/adapters/shared.ts';
import { fetchKfcMenu, fetchKfcStores } from './functions/adapters/kfc-uk.ts';
import { fetchPopeyesMenu, fetchPopeyesStores } from './functions/adapters/popeyes-uk.ts';
import { fetchMcdonaldsMenu, fetchMcdonaldsStores } from './functions/adapters/mcdonalds-uk.ts';
import { fetchBurgerKingMenu, fetchBurgerKingStores } from './functions/adapters/burger-king-uk.ts';
import { fetchTimHortonsMenu, fetchTimHortonsStores } from './functions/adapters/tim-hortons-uk.ts';

/** Optional env overrides (same names as Pages / wrangler). */
function liveEnv(): LiveEnv {
  return {
    KFC_API_KEY: process.env.KFC_API_KEY,
    KFC_API_BASE: process.env.KFC_API_BASE,
    KFC_MENU_OUTPUT_BASE: process.env.KFC_MENU_OUTPUT_BASE,
    KFC_MENU_UPSTREAM: process.env.KFC_MENU_UPSTREAM,
    KFC_STORES_UPSTREAM: process.env.KFC_STORES_UPSTREAM,
    POPEYES_API_BASE: process.env.POPEYES_API_BASE,
    POPEYES_MENU_UPSTREAM: process.env.POPEYES_MENU_UPSTREAM,
    POPEYES_STORES_UPSTREAM: process.env.POPEYES_STORES_UPSTREAM,
    MCD_STORES_UPSTREAM: process.env.MCD_STORES_UPSTREAM,
    MCD_MENU_UPSTREAM: process.env.MCD_MENU_UPSTREAM,
    BK_STORES_UPSTREAM: process.env.BK_STORES_UPSTREAM,
    BK_MENU_UPSTREAM: process.env.BK_MENU_UPSTREAM,
    TH_STORES_UPSTREAM: process.env.TH_STORES_UPSTREAM,
    TH_MENU_UPSTREAM: process.env.TH_MENU_UPSTREAM,
  };
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function handleLive(url: URL): Promise<{ status: number; body: unknown }> {
  const parts = url.pathname.replace(/^\/api\/live\/?/, '').split('/').filter(Boolean);
  const provider = parts[0] || '';
  const resource = parts[1] || '';
  const storeId = url.searchParams.get('storeId') || '';
  const q = url.searchParams.get('q') || '';
  const env = liveEnv();

  if (resource !== 'menu' && resource !== 'stores') {
    return { status: 404, body: { error: 'not_found' } };
  }

  if (provider === 'kfc_uk' && resource === 'stores') {
    return { status: 200, body: await fetchKfcStores(env, q) };
  }

  if (provider === 'kfc_uk' && resource === 'menu') {
    if (!storeId) {
      return {
        status: 400,
        body: { error: 'store_required', message: 'Pass storeId=refid' },
      };
    }
    return { status: 200, body: await fetchKfcMenu(env, storeId) };
  }

  if (provider === 'popeyes_uk' && resource === 'stores') {
    return { status: 200, body: await fetchPopeyesStores(env, q) };
  }

  if (provider === 'popeyes_uk' && resource === 'menu') {
    if (!storeId) {
      return {
        status: 400,
        body: { error: 'store_required', message: 'Pass storeId=slug' },
      };
    }
    return { status: 200, body: await fetchPopeyesMenu(env, storeId) };
  }

  if (provider === 'mcdonalds_uk' && resource === 'stores') {
    return { status: 200, body: await fetchMcdonaldsStores(env, q) };
  }
  if (provider === 'mcdonalds_uk' && resource === 'menu') {
    if (!storeId) {
      return {
        status: 400,
        body: { error: 'store_required', message: 'Pass storeId=McDonald’s restaurant number' },
      };
    }
    return { status: 200, body: await fetchMcdonaldsMenu(env, storeId) };
  }

  if (provider === 'burger_king_uk' && resource === 'stores') {
    return { status: 200, body: await fetchBurgerKingStores(env, q) };
  }
  if (provider === 'burger_king_uk' && resource === 'menu') {
    if (!storeId) {
      return {
        status: 400,
        body: { error: 'store_required', message: 'Pass storeId=BK store number (e.g. 33001)' },
      };
    }
    return { status: 200, body: await fetchBurgerKingMenu(env, storeId) };
  }

  if (provider === 'tim_hortons_uk' && resource === 'stores') {
    return { status: 200, body: await fetchTimHortonsStores(env, q) };
  }
  if (provider === 'tim_hortons_uk' && resource === 'menu') {
    if (!storeId) {
      return {
        status: 400,
        body: { error: 'store_required', message: 'Pass storeId from Tim Hortons locator slug' },
      };
    }
    return { status: 200, body: await fetchTimHortonsMenu(env, storeId) };
  }

  return {
    status: 503,
    body: {
      error: 'live_source_not_configured',
      provider,
      resource,
      message: `No live adapter for provider "${provider}".`,
    },
  };
}

export function liveApiDevPlugin(): Plugin {
  return {
    name: 'combowise-live-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/live')) return next();
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.end();
          return;
        }
        if (req.method !== 'GET') return next();

        try {
          const host = req.headers.host || 'localhost';
          const url = new URL(req.url, `http://${host}`);
          const result = await handleLive(url);
          json(res, result.body, result.status);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'live fetch failed';
          console.error('[live-api]', msg);
          json(res, { error: 'upstream_error', message: msg }, 502);
        }
      });
    },
  };
}
