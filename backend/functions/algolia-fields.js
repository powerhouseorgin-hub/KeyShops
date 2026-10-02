// Single source of truth for what each Algolia index is allowed to hold. Used by
// the Firestore->Algolia sync Cloud Functions (./index.js) AND by the re-index
// script (backend/scripts/reindex-algolia.ts), so a live write and a full
// rebuild always produce identical records.
//
// Why an allowlist instead of copying the whole document: Algolia is a third
// party. Search only needs the fields a user can type a query against plus the
// fields it filters by - the backend re-fetches the authoritative Firestore
// document for every hit (see AlgoliaSearchService's callers), so nothing else
// ever needs to leave Firestore. Before this, every customer record (GPS
// coordinates, photo/map links, bill details, the encrypted ID number) and
// every shop record (owner Aadhaar ciphertext, GPS, referral codes) was copied
// into Algolia and was even searchable as free text.
//
// Searchable fields mirror what the original Postgres search matched
// (customer.service.ts / shop.service.ts / promotion.service.ts `contains`
// clauses).
const INDEXES = {
  customers: {
    // shopId is not stored on customer docs (tenant scoping is the Firestore
    // path) - the sync function injects it from the path wildcard.
    searchable: ['name', 'phone', 'keyNumber', 'vehicleNumber', 'capturedAddress', 'address'],
    filterOnly: ['shopId'],
  },
  shops: {
    searchable: ['name', 'companyDetails', 'town', 'district'],
    filterOnly: ['town', 'district'],
  },
  promotions: {
    searchable: ['title', 'description', 'productType'],
    filterOnly: ['shopId'],
  },
};

function allowedFields(indexName) {
  const cfg = INDEXES[indexName];
  if (!cfg) throw new Error(`Unknown Algolia index "${indexName}"`);
  return [...new Set([...cfg.searchable, ...cfg.filterOnly])];
}

// Index settings applied before a full rebuild: only the allowlisted text
// fields are searchable, and the filter fields are declared so Algolia accepts
// `filters: "shopId:..."` (it rejects filters on undeclared attributes).
function indexSettings(indexName) {
  const cfg = INDEXES[indexName];
  return {
    searchableAttributes: cfg.searchable,
    attributesForFaceting: cfg.filterOnly.map((a) => `filterOnly(${a})`),
  };
}

// Builds the slim Algolia record for a Firestore document, or null when the
// document must NOT be in the index (soft-deleted).
function slimRecord(indexName, objectID, data, extraFields = {}) {
  if (!data || data.deletedAt) return null;
  const record = { objectID };
  for (const field of allowedFields(indexName)) {
    if (data[field] !== undefined && data[field] !== null) record[field] = data[field];
  }
  return { ...record, ...extraFields };
}

module.exports = { INDEXES, allowedFields, indexSettings, slimRecord };
