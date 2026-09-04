// Forward-geocoding fallback: resolves town/district/lat/lng from a
// free-text address string, for the case where a shop is registered without
// GPS ("Current Location") - the Super Admin's "Provision New Shop" form has
// no GPS step at all (an admin provisioning a shop remotely isn't standing
// at it), and even the self-registration wizard's GPS button is skippable.
// Without this, a shop silently gets town=null/district=null and becomes
// permanently invisible to every town/district location filter in the app
// (Shop Management, Dealers, Machines/Products, public Find-a-Shop) with no
// error or indication anywhere that it happened.
//
// Uses the same LocationIQ-backed OSM data and field-mapping convention as
// GeoController.reverseGeocode (state_district for `district`, since that's
// the one that actually matches India's administrative districts). Best-
// effort only: any failure (missing API key, network error, no match,
// timeout) resolves to null rather than throwing, so a geocoding hiccup can
// never block shop creation - callers just fall back to their pre-existing
// null-town/null-district behavior.
export async function forwardGeocodeAddress(
  address: string | null | undefined,
): Promise<{ town: string; district: string; latitude: number | null; longitude: number | null } | null> {
  const query = address?.trim();
  if (!query) return null;

  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey) return null;

  const url = `https://us1.locationiq.com/v1/search?key=${apiKey}&q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=in`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const results: any[] = await res.json();
    const first = results?.[0];
    if (!first) return null;

    const addr = first.address || {};
    return {
      town: addr.city || addr.town || addr.county || '',
      district: addr.state_district || addr.city_district || addr.county || '',
      latitude: first.lat ? Number(first.lat) : null,
      longitude: first.lon ? Number(first.lon) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
