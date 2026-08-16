/**
 * Resolve a UK postcode / outcode / city to coordinates (postcodes.io).
 * Used so official nearby locators (e.g. BK GraphQL) can search WA15.
 */

export type StoreCoords = { lat: number; lng: number };

export type ResolvedUkLocation = {
  postcode: string;
  lat?: number;
  lng?: number;
};

const POSTCODES_IO = 'https://api.postcodes.io';
const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

const CITY_OUTCODES: Record<string, string> = {
  london: 'W1',
  manchester: 'M1',
  birmingham: 'B1',
  glasgow: 'G1',
  edinburgh: 'EH1',
  leeds: 'LS1',
  liverpool: 'L1',
  bristol: 'BS1',
  cardiff: 'CF10',
  belfast: 'BT1',
  newcastle: 'NE1',
  nottingham: 'NG1',
  sheffield: 'S1',
  leicester: 'LE1',
  coventry: 'CV1',
  reading: 'RG1',
  oxford: 'OX1',
  cambridge: 'CB1',
  brighton: 'BN1',
  southampton: 'SO14',
  plymouth: 'PL1',
  altrincham: 'WA15',
};

export function normalizeUkPostal(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function isUkPostalQuery(raw: string): boolean {
  const c = normalizeUkPostal(raw);
  return FULL_POSTCODE.test(c) || OUTCODE.test(c);
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ComboWise/1.0 (live-menu-proxy)' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function resolveUkLocation(q: string, coords?: StoreCoords): Promise<ResolvedUkLocation | null> {
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    try {
      const body = await fetchJson(
        `${POSTCODES_IO}/postcodes?lon=${encodeURIComponent(String(coords.lng))}&lat=${encodeURIComponent(String(coords.lat))}`,
        5000
      );
      const row = body?.result?.[0];
      const pc = String(row?.postcode || '').replace(/\s+/g, '');
      if (pc) return { postcode: pc, lat: coords.lat, lng: coords.lng };
    } catch {
      /* reverse geocode optional */
    }
    return { postcode: '', lat: coords.lat, lng: coords.lng };
  }

  const raw = String(q || '').trim();
  if (!raw) return null;

  const compact = normalizeUkPostal(raw);
  if (isUkPostalQuery(raw)) {
    try {
      const path = FULL_POSTCODE.test(compact) ? `postcodes/${compact}` : `outcodes/${compact}`;
      const body = await fetchJson(`${POSTCODES_IO}/${path}`, 5000);
      const r = body?.result;
      return {
        postcode: compact,
        lat: typeof r?.latitude === 'number' ? r.latitude : undefined,
        lng: typeof r?.longitude === 'number' ? r.longitude : undefined,
      };
    } catch {
      return { postcode: compact };
    }
  }

  const cityKey = raw.toLowerCase().replace(/[^a-z]/g, '');
  const cityPc = CITY_OUTCODES[cityKey];
  if (cityPc) return resolveUkLocation(cityPc);
  return null;
}
