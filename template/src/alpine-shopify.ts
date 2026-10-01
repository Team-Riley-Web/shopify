import type { Alpine } from 'alpinejs';
import { createCartStore, createSearchStore } from '@team-riley/shopify';
import { cartClient, searchProducts } from './lib/cart-client';

/** Call from src/alpine.ts. Alpine runs the cart store's init() on registration. */
export function registerShopify(Alpine: Alpine) {
  Alpine.store('cart', createCartStore(cartClient));
  Alpine.store('search', createSearchStore({ search: searchProducts }));
}
