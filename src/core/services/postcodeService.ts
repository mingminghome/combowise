export interface UKPostcodeResult {
  postcode: string;
  latitude: number;
  longitude: number;
  district: string;
  region: string;
  adminCounty: string | null;
}

export class PostcodeService {
  /**
   * Resolve any UK postcode (e.g., WA157RF, WA15 7RF, M1 1WR, SW1A 1AA) via free UK Postcodes API
   */
  static async lookupPostcode(rawQuery: string): Promise<UKPostcodeResult | null> {
    const cleaned = rawQuery.replace(/\s+/g, '').trim().toUpperCase();
    if (cleaned.length < 5 || cleaned.length > 8) {
      return null;
    }

    try {
      const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data && data.status === 200 && data.result) {
        return {
          postcode: data.result.postcode,
          latitude: data.result.latitude,
          longitude: data.result.longitude,
          district: data.result.admin_district || data.result.parish || 'UK District',
          region: data.result.region || data.result.european_electoral_region || 'UK',
          adminCounty: data.result.admin_county,
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
