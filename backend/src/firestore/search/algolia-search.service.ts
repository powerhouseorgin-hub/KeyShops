import { Injectable } from '@nestjs/common';
import { algoliasearch, type SearchClient } from 'algoliasearch';

// Builds a safe Algolia facet filter ("attribute:\"value\""). Several filter values come from request
// parameters (a public `shopId` / `town` query string), and a value pasted raw into the filter string
// could carry its own syntax (`x OR shopId:y`) and widen or alter the query - so the value is always
// quoted with quotes and backslashes escaped.
export function facetFilter(attribute: string, value: string): string {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${attribute}:"${escaped}"`;
}

export interface AlgoliaSearchResult {
  // false means "couldn't actually search this index" (no credentials yet,
  // or the index doesn't exist yet because it hasn't been created / backfilled)
  // - callers MUST fall back to their exact-match behavior in this case, since an empty `hits` here does NOT
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
// its own same-named Algolia index by the sync Cloud Functions in
// backend/functions (see algolia-fields.js for what is indexed) - this
// service only ever reads, never writes, since those functions own indexing.
//
// Fails soft exactly like WhatsappOtpService/WhatsappInvoiceService: if the
// app ID/API key aren't set, or an index hasn't been created/backfilled yet
// (a 404 from Algolia, not a real error), search() reports ok: false so
// every call site falls back to its exact-match behavior (phone/keyNumber,
// or no filtering at all) instead of silently returning zero results.
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

  // Returns the matching records' objectIDs (the sync functions set
  // objectID to the Firestore document ID) plus whatever fields
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
      // Algolia returns 404 for an index that hasn't been created yet (it is
      // created on the first sync / backfill) - not worth an error-level log. Anything else is a real failure.
      if (err.status !== 404) {
        console.error(`Algolia search failed for index "${indexName}":`, err.message);
      }
      return { ok: false, hits: [] };
    }
  }
}
