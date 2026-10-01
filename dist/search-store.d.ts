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
export declare function createSearchStore(options: SearchStoreOptions): {
    isOpen: boolean;
    query: string;
    results: SearchProduct[];
    isLoading: boolean;
    open(): void;
    close(): void;
    submitSearch(): void;
    doSearch(): Promise<void>;
    formatPrice: (amount: string) => string;
};
export type SearchStore = ReturnType<typeof createSearchStore>;
