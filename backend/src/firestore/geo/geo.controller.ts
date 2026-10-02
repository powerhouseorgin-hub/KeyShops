import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TtlCache } from '../../common/ttl-cache';

// Reverse-geocoding proxy for LocationIQ with an in-memory cache - no database dependency. The API key stays
// server-side (LOCATIONIQ_API_KEY); the app never calls LocationIQ directly.
const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const reverseGeocodeCache = new TtlCache<any>(2000);
const coordKey = (lat: number, lng: number) => `${lat.toFixed(4)}_${lng.toFixed(4)}`;

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

    let addr = await fetchAddress(apiKey, latitude, longitude, 18);
    const isSparse = !addr.road && !addr.suburb && !addr.neighbourhood && !addr.village && !addr.city && !addr.town;
    if (isSparse) {
      const fallback = await fetchAddress(apiKey, latitude, longitude, 14);
      if (fallback) addr = { ...fallback, ...addr };
    }

    const streetParts = [addr.house_number, addr.road].filter(Boolean);

    const result = {
      street: streetParts.join(' '),
      locality: addr.suburb || addr.neighbourhood || addr.village || '',
      city: addr.city || addr.town || addr.county || '',
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
