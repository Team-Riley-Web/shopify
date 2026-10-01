// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import Alpine from 'alpinejs';
import { createCartStore } from '../src/cart-store.js';
import { createSearchStore } from '../src/search-store.js';
import type { Cart } from '../src/cart.js';

// The stores only work in the UI if their methods mutate through `this`, so
// Alpine's reactive proxy sees the writes. Plain unit tests cannot tell a
// closure-based implementation from a proxy-friendly one; this can.

const cart = (n: number): Cart => ({
  id: 'c1', checkoutUrl: 'https://s.myshopify.com/checkouts/cn/x', discountCodes: [], totalQuantity: n, totalAmount: `${n}.00`,
  items: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, quantity: 1, variantId: 'v', variantTitle: '', price: '1.00',
    productTitle: '', productHandle: '', imageUrl: '', imageAlt: '', sellingPlanId: '', sellingPlanName: '' })),
});

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => localStorage.clear());

describe('stores under Alpine', () => {
  it('Alpine runs init() on registration, which loads the cart on page open', async () => {
    const api = { createCart: vi.fn(async () => cart(0)), getCart: vi.fn(), addToCart: vi.fn(), addLinesToCart: vi.fn(),
      removeFromCart: vi.fn(), updateCartItem: vi.fn(), updateCartDiscountCodes: vi.fn() } as any;
    Alpine.store('cart-init', createCartStore(api));
    await flush();
    expect(api.createCart).toHaveBeenCalledTimes(1);
    expect((Alpine.store('cart-init') as any).id).toBe('c1');
    expect(localStorage.getItem('shopify_cart_id')).toBe('c1');
  });

  it('cart mutations made through the store are seen by Alpine effects', async () => {
    const api = { createCart: vi.fn(async () => cart(0)), getCart: vi.fn(), addToCart: vi.fn(async () => cart(2)), addLinesToCart: vi.fn(),
      removeFromCart: vi.fn(), updateCartItem: vi.fn(), updateCartDiscountCodes: vi.fn() } as any;
    Alpine.store('cart', createCartStore(api));
    const store = Alpine.store('cart') as ReturnType<typeof createCartStore>;
    await flush();

    const seen: Array<[boolean, number, boolean]> = [];
    Alpine.effect(() => { seen.push([store.isOpen, store.totalQuantity, store.isLoading]); });

    await store.addItem('v', 2);
    await flush();
    expect(seen.at(-1)).toEqual([true, 2, false]);
    expect(seen.some(([, , loading]) => loading)).toBe(true);

    store.close();
    await flush(); // Alpine batches effect re-runs onto a microtask
    expect(seen.at(-1)?.[0]).toBe(false);
  });

  it('external writes (the wholesale tab pattern) reach templates too', async () => {
    const store = Alpine.store('cart') as ReturnType<typeof createCartStore>;
    const seen: string[] = [];
    Alpine.effect(() => { seen.push(store.errorMessage); });
    store.applyCart(cart(3));
    store.errorMessage = 'Wholesale minimum is 10';
    store.isOpen = true;
    await flush();
    expect(seen.at(-1)).toBe('Wholesale minimum is 10');
    expect(store.totalQuantity).toBe(3);
  });

  it('search results update reactively', async () => {
    Alpine.store('search', createSearchStore({ search: async () => [{ id: '1', title: 'Mug', handle: 'mug', price: '1', imageUrl: '', imageAlt: '', variantId: 'v' }] }));
    const store = Alpine.store('search') as ReturnType<typeof createSearchStore>;
    const counts: number[] = [];
    Alpine.effect(() => { counts.push(store.results.length); });
    store.open();
    store.query = 'mug';
    await store.doSearch();
    expect(counts.at(-1)).toBe(1);
  });
});
