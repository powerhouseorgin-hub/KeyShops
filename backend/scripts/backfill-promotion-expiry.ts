/**
 * One-time backfill: sets validUntil = createdAt + 30 days on every existing
 * Machine/Product listing (Promotion.type = 'PRODUCT') that predates the
 * expiry-and-auto-delete feature and therefore still has validUntil = null.
 *
 * New PRODUCT listings created after this feature shipped always get a
 * validUntil at create time (see PromotionService.createPromotion /
 * clampProductExpiry), so this only ever needs to touch the pre-existing
 * backlog - a single SQL UPDATE, no external API calls needed.
 *
 * SAFE TO RE-RUN: only touches rows where validUntil IS NULL, so once it has
 * run successfully there is nothing left for a second run to do.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-promotion-expiry.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-promotion-expiry.ts --dry-run   (report only, no writes)
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();

  const pending = await prisma.promotion.count({
    where: { type: 'PRODUCT', validUntil: null },
  });
  console.log(`Found ${pending} PRODUCT listing(s) with no expiry date.${DRY_RUN ? ' (dry run)' : ''}`);

  if (pending > 0 && !DRY_RUN) {
    const count = await prisma.$executeRaw`
      UPDATE "Promotion"
      SET "validUntil" = "createdAt" + INTERVAL '30 days'
      WHERE "type" = 'PRODUCT' AND "validUntil" IS NULL
    `;
    console.log(`Backfilled ${count} row(s).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
