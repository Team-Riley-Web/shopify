import { describe, expect, it } from 'vitest';
import { createCartClient, type CartClientConfig } from '../src/cart.js';
import { fakeStorefront, noSleep, type RecordedCall } from './fixtures.js';

const variantId = 'gid://shopify/ProductVariant/2001';
const sellingPlanId = 'gid://shopify/SellingPlan/3001';

export function rawCart(quantity = 1, checkoutUrl = 'https://shop.myshopify.com/checkouts/cn/test') {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl,
    discountCodes: [],
    totalQuantity: quantity,
    lines: {
      edges: quantity > 0 ? [{
        node: {
          id: 'gid://shopify/CartLine/line-1',
          quantity,
          sellingPlanAllocation: { sellingPlan: { id: sellingPlanId, name: 'Monthly' } },
          merchandise: {
            id: variantId,
            title: 'Default Title',
            price: { amount: '28.00', currencyCode: 'USD' },
            product: {
              title: 'Ceramic Mug',
              handle: 'ceramic-mug',
              images: { edges: [{ node: { url: 'https://cdn.example.com/mug.jpg', altText: 'Product image' } }] },
            },
          },
        },
      }] : [],
    },
    cost: { totalAmount: { amount: String(28 * quantity) + '.00', currencyCode: 'USD' } },
  };
}

function clientWith(respond: (call: RecordedCall) => unknown, config: Partial<CartClientConfig> = {}) {
  const store = fakeStorefront(respond);
  const client = createCartClient({
    domain: 'shop.myshopify.com',
    token: 'tok',
    fetchImpl: store.fetchImpl,
    sleep: noSleep,
    ...config,
  });
  return { client, calls: store.calls, fetchImpl: store.fetchImpl };
}

const errors = (message: string) => new Response(JSON.stringify({ errors: [{ message }] }), { status: 200 });

