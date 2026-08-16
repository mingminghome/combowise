export interface UKPostcodeResult {
  postcode: string;
  latitude: number;
  longitude: number;
  district: string;
  region: string;
  adminCounty: string | null;
}

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
/** Outward code only — WA15, M1, SW1A */
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

function compactPostal(raw: string): string {
  return raw.replace(/\s+/g, '').trim().toUpperCase();
}

export class PostcodeService {
  /** Full postcode (WA15 7RF) or outcode (WA15, M1). */
  static isPostalQuery(rawQuery: string): boolean {
    const cleaned = compactPostal(rawQuery);
    return FULL_POSTCODE.test(cleaned) || OUTCODE.test(cleaned);
  }

  /**
   * Resolve a UK postcode or outcode (WA157RF, WA15 7RF, WA15, M1, SW1A 1AA).
   */
  static async lookupPostcode(rawQuery: string): Promise<UKPostcodeResult | null> {
    const cleaned = compactPostal(rawQuery);
    if (!cleaned || cleaned.length > 8) return null;

    const isFull = FULL_POSTCODE.test(cleaned);
    const isOut = OUTCODE.test(cleaned);
    if (!isFull && !isOut) return null;

    try {
      const path = isFull ? `postcodes/${cleaned}` : `outcodes/${cleaned}`;
      const response = await fetch(`https://api.postcodes.io/${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data && data.status === 200 && data.result) {
        const r = data.result;
        const district = Array.isArray(r.admin_district)
          ? r.admin_district[0]
          : r.admin_district || r.parish || 'UK District';
        return {
          postcode: r.postcode || r.outcode || cleaned,
          latitude: r.latitude,
          longitude: r.longitude,
          district,
          region: r.region || r.european_electoral_region || 'UK',
          adminCounty: r.admin_county ?? null,
        };
      }
    } catch (e) {
      console.info('Postcode API lookup failed, falling back to local store search:', e);
    }

    return null;
  }

  /**
   * Calculate distance between two lat/long coordinates in miles (Haversine Formula)
   */
  static calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }
}
