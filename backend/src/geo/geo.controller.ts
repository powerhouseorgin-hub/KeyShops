import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TtlCache } from '../common/ttl-cache';

// Keyed to ~11m precision (4 decimal places) - a "Current Location" click a
// few meters from where someone else already resolved reverse-geocodes to
// the same address anyway, and the underlying map data a physical
// coordinate resolves to essentially never changes, so a long TTL is safe.
// Capped at 2,000 entries (bounded/LRU - see TtlCache) since, unlike this
// app's other TtlCache uses (a handful of shop categories), distinct
// coordinates are a high-cardinality key space that would otherwise grow
// for as long as the process stays up.
const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const reverseGeocodeCache = new TtlCache<any>(2000);
const coordKey = (lat: number, lng: number) => `${lat.toFixed(4)}_${lng.toFixed(4)}`;

// Server-side reverse-geocoding proxy.
//
// The frontend used to call BigDataCloud's free "reverse-geocode-client"
// endpoint directly from the browser/WebView (it sends
// Access-Control-Allow-Origin: * specifically to support that use case) -
// but that API only returns locality/city/state granularity, never a street
// name or house number.
//
// This used to call OpenStreetMap's Nominatim directly (still the data
// source behind LocationIQ below, and the reason the response shape/field
// names are unchanged), but Nominatim identifies and rate-limits callers by
// IP rather than API key - Render's outbound IP is shared with unrelated
// tenants, and their combined traffic was enough to get the whole IP
// blocked with HTTP 429 regardless of how little *this* app called it.
// LocationIQ fronts the same OSM data behind a real API key, so the quota is
// ours alone: https://locationiq.com/docs#reverse-geocoding
function buildUrl(apiKey: string, lat: number, lng: number, zoom: number): string {
  return `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=${zoom}`;
}

@Controller('geo')
export class GeoController {
  @Get('reverse-geocode')
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng query params are required numbers.');
    }

    const cacheKey = coordKey(latitude, longitude);
    const cached = reverseGeocodeCache.get(cacheKey);
    if (cached) return cached;

    const apiKey = process.env.LOCATIONIQ_API_KEY || '';

    // zoom=18 (house/building level) is the right level of detail for a
    // well-mapped urban address, but on a sparsely-tagged rural road it
    // matches a bare, untagged OSM "way" with no locality attached at all -
    // even though the surrounding village/suburb *is* tagged in OSM, just
    // one zoom level out. Retrying once at zoom=14 (village/suburb level)
    // recovers that context instead of returning an address with nothing
    // but state/country in it. This can't invent a house number or street
    // name that was never mapped - that's a real gap in the underlying map
    // data, not something any reverse-geocoding provider can fix - but it
    // does mean "somewhere unmapped" still comes back as "near <village>"
    // rather than empty.
    let addr = await fetchAddress(apiKey, latitude, longitude, 18);
    const isSparse = !addr.road && !addr.suburb && !addr.neighbourhood && !addr.village && !addr.city && !addr.town;
    if (isSparse) {
      const fallback = await fetchAddress(apiKey, latitude, longitude, 14);
      if (fallback) addr = { ...fallback, ...addr };
    }

    // Not every point has every component (rural areas often lack
    // house_number/road entirely) - each field below is best-effort.
    const streetParts = [addr.house_number, addr.road].filter(Boolean);

    const result = {
      street: streetParts.join(' '),
      locality: addr.suburb || addr.neighbourhood || addr.village || '',
      city: addr.city || addr.town || addr.county || '',
      // For Indian addresses, Nominatim's `state_district` field is the one
      // that actually corresponds to the administrative "district" (e.g.
      // "Chennai", "Coimbatore") - `city_district` is a locality/zone
      // *within* a city (not a district) and `county` is often absent or
      // uses a different naming convention entirely. Using city_district/
      // county first (as this used to) meant `district` was frequently
      // empty or wrong, which is what silently fed an incorrect value into
      // the "Current Location" district auto-fill on the client.
      district: addr.state_district || addr.city_district || addr.county || '',
      state: addr.state || '',
      postcode: addr.postcode || '',
      country: addr.country || '',
      displayName: addr.__displayName || '',
    };
    reverseGeocodeCache.set(cacheKey, result, REVERSE_GEOCODE_CACHE_TTL_MS);
    return result;
  }
}

async function fetchAddress(apiKey: string, lat: number, lng: number, zoom: number): Promise<any> {
  const url = buildUrl(apiKey, lat, lng, zoom);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e: any) {
    // Logged separately from the generic client-facing message thrown by the
    // caller - this can fail for very different reasons (DNS/timeout here
    // vs. a non-2xx response below) that look identical to the client but
    // need different fixes, so the real cause has to survive somewhere.
    console.error(`[GeoController] reverse-geocode fetch threw: ${e?.message || e}`);
    throw new BadRequestException('Reverse geocoding lookup failed.');
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error(`[GeoController] reverse-geocode got ${res.status} ${res.statusText} from LocationIQ: ${bodyText.slice(0, 500)}`);
    throw new BadRequestException('Reverse geocoding lookup failed.');
  }

  const data: any = await res.json();
  return { ...(data.address || {}), __displayName: data.display_name || '' };
}
