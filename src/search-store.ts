import type { SearchProduct } from './cart.js';

export interface SearchStoreOptions {
  search: (query: string) => Promise<SearchProduct[]>;
  /** Results kept after the search resolves. Default: everything returned. */
  limit?: number;
  /** When set, `submitSearch()` navigates to this URL (e.g. a full results page). */
  resultsUrl?: (query: string) => string;
  /** ISO currency for formatPrice(). Default USD. */
  currency?: string;
}

/** The Alpine `$store.search` object behind the search modal. */
export function createSearchStore(options: SearchStoreOptions) {
  const currency = options.currency ?? 'USD';
  const fmt = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount) || 0);

  return {
    isOpen: false,
    query: '',
    results: [] as SearchProduct[],
    isLoading: false,

    open() {
      this.isOpen = true;
      this.query = '';
      this.results = [];
    },
    close() { this.isOpen = false; },

    submitSearch() {
      const q = this.query.trim();
      if (!q || !options.resultsUrl) return;
      window.location.href = options.resultsUrl(q);
    },

    async doSearch() {
      const q = this.query.trim();
      if (!q) { this.results = []; return; }
      this.isLoading = true;
      try {
        const results = await options.search(q);
        this.results = options.limit === undefined ? results : results.slice(0, options.limit);
      } catch {
        this.results = [];
      } finally {
        this.isLoading = false;
      }
    },

    formatPrice: fmt,
  };
}

export type SearchStore = ReturnType<typeof createSearchStore>;
