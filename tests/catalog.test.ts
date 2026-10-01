import { describe, expect, it, vi } from 'vitest';
import { createCatalog, formatPrice, type CatalogConfig } from '../src/catalog.js';
import { demoProducts } from '../src/mocks.js';
import { excludeWholesale } from '../src/filters.js';
import { fakeStorefront, noSleep, product, productFixture, variantId, type RecordedCall } from './fixtures.js';

const edges = <T>(nodes: T[]) => ({ edges: nodes.map((node) => ({ node })) });
const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  products: { edges: nodes.map((node) => ({ node, cursor: 'c' })), pageInfo: { hasNextPage, endCursor } },
});

function catalogWith(respond: (call: RecordedCall) => unknown, config: Partial<CatalogConfig> = {}) {
  const store = fakeStorefront(respond);
  const catalog = createCatalog({
    domain: 'shop.myshopify.com',
    token: 'tok',
    fetchImpl: store.fetchImpl,
    sleep: noSleep,
    ...config,
  });
  return { catalog, calls: store.calls };
}

describe('getProducts', () => {
  it('returns product fields and keeps variant gids intact', async () => {
    const { catalog, calls } = catalogWith(() => page([productFixture]));
    const [first] = await catalog.getProducts();
    expect(first).toMatchObject({ id: productFixture.id, handle: 'fixture-product', availableForSale: true });
    expect(first?.priceRange.minVariantPrice).toEqual({ amount: '28.00', currencyCode: 'USD' });
    expect(first?.variants.edges[0]?.node.id).toBe(variantId);
    expect(calls[0]?.variables).toEqual({ first: 24, after: null, sortKey: 'BEST_SELLING' });
  });

  it('sends the listing query filter and image count', async () => {
    const { catalog, calls } = catalogWith(() => page([]), { listingQuery: 'NOT tag:wholesale', listingImages: 2 });
    await catalog.getProducts(5, 'TITLE');
    expect(calls[0]?.query).toContain('sortKey: $sortKey, query: "NOT tag:wholesale")');
    expect(calls[0]?.query).toContain('images(first: 2)');
    expect(calls[0]?.query).toContain('category {');
    expect(calls[0]?.variables).toMatchObject({ first: 5, sortKey: 'TITLE' });
  });

  it('omits the query argument when no listing filter is set', async () => {
    const { catalog, calls } = catalogWith(() => page([]));
    await catalog.getProducts();
    expect(calls[0]?.query).toContain('sortKey: $sortKey) {');
  });

  it('applies listingFilter', async () => {
    const wholesale = product({ id: 'w', handle: 'serum-back-bar', title: 'Serum Back Bar' });
    const { catalog } = catalogWith(() => page([productFixture, wholesale]), { listingFilter: excludeWholesale });
    expect((await catalog.getProducts()).map((p) => p.id)).toEqual([productFixture.id]);
  });
});

