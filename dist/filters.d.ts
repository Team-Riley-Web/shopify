import type { ShopifyProduct } from './types.js';
/** Case- and whitespace-insensitive tag check. */
export declare function hasTag(product: {
    tags: string[];
}, tag: string): boolean;
/**
 * Wholesale / Back Bar SKUs are published to the storefront channel so B2B
 * buyers can purchase them, which also puts them in every retail listing.
 * Matches on text (title, handle, description, tags) or on every collection
 * being a wholesale one.
 */
export declare function isWholesaleProduct(product: ShopifyProduct): boolean;
/** `listingFilter` that keeps retail products only. */
export declare const excludeWholesale: (product: ShopifyProduct) => boolean;
