/**
 * One-time data migration: moves Promotion.imageUrl and Advertisement.imageUrl
 * values that are currently raw base64 data URIs (e.g. "data:image/jpeg;base64,...")
 * out into real file storage, replacing the column with a lightweight URL.
 *
 * Root cause this cleans up after: the Machines feed's "Upload" button (and
 * the banner ad form's identical one) used to read the picked file with
 * FileReader.readAsDataURL() and store the result directly in imageUrl -
 * some listings ended up with 5+ MB of embedded photo data in a single text
 * column. Every page load of the feed had to transfer all of that regardless
 * of API pagination, since pagination only limits row count, not row size.
 * See PromotionService.uploadImage / AdService.uploadImage for the real
 * upload endpoints that replaced this going forward - this script only
 * backfills the rows that were already written before that fix existed.
 *
 * SAFE TO RE-RUN: only touches rows where imageUrl still starts with
 * "data:" - already-migrated rows are skipped automatically.
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/migrate-embedded-images.ts --dry-run   (report only, no writes)
 *   npx ts-node scripts/migrate-embedded-images.ts             (apply)
 */
import { PrismaClient } from '@prisma/client';
import { FileService } from '../src/customer/file.service';

const DRY_RUN = process.argv.includes('--dry-run');

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

function parseBase64DataUri(dataUri: string): { buffer: Buffer; ext: string; mime: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri.trim());
  if (!match) return null;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (!buffer.length) return null;
  return { buffer, ext: EXT_BY_MIME[match[1]] || '.jpg', mime: match[1] };
}

interface Stats {
  scanned: number;
  embedded: number;
  migrated: number;
  skippedUnparseable: number;
  bytesReclaimed: number;
  errors: Array<{ id: string; error: string }>;
}

async function migrateTable(
  label: string,
  fileService: FileService,
  findMany: () => Promise<Array<{ id: string; imageUrl: string | null }>>,
  update: (id: string, imageUrl: string) => Promise<void>,
  namespace: string,
): Promise<Stats> {
  const stats: Stats = { scanned: 0, embedded: 0, migrated: 0, skippedUnparseable: 0, bytesReclaimed: 0, errors: [] };
  const rows = await findMany();
  stats.scanned = rows.length;

  for (const row of rows) {
    if (!row.imageUrl || !row.imageUrl.startsWith('data:')) continue;
    stats.embedded++;

    const parsed = parseBase64DataUri(row.imageUrl);
    if (!parsed) {
      stats.skippedUnparseable++;
      stats.errors.push({ id: row.id, error: 'Unparseable base64 data URI' });
      console.error(`  [SKIP] ${label} ${row.id}: unparseable data URI`);
      continue;
    }

    const originalSizeKB = (row.imageUrl.length / 1024).toFixed(0);
    try {
      if (!DRY_RUN) {
        const { fileUrl } = await fileService.uploadLongLivedFile(`image${parsed.ext}`, parsed.buffer, namespace);
        await update(row.id, fileUrl);
      }
      stats.migrated++;
      stats.bytesReclaimed += row.imageUrl.length - (DRY_RUN ? 0 : 200); // real URL is ~tiny; approximate for reporting
      console.log(`  [OK] ${label} ${row.id}: ${originalSizeKB} KB embedded -> real file upload`);
    } catch (err: any) {
      stats.errors.push({ id: row.id, error: err.message || String(err) });
      console.error(`  [ERROR] ${label} ${row.id}: ${err.message || err}`);
    }
  }

  return stats;
}

async function run() {
  const prisma = new PrismaClient();
  const fileService = new FileService();
  fileService.onModuleInit();

  console.log(`\n=== Embedded image migration${DRY_RUN ? ' (DRY RUN - no writes)' : ''} ===\n`);

  console.log('--- Promotions ---');
  const promoStats = await migrateTable(
    'Promotion',
    fileService,
    () => prisma.promotion.findMany({ select: { id: true, imageUrl: true } }),
    (id, imageUrl) => prisma.promotion.update({ where: { id }, data: { imageUrl } }).then(() => undefined),
    'promotions',
  );

  console.log('\n--- Advertisements ---');
  const adStats = await migrateTable(
    'Advertisement',
    fileService,
    () => prisma.advertisement.findMany({ select: { id: true, imageUrl: true } }),
    (id, imageUrl) => prisma.advertisement.update({ where: { id }, data: { imageUrl } }).then(() => undefined),
    'ads',
  );

  const totalErrors = promoStats.errors.length + adStats.errors.length;
  const totalMBReclaimed = (promoStats.bytesReclaimed + adStats.bytesReclaimed) / 1024 / 1024;

  console.log(`\n=== Migration summary ===`);
  console.log(`Promotions scanned / embedded / migrated: ${promoStats.scanned} / ${promoStats.embedded} / ${promoStats.migrated}`);
  console.log(`Ads scanned / embedded / migrated:        ${adStats.scanned} / ${adStats.embedded} / ${adStats.migrated}`);
  console.log(`Approx. payload size reclaimed:           ${totalMBReclaimed.toFixed(1)} MB`);
  console.log(`Errors:                                   ${totalErrors}`);
  if (totalErrors) {
    console.log('\nError details:');
    for (const e of [...promoStats.errors, ...adStats.errors]) console.log(`  - ${e.id}: ${e.error}`);
  }
  if (DRY_RUN) console.log('\n(Dry run - no data was written. Re-run without --dry-run to apply.)');

  await prisma.$disconnect();
  process.exit(totalErrors ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error running migration script:', err);
  process.exit(1);
});
