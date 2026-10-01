export declare const DEFAULT_API_VERSION = "2026-01";
export declare const PLACEHOLDER_DOMAIN = "your-store.myshopify.com";
export interface StorefrontConfig {
    /** The store's myshopify domain, e.g. `rosario.myshopify.com`. */
    domain: string;
    /** Storefront API access token. */
    token: string;
    apiVersion?: string;
    /** Serve mock data and skip the domain/token guards (local + CI builds). */
    useMocks?: boolean;
    retry?: {
        attempts?: number;
        baseDelayMs?: number;
    };
    /** Defaults to the global `fetch`, looked up per call so tests can stub it late. */
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}
export type StorefrontFetch = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
export declare function storefrontUrl(domain: string, apiVersion?: string): string;
export declare function createStorefrontFetch(config: StorefrontConfig): StorefrontFetch;
