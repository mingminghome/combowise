/**
 * Resolve live data endpoints for a provider.
 *
 * Production & local: Cloudflare Pages Function (or Vite dev middleware)
 *   `/api/live/:providerId/{menu|stores}` → brand upstream adapters.
 *
 * Optional override:
 *   VITE_LIVE_API_BASE — default `/api/live`
 */

const LIVE_BASE =
  (import.meta.env.VITE_LIVE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  '/api/live';

export function menuEndpoint(providerId: string): string {
  return `${LIVE_BASE}/${providerId}/menu`;
}

export function storesEndpoint(providerId: string): string {
  return `${LIVE_BASE}/${providerId}/stores`;
}
