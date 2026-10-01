import { type StorefrontConfig, type StorefrontFetch } from './fetch.js';
import type { ShopifyProduct, ShopifyProductDetail } from './types.js';
/**
 * What a failed Storefront call does at build time.
 * - `throw`: fail the build (right for production deploys: a thinned-out
 *   catalog that ships silently is worse than a failed deploy).
 * - `warn`: log and fall back (empty list / null), the build carries on.
 * - `silent`: fall back without logging.
 */
export type ErrorPolicy = 'throw' | 'warn' | 'silent';
export interface CatalogConfig extends StorefrontConfig {
    onError?: ErrorPolicy;
    logger?: Pick<Console, 'warn'>;
    /** Storefront search syntax applied to `products(query:)`, e.g. `NOT tag:wholesale`. */
    listingQuery?: string;
    /** Applied to every listing result and to a product's `relatedProducts`. Not applied to mocks. */
    listingFilter?: (product: ShopifyProduct) => boolean;
    /** Images per product in listings. Default 1. */
    listingImages?: number;
    /** Images on the product detail query. Default 8. */
    detailImages?: number;
    /** Collection handle behind getFeaturedProducts(). Default `featured-collection`. */
    featuredCollection?: string;
    /** If the featured collection has fewer products than this, top up from getProducts(24). Default 0 (off). */
    featuredMinimum?: number;
    /** Last step of getProductByHandle(), e.g. dropping selling-plan groups the store doesn't sell. */
    detailTransform?: (product: ShopifyProductDetail) => ShopifyProductDetail;
    /** Catalog served when `useMocks` is on. Default: demoProducts. */
    mockProducts?: ShopifyProduct[];
}
export interface Catalog {
    fetch: StorefrontFetch;
    getProducts(first?: number, sortKey?: string): Promise<ShopifyProduct[]>;
    getAllProducts(sortKey?: string): Promise<ShopifyProduct[]>;
    getCollectionProducts(handle: string, first?: number): Promise<ShopifyProduct[]>;
    /** Resolves products one handle at a time. Unfiltered: a handle you ask for is a handle you get. */
    getProductsByHandles(handles: readonly string[]): Promise<ShopifyProduct[]>;
    getProductByHandle(handle: string): Promise<ShopifyProductDetail | null>;
    getFeaturedProducts(): Promise<ShopifyProduct[]>;
}
export declare const DEFAULT_FEATURED_COLLECTION = "featured-collection";
export declare function createCatalog(config: CatalogConfig): Catalog;
export declare function formatPrice(amount: string, currency?: string): string;
