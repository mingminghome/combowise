/**
 * Cloudflare Pages Function — live menu / store proxy (thin router).
 *
 * GET /api/live/:providerId/menu?storeId=
 * GET /api/live/:providerId/stores?q=
 *
 * Brand-specific fetch/normalize lives in:
 *   functions/adapters/<providerId>.ts
 * Add a new chain by adding an adapter + a src/core/providers/<slug> plugin.
 *
 * Env overrides (optional simple proxy, skip built-in adapter):
 *   KFC_MENU_UPSTREAM / KFC_STORES_UPSTREAM
 *   POPEYES_MENU_UPSTREAM / POPEYES_STORES_UPSTREAM  ({storeId} substituted)
 *
 * @see docs/LIVE_MENU_SOURCES.md · docs/PROVIDER_PLUGIN_GUIDE.md
 */

import type { LiveEnv } from '../../../adapters/shared';
import { cors, json, proxyUpstream } from '../../../adapters/shared';
import { fetchKfcMenu, fetchKfcStores } from '../../../adapters/kfc-uk';
import { fetchPopeyesMenu, fetchPopeyesStores } from '../../../adapters/popeyes-uk';
import { fetchMcdonaldsMenu, fetchMcdonaldsStores } from '../../../adapters/mcdonalds-uk';
import { fetchBurgerKingMenu, fetchBurgerKingStores } from '../../../adapters/burger-king-uk';
import { fetchTimHortonsMenu, fetchTimHortonsStores } from '../../../adapters/tim-hortons-uk';

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<LiveEnv> = async (context) => {
  const provider = String(context.params.provider || '');
  const resource = String(context.params.resource || '');
  const url = new URL(context.request.url);
  const storeId = url.searchParams.get('storeId') || '';
  const q = url.searchParams.get('q') || '';
  const latN = Number(url.searchParams.get('lat') || '');
  const lngN = Number(url.searchParams.get('lng') || '');
  const coords =
    Number.isFinite(latN) && Number.isFinite(lngN) ? { lat: latN, lng: lngN } : undefined;

  if (!provider || (resource !== 'menu' && resource !== 'stores')) {
    return json({ error: 'not_found', message: 'Use /api/live/:provider/{menu|stores}' }, 404);
  }

  try {
    // Optional generic upstream override (any provider)
    if (provider === 'kfc_uk' && resource === 'menu' && context.env.KFC_MENU_UPSTREAM) {
      return await proxyUpstream(context.env.KFC_MENU_UPSTREAM, storeId);
    }
    if (provider === 'kfc_uk' && resource === 'stores' && context.env.KFC_STORES_UPSTREAM) {
      return await proxyUpstream(context.env.KFC_STORES_UPSTREAM, storeId);
    }
    if (provider === 'popeyes_uk' && resource === 'menu' && context.env.POPEYES_MENU_UPSTREAM) {
      return await proxyUpstream(context.env.POPEYES_MENU_UPSTREAM, storeId);
    }
    if (provider === 'popeyes_uk' && resource === 'stores' && context.env.POPEYES_STORES_UPSTREAM) {
      return await proxyUpstream(context.env.POPEYES_STORES_UPSTREAM, storeId);
    }

    if (provider === 'kfc_uk' && resource === 'menu') {
      if (!storeId) {
        return json(
          {
            error: 'store_required',
            message: 'Pass storeId=refid from KFC pickup URL (choose-your-food?refid=…)',
          },
          400
        );
      }
      return json(await fetchKfcMenu(context.env, storeId));
    }
    if (provider === 'kfc_uk' && resource === 'stores') {
      return json(await fetchKfcStores(context.env, q));
    }

    if (provider === 'popeyes_uk' && resource === 'menu') {
      if (!storeId) {
        return json(
          {
            error: 'store_required',
            message: 'Pass storeId=slug from Popeyes restaurant URL (e.g. plymouth)',
          },
          400
        );
      }
      return json(await fetchPopeyesMenu(context.env, storeId));
    }
    if (provider === 'popeyes_uk' && resource === 'stores') {
      return json(await fetchPopeyesStores(context.env, q));
    }

    if (provider === 'mcdonalds_uk' && resource === 'menu') {
      return json(await fetchMcdonaldsMenu(context.env, storeId));
    }
    if (provider === 'mcdonalds_uk' && resource === 'stores') {
      return json(await fetchMcdonaldsStores(context.env, q, coords));
    }

    if (provider === 'burger_king_uk' && resource === 'menu') {
      return json(await fetchBurgerKingMenu(context.env, storeId));
    }
    if (provider === 'burger_king_uk' && resource === 'stores') {
      return json(await fetchBurgerKingStores(context.env, q, coords));
    }

    if (provider === 'tim_hortons_uk' && resource === 'menu') {
      return json(await fetchTimHortonsMenu(context.env, storeId));
    }
    if (provider === 'tim_hortons_uk' && resource === 'stores') {
      return json(await fetchTimHortonsStores(context.env, q, coords));
    }

    return json(
      {
        error: 'live_source_not_configured',
        provider,
        resource,
        message: `No live adapter for provider "${provider}". Add functions/adapters/${provider}.ts`,
        docs: 'docs/LIVE_MENU_SOURCES.md',
      },
      503
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'live fetch failed';
    return json({ error: 'upstream_error', provider, resource, message: msg }, 502);
  }
};
