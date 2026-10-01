import { cleanDomain, type StorefrontConfig } from './fetch.js';
export { cleanDomain };
export interface CartClientConfig extends StorefrontConfig {
    /** Where checkout happens. Default: `domain`. Protocol and path are stripped. */
    checkoutDomain?: string;
    /** The static storefront's own domains. Checkout must never be sent there. */
    headlessDomains?: string[];
    /** Used when `checkoutDomain` turns out to be a headless domain. Default: `domain`. */
    headlessFallbackDomain?: string;
    /** Search results returned. Default 8. */
    searchLimit?: number;
    /** Results requested from predictiveSearch (filter runs before the cap). Default: searchLimit. */
    searchFetchLimit?: number;
    /** Drop search results the store should not show (wholesale, internal test products...). */
    searchFilter?: (product: {
        title: string;
        handle: string;
        tags: string[];
    }) => boolean;
}
export interface CartLineItem {
    id: string;
    quantity: number;
    variantId: string;
    variantTitle: string;
    price: string;
    productTitle: string;
    productHandle: string;
    imageUrl: string;
    imageAlt: string;
    sellingPlanId: string;
    sellingPlanName: string;
}
export interface Cart {
    id: string;
    checkoutUrl: string;
    discountCodes: Array<{
        code: string;
        applicable: boolean;
    }>;
    totalQuantity: number;
    totalAmount: string;
    items: CartLineItem[];
}
export interface SearchProduct {
    id: string;
    title: string;
    handle: string;
    price: string;
    imageUrl: string;
    imageAlt: string;
    variantId: string;
}
export interface CartLineInput {
    merchandiseId: string;
    quantity?: number;
    sellingPlanId?: string;
}
export interface CartClient {
    createCart(): Promise<Cart>;
    getCart(cartId: string): Promise<Cart | null>;
    addToCart(cartId: string, variantId: string, quantity?: number, sellingPlanId?: string): Promise<Cart>;
    addLinesToCart(cartId: string, lines: CartLineInput[]): Promise<Cart>;
    removeFromCart(cartId: string, lineId: string): Promise<Cart>;
    updateCartItem(cartId: string, lineId: string, quantity: number): Promise<Cart>;
    updateCartDiscountCodes(cartId: string, discountCodes: string[]): Promise<Cart>;
    searchProducts(query: string): Promise<SearchProduct[]>;
    normalizeCheckoutUrl(checkoutUrl: string): string;
    parseCart(raw: any): Cart;
}
export declare function createCartClient(config: CartClientConfig): CartClient;
