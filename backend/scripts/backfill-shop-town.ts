/**
 * One-time backfill: resolves a town/city-level locality (e.g.
 * "Gopichettipalayam") AND a district-level locality (e.g. "Erode") for
 * every existing Shop that already has stored GPS coordinates
 * (latitude/longitude) but is missing either value - i.e. every shop that
 * registered before the Shop.town/Shop.district columns existed (see
 * migrations 20260813053902_add_shop_town and 20260813062942_add_shop_district).
 *
 * Reuses the exact same Nominatim reverse-geocoding call and field mapping
 * as GeoController.reverseGeocode (city: addr.city||addr.town||addr.county,
 * district: addr.state_district||addr.city_district||addr.county), called
 * directly here rather than through the HTTP endpoint since this runs as an
 * offline script, not a request handler. Both fields come back from the same
 * single geocode call, so backfilling both here costs no extra API requests.
 *
 * Nominatim's usage policy caps free-tier usage at ~1 request/second and
 * requires an identifying User-Agent - both are honored below (a fixed
 * delay between requests, same User-Agent header as geo.controller.ts).
 *
 * SAFE TO RE-RUN: only processes shops where `town` or `district` is still
 * null, so a partial failure (network blip, rate-limit) can simply be
 * re-run to pick up where it left off.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-shop-town.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-shop-town.ts --dry-run   (report only, no writes)
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

// Nominatim's usage policy: max ~1 request/second for the free public
// instance. 1100ms gives a small safety margin.
const REQUEST_DELAY_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reverseGeocodeLocation(lat: number, lng: number): Promise<{ town: string; district: string }> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'KEE-KeySpacePlatform/1.0 (contact: admin@kee.com)',
      'Accept-Language': 'en',
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim returned ${res.status}`);
  }
  const data: any = await res.json();
  const addr = data.address || {};
  // Same fallback chains as GeoController.reverseGeocode's `city`/`district`
  // fields.
  return {
    town: addr.city || addr.town || addr.county || '',
    district: addr.state_district || addr.city_district || addr.county || '',
  };
}

async function main() {
  const prisma = new PrismaClient();

  const shops = await prisma.shop.findMany({
    where: {
      OR: [{ town: null }, { district: null }],
      latitude: { not: null },
      longitude: { not: null },
      deletedAt: null,
    },
    select: { id: true, name: true, latitude: true, longitude: true, town: true, district: true },
  });

  console.log(`Found ${shops.length} shop(s) with coordinates but missing town/district.${DRY_RUN ? ' (dry run)' : ''}`);

  let resolved = 0;
  let empty = 0;
  let failed = 0;

  for (const [i, shop] of shops.entries()) {
    try {
      const { town, district } = await reverseGeocodeLocation(shop.latitude!, shop.longitude!);
      const data: { town?: string; district?: string } = {};
      if (!shop.town && town) data.town = town;
      if (!shop.district && district) data.district = district;

      if (Object.keys(data).length > 0) {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> town="${data.town ?? shop.town}" district="${data.district ?? shop.district}"`);
        if (!DRY_RUN) {
          await prisma.shop.update({ where: { id: shop.id }, data });
        }
        resolved++;
      } else {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> no new match, skipped`);
        empty++;
      }
    } catch (err: any) {
      console.error(`[${i + 1}/${shops.length}] ${shop.name} -> FAILED: ${err.message}`);
      failed++;
    }
    if (i < shops.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nDone. Resolved: ${resolved}, no match: ${empty}, failed: ${failed}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
