// Rebuilds the three Algolia indexes (customers, shops, promotions) from
// Firestore using the shared allowlist in functions/algolia-fields.js - the
// same one the live sync functions use. Run it after changing that allowlist,
// or to repair an index that drifted.
//
// What it does per index: (1) applies the explicit searchableAttributes /
// filterOnly facet settings, (2) atomically replaces ALL records
// (saved in place by objectID, then stale records are deleted, so search keeps
// working throughout), (3) reads the index
// back and reports which fields each record now holds.
//
// Dry run unless --confirm. Never prints field VALUES - only counts and field
// names. The Algolia admin key is read from functions/.env, never logged.
//
//   npx ts-node -r tsconfig-paths/register scripts/reindex-algolia.ts
//   npx ts-node -r tsconfig-paths/register scripts/reindex-algolia.ts --confirm
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { algoliasearch } from 'algoliasearch';
import { FirestoreService } from '../src/firestore/firestore.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { indexSettings, slimRecord } = require('../functions/algolia-fields');

const CONFIRM = process.argv.includes('--confirm');

function readEnv(file: string, key: string): string {
  const text = fs.readFileSync(file, 'utf8');
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// The client library's own waitForTask / waitForTasks helpers never returned against this
// Algolia app (they hung for minutes), while polling getTask by hand reliably sees
// "published" within ~6s - so poll manually, with a hard deadline.
async function waitTask(client: ReturnType<typeof algoliasearch>, indexName: string, taskID: number) {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const t = await client.getTask({ indexName, taskID });
    if (t.status === 'published') return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Algolia task ${taskID} on "${indexName}" was not published within 300s`);
}

async function fieldsInIndex(client: ReturnType<typeof algoliasearch>, indexName: string) {
  const r = await client.searchSingleIndex({
    indexName,
    searchParams: { query: '', hitsPerPage: 1000, attributesToRetrieve: ['*'] },
  });
  const fields = new Set<string>();
  r.hits.forEach((h: any) => Object.keys(h).filter((k) => !k.startsWith('_')).forEach((k) => fields.add(k)));
  return { count: r.nbHits ?? r.hits.length, fields: [...fields].sort() };
}

async function main() {
  const envFile = path.join(__dirname, '../functions/.env');
  const appId = readEnv(envFile, 'ALGOLIA_APP_ID');
  const adminKey = readEnv(envFile, 'ALGOLIA_ADMIN_API_KEY');
  if (!appId || !adminKey) throw new Error('ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY missing in backend/functions/.env');
  const client = algoliasearch(appId, adminKey);
  const db = new FirestoreService().db;

  console.log(CONFIRM ? '=== LIVE RE-INDEX ===\n' : '=== DRY RUN (pass --confirm to apply) ===\n');

  const built: Record<string, any[]> = { shops: [], customers: [], promotions: [] };
  const skipped: Record<string, number> = { shops: 0, customers: 0, promotions: 0 };

  const shops = await db.collection('shops').get();
  for (const d of shops.docs) {
    const rec = slimRecord('shops', d.id, d.data());
    rec ? built.shops.push(rec) : skipped.shops++;
  }

  const customers = await db.collectionGroup('customers').get();
  for (const d of customers.docs) {
    const shopId = d.ref.parent.parent?.id;
    if (!shopId) { skipped.customers++; continue; }
    const rec = slimRecord('customers', d.id, d.data(), { shopId });
    rec ? built.customers.push(rec) : skipped.customers++;
  }

  const promotions = await db.collection('promotions').get();
  for (const d of promotions.docs) {
    const rec = slimRecord('promotions', d.id, d.data());
    rec ? built.promotions.push(rec) : skipped.promotions++;
  }

  for (const indexName of ['customers', 'shops', 'promotions']) {
    const objects = built[indexName];
    const sampleFields = [...new Set(objects.flatMap((o) => Object.keys(o)))].sort();
    const before = await fieldsInIndex(client, indexName).catch(() => ({ count: 0, fields: [] as string[] }));
    console.log(`[${indexName}] firestore -> ${objects.length} to index, ${skipped[indexName]} skipped (soft-deleted)`);
    console.log(`  fields in index now:    ${before.fields.join(', ') || '(none)'}  (${before.count} records)`);
    console.log(`  fields after re-index:  ${sampleFields.join(', ') || '(none)'}`);

    if (!CONFIRM) continue;

    // Safety: never swap an index that currently has records for an empty set.
    if (objects.length === 0 && before.count > 0) {
      console.log(`  SKIPPED: Firestore returned 0 records but the index has ${before.count} - refusing to wipe it.`);
      continue;
    }
    // 1. explicit searchable / filterOnly settings (wait so they are live before records change)
    const settingsTask = await client.setSettings({ indexName, indexSettings: indexSettings(indexName) });
    await waitTask(client, indexName, settingsTask.taskID);

    // 2. save every slim record over the existing one: saveObjects REPLACES the whole record by
    //    objectID, so extra fields (GPS, ID ciphertext, ...) are dropped, and search keeps working
    //    throughout (no empty window). Deliberately not replaceAllObjects: on this Algolia plan its
    //    temp-index swap never completed and left a stray *_tmp_* index behind.
    const saved = await client.saveObjects({ indexName, objects });
    for (const r of saved) await waitTask(client, indexName, r.taskID);

    // 3. remove records Firestore no longer has (or that were soft-deleted)
    const keep = new Set(objects.map((o) => o.objectID));
    const stale: string[] = [];
    await client.browseObjects({
      indexName,
      browseParams: { attributesToRetrieve: ['objectID'] },
      aggregator: (res: any) => res.hits.forEach((h: any) => { if (!keep.has(h.objectID)) stale.push(h.objectID); }),
    });
    if (stale.length) {
      const deleted = await client.deleteObjects({ indexName, objectIDs: stale });
      for (const r of deleted) await waitTask(client, indexName, r.taskID);
    }
    console.log(`  removed ${stale.length} stale record(s)`);
    const after = await fieldsInIndex(client, indexName);
    console.log(`  DONE -> ${after.count} records; fields: ${after.fields.join(', ')}`);
  }

  console.log(CONFIRM ? '\nRe-index complete.' : '\nDry run only - nothing was changed.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Re-index failed:', String(e?.message || e).slice(0, 300));
  process.exit(1);
});
