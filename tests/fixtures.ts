import { vi } from 'vitest';
import type { ShopifyProduct } from '../src/types.js';

export const variantId = 'gid://shopify/ProductVariant/2001';

export const productFixture: ShopifyProduct = {
  id: 'gid://shopify/Product/1001',
  title: 'Fixture Product',
  handle: 'fixture-product',
  description: 'A fixture product',
  availableForSale: true,
  tags: ['Featured'],
  category: { id: 'gid://shopify/TaxonomyCategory/aa-1', name: 'Necklaces' },
  priceRange: { minVariantPrice: { amount: '28.00', currencyCode: 'USD' } },
  images: { edges: [{ node: { url: 'https://cdn.example.com/product.jpg', altText: 'Product' } }] },
  variants: { edges: [{ node: { id: variantId, title: 'Default Title', price: { amount: '28.00' } } }] },
  collections: { edges: [{ node: { title: 'Everyday', handle: 'everyday' } }] },
};

export function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return { ...productFixture, ...overrides };
}

export interface RecordedCall {
  query: string;
  variables: Record<string, any>;
}

/**
 * A fake Storefront endpoint. `respond` gets each parsed request and returns
 * the GraphQL `data` (or a Response/Error for failure cases).
 */
export function fakeStorefront(respond: (call: RecordedCall) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const call = JSON.parse(String(init.body)) as RecordedCall;
    calls.push(call);
    const result = respond(call);
    if (result instanceof Error) throw result;
    if (result instanceof Response) return result;
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

export const noSleep = async () => {};
