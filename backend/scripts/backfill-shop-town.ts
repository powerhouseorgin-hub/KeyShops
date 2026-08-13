/**
 * One-time backfill: resolves a town/city-level locality (e.g.
 * "Gopichettipalayam") for every existing Shop that already has stored GPS
 * coordinates (latitude/longitude) but no `town` value yet - i.e. every shop
 * that registered before the Shop.town column existed (see migration
 * 20260813053902_add_shop_town).
 *
 * Reuses the exact same Nominatim reverse-geocoding call and field mapping
 * as GeoController.reverseGeocode (addr.city || addr.town || addr.county),
 * called directly here rather than through the HTTP endpoint since this
 * runs as an offline script, not a request handler.
 *
 * Nominatim's usage policy caps free-tier usage at ~1 request/second and
 * requires an identifying User-Agent - both are honored below (a fixed
 * delay between requests, same User-Agent header as geo.controller.ts).
 *
 * SAFE TO RE-RUN: only processes shops where `town` is still null, so a
 * partial failure (network blip, rate-limit) can simply be re-run to pick
 * up where it left off.
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

async function reverseGeocodeTown(lat: number, lng: number): Promise<string> {
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
  // Same fallback chain as GeoController.reverseGeocode's `city` field -
  // prefers a formal city name, falls back to town, then county, which in
  // practice resolves correctly to town-level places (e.g. Gopichettipalayam
  // has no "city" designation in OSM, so addr.town supplies it).
  return addr.city || addr.town || addr.county || '';
}

async function main() {
  const prisma = new PrismaClient();

  const shops = await prisma.shop.findMany({
    where: {
      town: null,
      latitude: { not: null },
      longitude: { not: null },
      deletedAt: null,
    },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  console.log(`Found ${shops.length} shop(s) with coordinates but no town.${DRY_RUN ? ' (dry run)' : ''}`);

  let resolved = 0;
  let empty = 0;
  let failed = 0;

  for (const [i, shop] of shops.entries()) {
    try {
      const town = await reverseGeocodeTown(shop.latitude!, shop.longitude!);
      if (town) {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> "${town}"`);
        if (!DRY_RUN) {
          await prisma.shop.update({ where: { id: shop.id }, data: { town } });
        }
        resolved++;
      } else {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> no town-level match, skipped`);
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
