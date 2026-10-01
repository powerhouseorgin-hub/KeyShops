import { Injectable } from '@nestjs/common';
import { algoliasearch, type SearchClient } from 'algoliasearch';

export interface AlgoliaSearchResult {
  // false means "couldn't actually search this index" (no credentials yet,
  // or the index doesn't exist yet because its Firebase Extension hasn't
  // finished its first backfill) - callers MUST fall back to their
  // pre-Algolia behavior in this case, since an empty `hits` here does NOT
  // mean "zero matches", it means "search didn't run". true + empty hits is
  // a genuine zero-match result, which callers should trust as-is.
  ok: boolean;
  hits: Array<{ objectID: string } & Record<string, unknown>>;
}

// Thin wrapper around Algolia's search client, shared by every Firestore
// service that has a free-text `search`/`query` gap Firestore itself can't
// fill (substring/fuzzy matching - see the "Algolia-blocked" comments in
// firestore-customer.service.ts, firestore-shop.service.ts and
// firestore-promotion.service.ts). Each of those collections is synced to
// its own same-named Algolia index by a separate "Search with Algolia"
// Firebase Extension instance (one per collection path) - this service only
// ever reads, never writes, since the Extension owns indexing.
//
// Fails soft exactly like WhatsappOtpService/WhatsappInvoiceService: if the
// app ID/API key aren't set, or an index hasn't been created/backfilled yet
// (a 404 from Algolia, not a real error), search() reports ok: false so
// every call site falls back to its pre-Algolia behavior (exact
// phone/keyNumber match, or no filtering at all) instead of silently
// returning zero results for a search that used to work.
@Injectable()
export class AlgoliaSearchService {
  private client: SearchClient | null = null;

  private getClient(): SearchClient | null {
    if (this.client) return this.client;
    const appId = process.env.ALGOLIA_APP_ID || '';
    const apiKey = process.env.ALGOLIA_SEARCH_API_KEY || '';
    if (!appId || !apiKey) return null;
    this.client = algoliasearch(appId, apiKey);
    return this.client;
  }

  get isConfigured(): boolean {
    return this.getClient() !== null;
  }

  // Returns the matching records' objectIDs (the Algolia Extension sets
  // objectID to the Firestore document ID by default) plus whatever fields
  // the caller asks for via `attributesToRetrieve` - callers re-fetch the
  // authoritative Firestore doc rather than trusting Algolia's synced copy
  // for anything beyond identifying which docs matched.
  async search(indexName: string, query: string, opts: { filters?: string; hitsPerPage?: number; attributesToRetrieve?: string[] } = {}): Promise<AlgoliaSearchResult> {
    const client = this.getClient();
    if (!client) return { ok: false, hits: [] };
    try {
      const { hits } = await client.searchSingleIndex<Record<string, unknown>>({
        indexName,
        searchParams: {
          query,
          filters: opts.filters,
          hitsPerPage: opts.hitsPerPage ?? 50,
          attributesToRetrieve: opts.attributesToRetrieve ?? ['objectID'],
        },
      });
      return { ok: true, hits: hits as Array<{ objectID: string } & Record<string, unknown>> };
    } catch (err: any) {
      // Algolia returns 404 for an index that hasn't been created yet (the
      // Extension creates it on first sync/backfill) - expected mid-rollout,
      // not worth an error-level log. Anything else is a real failure.
      if (err.status !== 404) {
        console.error(`Algolia search failed for index "${indexName}":`, err.message);
      }
      return { ok: false, hits: [] };
    }
  }
}
