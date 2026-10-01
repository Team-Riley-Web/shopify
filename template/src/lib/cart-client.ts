// Browser-side cart + search. Only PUBLIC_ vars may be read here: this file is
// bundled into the client, so anything it references ships to every visitor.
import { createCartClient, envList } from '@team-riley/shopify';

export type { Cart, CartLineItem, CartLineInput, SearchProduct } from '@team-riley/shopify';

const env = import.meta.env;

export const cartClient = createCartClient({
  domain: env.PUBLIC_SHOPIFY_STORE_DOMAIN ?? '',
  token: env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '',
  apiVersion: env.PUBLIC_SHOPIFY_API_VERSION ?? '2026-01',
  useMocks: env.PUBLIC_SHOPIFY_USE_MOCKS === 'true',
  checkoutDomain: env.PUBLIC_SHOPIFY_CHECKOUT_DOMAIN,
  headlessDomains: envList(env, ['PUBLIC_HEADLESS_DOMAINS']),
});

export const {
  createCart,
  getCart,
  addToCart,
  addLinesToCart,
  removeFromCart,
  updateCartItem,
  updateCartDiscountCodes,
  searchProducts,
  normalizeCheckoutUrl,
  parseCart,
} = cartClient;
