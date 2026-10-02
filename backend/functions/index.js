const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { algoliasearch } = require('algoliasearch');
const { slimRecord } = require('./algolia-fields');

// Keeps the Algolia indexes in step with Firestore: a plain, self-managed Cloud Functions codebase ("sync"
// in firebase.json) rather than the "Search with Algolia" Firebase Extension (Extensions are being shut down
// 2027-03-31 and can't be edited after that date).
//
// ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY come from functions/.env (Cloud
// Functions v2 loads this automatically at deploy/runtime - see
// https://firebase.google.com/docs/functions/config-env). This file is
// gitignored, same as backend/.env - the Admin API key has full write
// access to every index and must never reach client code or source
// control. This is a DIFFERENT key from ALGOLIA_SEARCH_API_KEY (search-only,
// used by the backend's AlgoliaSearchService) - never swap the two.
const appId = process.env.ALGOLIA_APP_ID;
const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
const client = appId && adminKey ? algoliasearch(appId, adminKey) : null;

async function syncToAlgolia(indexName, objectID, afterSnapshot, extraFields = {}) {
  if (!client) {
    console.error('ALGOLIA_APP_ID/ALGOLIA_ADMIN_API_KEY not set in functions/.env - skipping sync');
    return;
  }
  // slimRecord returns null for a soft-deleted document (deletedAt set) - those
  // must leave the index too, not just hard-deleted ones, or deleted customers'
  // details would stay in Algolia indefinitely.
  const record = afterSnapshot.exists ? slimRecord(indexName, objectID, afterSnapshot.data(), extraFields) : null;
  if (!record) {
    await client.deleteObject({ indexName, objectID });
    return;
  }
  // Only the fields search actually needs are sent (see ./algolia-fields.js) -
  // the backend re-fetches the authoritative Firestore document for every hit,
  // so Algolia never needs the rest.
  await client.saveObject({ indexName, body: record });
}

// Customer documents never store their own shopId as a field (tenant
// scoping is purely structural - the shops/{shopId}/customers/{id} path,
// plus a customerShopIndex lookup doc for reverse lookups by bare customer
// ID - see customer-registration.service.ts). The backend's Algolia search
// filters/scopes by shopId though (shop-scoped search, and the cross-shop
// super admin view needs to know which shop a hit belongs to), so it's
// injected here from the path wildcard, which IS always available
// regardless of what the document itself contains.
exports.syncCustomersToAlgolia = onDocumentWritten('shops/{shopId}/customers/{customerId}', async (event) => {
  await syncToAlgolia('customers', event.params.customerId, event.data.after, { shopId: event.params.shopId });
});

exports.syncShopsToAlgolia = onDocumentWritten('shops/{shopId}', async (event) => {
  await syncToAlgolia('shops', event.params.shopId, event.data.after);
});

exports.syncPromotionsToAlgolia = onDocumentWritten('promotions/{promotionId}', async (event) => {
  await syncToAlgolia('promotions', event.params.promotionId, event.data.after);
});
