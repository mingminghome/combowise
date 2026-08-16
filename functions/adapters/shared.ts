/**
 * Shared helpers for Cloudflare Pages live-menu adapters.
 */

export type LiveEnv = {
  KFC_API_KEY?: string;
  KFC_API_BASE?: string;
  KFC_MENU_OUTPUT_BASE?: string;
  KFC_MENU_UPSTREAM?: string;
  KFC_STORES_UPSTREAM?: string;
  POPEYES_API_BASE?: string;
  POPEYES_MENU_UPSTREAM?: string;
  POPEYES_STORES_UPSTREAM?: string;
  BK_STORES_UPSTREAM?: string;
  BK_MENU_UPSTREAM?: string;
};

export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }
  return 0;
}

export async function proxyUpstream(template: string, storeId: string): Promise<Response> {
  const target = template.replace(/\{storeId\}/g, encodeURIComponent(storeId));
  const res = await fetch(target, {
    headers: { Accept: 'application/json', 'User-Agent': 'ComboWise-LiveProxy/1.0' },
  });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  return new Response(await res.text(), {
    status: 200,
    headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') || cors['Content-Type'] },
  });
}