describe('cart mutations', () => {
  it('creates a cart and exposes checkoutUrl', async () => {
    const { client } = clientWith(() => ({ cartCreate: { cart: rawCart(0) } }));
    const cart = await client.createCart();
    expect(cart.id).toBe('gid://shopify/Cart/cart-1');
    expect(cart.checkoutUrl).toBe('https://shop.myshopify.com/checkouts/cn/test');
    expect(cart.items).toEqual([]);
  });

  it('surfaces API errors', async () => {
    const { client } = clientWith(() => errors('Cart create failed'));
    await expect(client.createCart()).rejects.toThrow('Cart create failed');
  });

  it('fails fast in the browser: no retry on a 503', async () => {
    const { client, fetchImpl } = clientWith(() => new Response('x', { status: 503 }));
    await expect(client.createCart()).rejects.toThrow('Shopify API error: 503');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null for an unknown cart', async () => {
    const { client } = clientWith(() => ({ cart: null }));
    expect(await client.getCart('gone')).toBeNull();
  });

  it('adds a line, with and without a selling plan', async () => {
    const { client, calls } = clientWith(() => ({ cartLinesAdd: { cart: rawCart(2) } }));
    await client.addToCart('cart-1', variantId, 2);
    await client.addToCart('cart-1', variantId, 1, sellingPlanId);
    expect(calls[0]?.variables).toEqual({ cartId: 'cart-1', lines: [{ merchandiseId: variantId, quantity: 2 }] });
    expect(calls[1]?.variables.lines).toEqual([{ merchandiseId: variantId, quantity: 1, sellingPlanId }]);
  });

  it('adds several lines in one mutation, dropping lines with no merchandise', async () => {
    const { client, calls } = clientWith(() => ({ cartLinesAdd: { cart: rawCart(3) } }));
    await client.addLinesToCart('cart-1', [
      { merchandiseId: variantId },
      { merchandiseId: 'v2', quantity: 2, sellingPlanId },
      { merchandiseId: '' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables.lines).toEqual([
      { merchandiseId: variantId, quantity: 1 },
      { merchandiseId: 'v2', quantity: 2, sellingPlanId },
    ]);
  });

  it('returns the current cart when no line is valid, and throws if that cart is gone', async () => {
    const { client, calls } = clientWith(() => ({ cart: rawCart(1) }));
    expect((await client.addLinesToCart('cart-1', [{ merchandiseId: '' }])).totalQuantity).toBe(1);
    expect(calls[0]?.query).toContain('getCart');

    const gone = clientWith(() => ({ cart: null })).client;
    await expect(gone.addLinesToCart('cart-1', [])).rejects.toThrow('Cart unavailable');
  });

  it('updates and removes lines', async () => {
    const { client, calls } = clientWith((call) => (
      call.query.includes('cartLinesUpdate') ? { cartLinesUpdate: { cart: rawCart(3) } } : { cartLinesRemove: { cart: rawCart(0) } }
    ));
    expect((await client.updateCartItem('cart-1', 'line-1', 3)).totalQuantity).toBe(3);
    expect(calls[0]?.variables).toEqual({ cartId: 'cart-1', lines: [{ id: 'line-1', quantity: 3 }] });
    expect((await client.removeFromCart('cart-1', 'line-1')).items).toEqual([]);
    expect(calls[1]?.variables).toEqual({ cartId: 'cart-1', lineIds: ['line-1'] });
  });

  it('updates discount codes and surfaces user errors', async () => {
    const applied = { ...rawCart(1), discountCodes: [{ code: 'WELCOME', applicable: true }] };
    const { client, calls } = clientWith(() => ({ cartDiscountCodesUpdate: { cart: applied, userErrors: [] } }));
    expect((await client.updateCartDiscountCodes('cart-1', ['WELCOME'])).discountCodes).toEqual([{ code: 'WELCOME', applicable: true }]);
    expect(calls[0]?.variables).toEqual({ cartId: 'cart-1', discountCodes: ['WELCOME'] });

    const bad = clientWith(() => ({ cartDiscountCodesUpdate: { cart: applied, userErrors: [{ field: ['x'], message: 'Code is invalid' }] } })).client;
    await expect(bad.updateCartDiscountCodes('cart-1', ['NOPE'])).rejects.toThrow('Code is invalid');
  });
});

describe('parseCart', () => {
  it('flattens totals and line items', () => {
    const { client } = clientWith(() => ({}));
    const cart = client.parseCart(rawCart(2));
    expect(cart).toMatchObject({ totalQuantity: 2, totalAmount: '56.00', discountCodes: [] });
    expect(cart.items[0]).toEqual({
      id: 'gid://shopify/CartLine/line-1', quantity: 2, variantId, variantTitle: 'Default Title', price: '28.00',
      productTitle: 'Ceramic Mug', productHandle: 'ceramic-mug', imageUrl: 'https://cdn.example.com/mug.jpg',
      imageAlt: 'Product image', sellingPlanId, sellingPlanName: 'Monthly',
    });
  });
});

describe('normalizeCheckoutUrl', () => {
  const headless = { checkoutDomain: 'shop.myshopify.com', headlessDomains: ['www.example.com'] };

  it('moves checkout off the static site host onto the checkout domain', () => {
    const { client } = clientWith(() => ({}), headless);
    expect(client.normalizeCheckoutUrl('https://www.example.com/checkouts/cn/test?key=abc'))
      .toBe('https://shop.myshopify.com/checkouts/cn/test?key=abc');
  });

  it('rewrites generated /cart/c/ URLs to checkout paths, on any host', () => {
    const { client } = clientWith(() => ({}), headless);
    expect(client.normalizeCheckoutUrl('https://www.example.com/cart/c/tok?_s=s&key=abc'))
      .toBe('https://shop.myshopify.com/checkouts/cn/tok?_s=s&key=abc');
    expect(client.normalizeCheckoutUrl('https://shop.myshopify.com/cart/c/tok?key=abc'))
      .toBe('https://shop.myshopify.com/checkouts/cn/tok?key=abc');
  });

  it('leaves a myshopify checkout URL alone', () => {
    const { client } = clientWith(() => ({}), headless);
    const url = 'https://other.myshopify.com/checkouts/cn/x?key=1#h';
    expect(client.normalizeCheckoutUrl(url)).toBe(url);
  });

  it('uses a custom checkout domain, stripping protocol and path', () => {
    const { client } = clientWith(() => ({}), { checkoutDomain: 'https://Checkout.Example.com/x' });
    expect(client.normalizeCheckoutUrl('https://www.example.com/checkouts/cn/t')).toBe('https://checkout.example.com/checkouts/cn/t');
  });

  it('never sends checkout to a headless (static) domain: falls back to the store domain', () => {
    const { client } = clientWith(() => ({}), {
      checkoutDomain: 'https://www.example.com/',
      headlessDomains: ['https://WWW.example.com', 'example.com'],
    });
    expect(client.normalizeCheckoutUrl('https://www.example.com/cart/c/tok?key=abc'))
      .toBe('https://shop.myshopify.com/checkouts/cn/tok?key=abc');
  });

  it('uses headlessFallbackDomain when one is given', () => {
    const { client } = clientWith(() => ({}), {
      checkoutDomain: 'www.example.com',
      headlessDomains: ['www.example.com'],
      headlessFallbackDomain: 'real-store.myshopify.com',
    });
    expect(client.normalizeCheckoutUrl('https://www.example.com/checkouts/cn/t')).toBe('https://real-store.myshopify.com/checkouts/cn/t');
  });

  it('defaults the checkout domain to the store domain', () => {
    const { client } = clientWith(() => ({}));
    expect(client.normalizeCheckoutUrl('https://www.example.com/checkouts/cn/t')).toBe('https://shop.myshopify.com/checkouts/cn/t');
  });

  it('passes through empty and unparseable values', () => {
    const { client } = clientWith(() => ({}));
    expect(client.normalizeCheckoutUrl('')).toBe('');
    expect(client.normalizeCheckoutUrl('not a url')).toBe('not a url');
  });
});

describe('searchProducts', () => {
  const hit = (title: string, handle: string, tags: string[] = []) => ({
    id: `gid://shopify/Product/${handle}`, title, handle, tags,
    priceRange: { minVariantPrice: { amount: '10.00', currencyCode: 'USD' } },
    images: { edges: [{ node: { url: `https://cdn.example.com/${handle}.jpg`, altText: title } }] },
    variants: { edges: [{ node: { id: `v-${handle}` } }] },
  });
  const many = Array.from({ length: 12 }, (_, i) => hit(`Item ${i}`, `item-${i}`));

  it('maps predictive search results and caps them at 8 by default', async () => {
    const { client, calls } = clientWith(() => ({ predictiveSearch: { products: many } }));
    const results = await client.searchProducts('item');
    expect(results).toHaveLength(8);
    expect(results[0]).toEqual({
      id: 'gid://shopify/Product/item-0', title: 'Item 0', handle: 'item-0', price: '10.00',
      imageUrl: 'https://cdn.example.com/item-0.jpg', imageAlt: 'Item 0', variantId: 'v-item-0',
    });
    expect(calls[0]?.query).toContain('limit: 8');
    expect(calls[0]?.query).toMatch(/id title handle tags/);
    expect(calls[0]?.variables).toEqual({ query: 'item' });
  });

  it('honours searchLimit and searchFetchLimit', async () => {
    const { client, calls } = clientWith(() => ({ predictiveSearch: { products: many } }), { searchLimit: 3 });
    expect(await client.searchProducts('x')).toHaveLength(3);
    expect(calls[0]?.query).toContain('limit: 3');

    const wide = clientWith(() => ({ predictiveSearch: { products: many } }), { searchLimit: 8, searchFetchLimit: 10 });
    await wide.client.searchProducts('x');
    expect(wide.calls[0]?.query).toContain('limit: 10');
  });

  it('filters before capping, so hidden results do not eat the limit', async () => {
    const products = [hit('Back Bar Serum', 'serum-bb', ['wholesale']), ...many];
    const { client } = clientWith(() => ({ predictiveSearch: { products } }), {
      searchFetchLimit: 10,
      searchFilter: (p) => !p.tags.includes('wholesale'),
    });
    const results = await client.searchProducts('x');
    expect(results).toHaveLength(8);
    expect(results.map((r) => r.handle)).not.toContain('serum-bb');
  });

  it('tolerates a missing predictiveSearch payload and products without images or variants', async () => {
    const bare = { ...hit('Bare', 'bare'), images: { edges: [] }, variants: { edges: [] }, tags: undefined };
    const { client } = clientWith(() => ({ predictiveSearch: { products: [bare] } }), { searchFilter: (p) => p.tags.length === 0 });
    expect(await client.searchProducts('x')).toEqual([
      { id: 'gid://shopify/Product/bare', title: 'Bare', handle: 'bare', price: '10.00', imageUrl: '', imageAlt: '', variantId: '' },
    ]);
    const empty = clientWith(() => ({ predictiveSearch: null })).client;
    expect(await empty.searchProducts('x')).toEqual([]);
  });
});
