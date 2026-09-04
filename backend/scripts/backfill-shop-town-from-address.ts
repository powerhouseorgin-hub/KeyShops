/**
 * One-time backfill: resolves town/district (and lat/lng, when missing) for
 * every existing Shop that has neither GPS coordinates NOR a town/district -
 * i.e. shops created through a path with no location capture at all (the
 * Super Admin's "Provision New Shop" form has no GPS step; the public
 * self-registration wizard's GPS step is also skippable). Complements
 * backfill-shop-town.ts, which only handles shops that DO have stored
 * coordinates - this one forward-geocodes the free-text address stored in
 * Shop.companyDetails.address instead, via the same LocationIQ-backed
 * lookup now used automatically for every new shop (see
 * ShopService.createShop / AuthService.registerShop).
 *
 * SAFE TO RE-RUN: only processes shops where `town` AND `district` are still
 * null, so a partial failure (network blip, rate-limit) can simply be
 * re-run to pick up where it left off.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-shop-town-from-address.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-shop-town-from-address.ts --dry-run   (report only, no writes)
 */
import { PrismaClient } from '@prisma/client';
import { forwardGeocodeAddress } from '../src/common/geocode.util';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();

  const shops = await prisma.shop.findMany({
    where: { town: null, district: null, deletedAt: null },
    select: { id: true, name: true, companyDetails: true },
  });

  console.log(`Found ${shops.length} shop(s) with no town/district.${DRY_RUN ? ' (dry run)' : ''}`);

  let resolved = 0;
  let empty = 0;
  let failed = 0;

  for (const [i, shop] of shops.entries()) {
    try {
      let address: string | null = null;
      try {
        address = shop.companyDetails ? JSON.parse(shop.companyDetails)?.address ?? null : null;
      } catch {
        address = null;
      }

      if (!address) {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> no address on file, skipped`);
        empty++;
        continue;
      }

      const geocoded = await forwardGeocodeAddress(address);
      if (geocoded && (geocoded.town || geocoded.district)) {
        console.log(
          `[${i + 1}/${shops.length}] ${shop.name} -> town="${geocoded.town}" district="${geocoded.district}" (from "${address}")`,
        );
        if (!DRY_RUN) {
          await prisma.shop.update({
            where: { id: shop.id },
            data: {
              town: geocoded.town || null,
              district: geocoded.district || null,
              latitude: geocoded.latitude ?? undefined,
              longitude: geocoded.longitude ?? undefined,
            },
          });
        }
        resolved++;
      } else {
        console.log(`[${i + 1}/${shops.length}] ${shop.name} -> no match for "${address}", skipped`);
        empty++;
      }
    } catch (err: any) {
      console.error(`[${i + 1}/${shops.length}] ${shop.name} -> FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Resolved: ${resolved}, no match: ${empty}, failed: ${failed}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
