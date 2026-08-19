import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

// Server-side reverse-geocoding proxy.
//
// The frontend used to call BigDataCloud's free "reverse-geocode-client"
// endpoint directly from the browser/WebView (it sends
// Access-Control-Allow-Origin: * specifically to support that use case) -
// but that API only returns locality/city/state granularity, never a street
// name or house number.
//
// OpenStreetMap's Nominatim does return full street-level detail
// (house_number, road, suburb, postcode - see addressdetails=1 below), but
// it does NOT send an Access-Control-Allow-Origin header, so a direct
// client-side fetch() from the app gets blocked by CORS. Routing it through
// our own backend sidesteps that entirely (server-to-server calls aren't
// subject to browser CORS) and lets us set the identifying User-Agent that
// Nominatim's usage policy requires:
// https://operations.osmfoundation.org/policies/nominatim/
@Controller('geo')
export class GeoController {
  @Get('reverse-geocode')
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng query params are required numbers.');
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          // Nominatim rejects/rate-limits requests with no identifying
          // User-Agent - this can't be set from browser fetch() (it's a
          // forbidden header there), which is the other reason this has to
          // run server-side rather than client-side.
          'User-Agent': 'KEE-KeySpacePlatform/1.0 (contact: admin@kee.com)',
          'Accept-Language': 'en',
        },
      });
    } catch (e: any) {
      // Logged separately from the generic client-facing message below -
      // Nominatim can fail for very different reasons (DNS/timeout here vs.
      // a 403/429 policy block below) that look identical to the client but
      // need different fixes, so the real cause has to survive somewhere.
      console.error(`[GeoController] reverse-geocode fetch threw: ${e?.message || e}`);
      throw new BadRequestException('Reverse geocoding lookup failed.');
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error(`[GeoController] reverse-geocode got ${res.status} ${res.statusText} from Nominatim: ${bodyText.slice(0, 500)}`);
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
