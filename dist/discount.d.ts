/** Keep only characters Shopify accepts in a discount code; cap the length. */
export declare function sanitizeDiscountCode(value: string): string;
/**
 * The code a discount link carries, in priority order: `?code=` / `?discount=`,
 * then `/discount/CODE`, then a bare single-segment path `/CODE` (what Netlify's
 * `/:discount_code` rewrite serves), then the page's own fallback.
 */
export declare function discountCodeFromUrl(url: URL, fallback?: string): string;
/**
 * Where to send the visitor after storing the code: `?redirect=` if it is on
 * this origin, else `/`. Tracking params (utm_*, fbclid...) are carried over;
 * `code`, `discount` and `redirect` are not, and params already on the target win.
 */
export declare function discountRedirectUrl(url: URL): string;
/**
 * Store the discount code for the cart store to apply, then leave the page.
 * `fallback` is the code baked into the page (the `code` prop), used when the
 * URL carries none.
 */
export declare function runDiscountRedirect(win?: Window, fallback?: string): void;
