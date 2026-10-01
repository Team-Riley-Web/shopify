import type { Cart, CartClient } from './cart.js';
export declare const CART_STORAGE_KEY = "shopify_cart_id";
export declare const DISCOUNT_STORAGE_KEY = "shopify_discount_code";
export type CartApi = Pick<CartClient, 'createCart' | 'getCart' | 'addToCart' | 'addLinesToCart' | 'removeFromCart' | 'updateCartItem' | 'updateCartDiscountCodes'>;
export interface CartStoreOptions {
    /** ISO currency for formatPrice(). Default USD. */
    currency?: string;
}
/**
 * The Alpine `$store.cart` object. Register it with
 * `Alpine.store('cart', createCartStore(cartClient))`; Alpine calls `init()`
 * itself on registration, which is what loads or creates the cart on page open.
 *
 * Methods mutate through `this` so Alpine's reactive proxy sees every change.
 * Member names are part of the public contract: templates bind to them and
 * CFC's wholesale tab drives the store from outside (`applyCart`,
 * `errorMessage`, `isOpen`, `isLoading`, `checkoutUrl`).
 */
export declare function createCartStore(api: CartApi, options?: CartStoreOptions): {
    isOpen: boolean;
    isLoading: boolean;
    id: string | null;
    items: Cart["items"];
    totalQuantity: number;
    totalAmount: string;
    checkoutUrl: string;
    errorMessage: string;
    getPendingDiscountCode(): string;
    clearPendingDiscountCode(): void;
    applyPendingDiscountCode(): Promise<void>;
    applyCart(cart: Cart): void;
    init(): Promise<void>;
    addItem(variantId: string, quantity?: number, sellingPlanId?: string): Promise<void>;
    addItems(lines: Array<{
        merchandiseId: string;
        quantity?: number;
        sellingPlanId?: string;
    }>, options?: {
        openCart?: boolean;
    }): Promise<void>;
    removeItem(lineId: string): Promise<void>;
    updateItem(lineId: string, quantity: number): Promise<void>;
    open(): void;
    close(): void;
    formatPrice: (amount: string) => string;
};
export type CartStore = ReturnType<typeof createCartStore>;
