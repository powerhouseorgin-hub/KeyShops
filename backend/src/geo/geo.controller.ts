import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

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
@Controller('geo')
export class GeoController {
  @Get('reverse-geocode')
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng query params are required numbers.');
    }

    const apiKey = process.env.LOCATIONIQ_API_KEY || '';
    const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch (e: any) {
      // Logged separately from the generic client-facing message below -
      // this can fail for very different reasons (DNS/timeout here vs. a
      // non-2xx response below) that look identical to the client but need
      // different fixes, so the real cause has to survive somewhere.
      console.error(`[GeoController] reverse-geocode fetch threw: ${e?.message || e}`);
      throw new BadRequestException('Reverse geocoding lookup failed.');
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error(`[GeoController] reverse-geocode got ${res.status} ${res.statusText} from LocationIQ: ${bodyText.slice(0, 500)}`);
      throw new BadRequestException('Reverse geocoding lookup failed.');
    }

    const data: any = await res.json();
    const addr = data.address || {};

    // Not every point has every component (rural areas often lack
    // house_number/road entirely) - each field below is best-effort.
    const streetParts = [addr.house_number, addr.road].filter(Boolean);

    return {
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
      displayName: data.display_name || '',
    };
  }
}