describe('getAllProducts', () => {
  it('follows pagination cursors 100 at a time', async () => {
    const { catalog, calls } = catalogWith((call) => (
      call.variables.after === null
        ? page([product({ id: 'a' })], true, 'cursor-1')
        : page([product({ id: 'b' })], false, null)
    ));
    expect((await catalog.getAllProducts()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(calls.map((c) => c.variables.after)).toEqual([null, 'cursor-1']);
    expect(calls[0]?.variables.first).toBe(100);
  });

  it('returns what it has when a later page fails (non-throw policy)', async () => {
    const { catalog } = catalogWith((call) => (
      call.variables.after === null ? page([product({ id: 'a' })], true, 'c1') : new Response('x', { status: 400 })
    ));
    expect((await catalog.getAllProducts()).map((p) => p.id)).toEqual(['a']);
  });
});

describe('getCollectionProducts / getFeaturedProducts', () => {
  const featured = ['one', 'two', 'three'].map((handle, i) => product({ id: `f${i}`, handle }));

  it('reads the configured featured collection', async () => {
    const { catalog, calls } = catalogWith(() => ({ collection: { products: edges(featured) } }), {
      featuredCollection: 'best-sellers',
    });
    expect((await catalog.getFeaturedProducts()).map((p) => p.handle)).toEqual(['one', 'two', 'three']);
    expect(calls[0]?.variables).toEqual({ handle: 'best-sellers', first: 24 });
  });

  it('defaults to featured-collection and does not top up when featuredMinimum is unset', async () => {
    const { catalog, calls } = catalogWith(() => ({ collection: null }));
    expect(await catalog.getFeaturedProducts()).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables.handle).toBe('featured-collection');
  });

  it('tops up a short featured collection with de-duplicated best sellers, capped at 24', async () => {
    const fallback = [featured[0]!, ...Array.from({ length: 30 }, (_, i) => product({ id: `b${i}`, handle: `b${i}` }))];
    const { catalog } = catalogWith((call) => (
      call.query.includes('GetCollectionProducts')
        ? { collection: { products: edges(featured) } }
        : page(fallback)
    ), { featuredMinimum: 4 });
    const result = await catalog.getFeaturedProducts();
    expect(result).toHaveLength(24);
    expect(result.slice(0, 4).map((p) => p.id)).toEqual(['f0', 'f1', 'f2', 'b0']);
    expect(new Set(result.map((p) => p.id)).size).toBe(24);
  });

  it('falls back to best sellers when the collection does not exist', async () => {
    const { catalog } = catalogWith((call) => (
      call.query.includes('GetCollectionProducts') ? { collection: null } : page([productFixture])
    ), { featuredMinimum: 4 });
    expect((await catalog.getFeaturedProducts()).map((p) => p.handle)).toEqual(['fixture-product']);
  });
});

describe('getProductsByHandles', () => {
  it('resolves each handle, drops missing ones, and is not filtered', async () => {
    const wholesale = product({ handle: 'back-bar', title: 'Back Bar' });
    const { catalog, calls } = catalogWith((call) => ({
      product: call.variables.handle === 'missing' ? null : call.variables.handle === 'back-bar' ? wholesale : productFixture,
    }), { listingFilter: excludeWholesale });
    const result = await catalog.getProductsByHandles(['fixture-product', 'missing', 'back-bar']);
    expect(result.map((p) => p.handle)).toEqual(['fixture-product', 'back-bar']);
    expect(calls.map((c) => c.variables.handle)).toEqual(['fixture-product', 'missing', 'back-bar']);
  });
});

describe('getProductByHandle', () => {
  const detail = {
    ...productFixture,
    descriptionHtml: '<p>x</p>',
    priceRange: { minVariantPrice: { amount: '1', currencyCode: 'USD' }, maxVariantPrice: { amount: '2', currencyCode: 'USD' } },
    metafield: { references: edges([product({ id: 'r1' }), product({ id: 'r2', title: 'Wholesale kit' })]) },
  };

  it('returns detail with filtered related products and no raw metafield', async () => {
    const { catalog, calls } = catalogWith(() => ({ product: detail }), { listingFilter: excludeWholesale, detailImages: 25 });
    const result = await catalog.getProductByHandle('fixture-product');
    expect(result?.relatedProducts?.map((p) => p.id)).toEqual(['r1']);
    expect(result).not.toHaveProperty('metafield');
    expect(calls[0]?.query).toContain('images(first: 25)');
    expect(calls[0]?.query).toContain('appName');
    expect(calls[0]?.query).toContain('SellingPlanRecurringBillingPolicy');
    expect(calls[0]?.query).toMatch(/options \{\s*name\s*values/);
  });

  it('runs detailTransform last', async () => {
    const detailTransform = vi.fn((p) => ({ ...p, title: 'transformed' }));
    const { catalog } = catalogWith(() => ({ product: detail }), { detailTransform });
    expect((await catalog.getProductByHandle('x'))?.title).toBe('transformed');
    expect(detailTransform.mock.calls[0]?.[0].relatedProducts).toHaveLength(2);
  });

  it('returns null for an unknown handle', async () => {
    const { catalog } = catalogWith(() => ({ product: null }));
    expect(await catalog.getProductByHandle('nope')).toBeNull();
  });
});

describe('error policy', () => {
  const failing = () => new Response('down', { status: 400 });

  it("'silent' (default) falls back without logging", async () => {
    const logger = { warn: vi.fn() };
    const { catalog } = catalogWith(failing, { logger });
    expect(await catalog.getProducts()).toEqual([]);
    expect(await catalog.getCollectionProducts('x')).toEqual([]);
    expect(await catalog.getProductsByHandles(['x'])).toEqual([]);
    expect(await catalog.getProductByHandle('x')).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("'warn' logs with context and falls back", async () => {
    const logger = { warn: vi.fn() };
    const { catalog } = catalogWith(failing, { logger, onError: 'warn' });
    expect(await catalog.getProductByHandle('ring')).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Shopify product detail fetch failed for ring:', 'Shopify API error: 400');
  });

  it("'throw' fails loudly with context, including mid-pagination", async () => {
    const { catalog } = catalogWith(failing, { onError: 'throw' });
    await expect(catalog.getProducts()).rejects.toThrow('Shopify products fetch failed: Shopify API error: 400');
    await expect(catalog.getAllProducts()).rejects.toThrow('Shopify all-products fetch failed');
    await expect(catalog.getCollectionProducts('x')).rejects.toThrow('Shopify collection fetch failed');
    await expect(catalog.getProductsByHandles(['h'])).rejects.toThrow('Shopify product fetch failed for h');
  });

  it("'throw' still surfaces a missing token as a build failure", async () => {
    const { catalog } = catalogWith(() => page([]), { onError: 'throw', token: '' });
    await expect(catalog.getProducts()).rejects.toThrow('Missing Shopify Storefront API token');
  });
});

describe('mock mode', () => {
  const mockConfig = { useMocks: true, token: '', domain: 'your-store.myshopify.com' };

  it('serves the demo catalog without touching the network', async () => {
    const { catalog, calls } = catalogWith(() => { throw new Error('network used'); }, mockConfig);
    expect(await catalog.getAllProducts()).toEqual(demoProducts);
    expect(await catalog.getProducts(2)).toEqual(demoProducts.slice(0, 2));
    expect(calls).toHaveLength(0);
  });

  it('serves site-provided mocks, unfiltered', async () => {
    const mocks = [product({ id: 'm1', handle: 'm1', title: 'Wholesale thing' })];
    const { catalog } = catalogWith(() => ({}), { ...mockConfig, mockProducts: mocks, listingFilter: excludeWholesale });
    expect(await catalog.getProducts()).toEqual(mocks);
  });

  it('matches collections by featured handle or collection title', async () => {
    const mocks = [
      product({ id: 'a', collections: edges([{ title: 'Vintage Millefiori', handle: 'vintage-millefiori' }]) }),
      product({ id: 'b', collections: edges([{ title: 'Pearls', handle: 'pearls' }]) }),
    ];
    const { catalog } = catalogWith(() => ({}), { ...mockConfig, mockProducts: mocks, featuredCollection: 'best-sellers' });
    expect((await catalog.getCollectionProducts('best-sellers')).map((p) => p.id)).toEqual(['a', 'b']);
    expect((await catalog.getCollectionProducts('featured')).map((p) => p.id)).toEqual(['a', 'b']);
    expect((await catalog.getCollectionProducts('vintage')).map((p) => p.id)).toEqual(['a']);
  });

  it('synthesises a product detail from a mock', async () => {
    const { catalog } = catalogWith(() => ({}), mockConfig);
    const detail = await catalog.getProductByHandle('sold-out-cap');
    expect(detail?.descriptionHtml).toBe('<p>A test-safe unavailable fixture.</p>');
    expect(detail?.priceRange.maxVariantPrice).toEqual(detail?.priceRange.minVariantPrice);
    expect(detail?.variants.edges[0]?.node.availableForSale).toBe(false);
    expect(await catalog.getProductByHandle('nope')).toBeNull();
  });

  it('resolves mock handles in order', async () => {
    const { catalog } = catalogWith(() => ({}), mockConfig);
    expect((await catalog.getProductsByHandles(['gift-card', 'nope', 'ceramic-mug'])).map((p) => p.handle))
      .toEqual(['gift-card', 'ceramic-mug']);
  });
});

describe('formatPrice', () => {
  it('formats USD by default and other currencies on request', () => {
    expect(formatPrice('28')).toBe('$28.00');
    expect(formatPrice('1234.5')).toBe('$1,234.50');
    expect(formatPrice('10', 'EUR')).toBe('€10.00');
  });
});
