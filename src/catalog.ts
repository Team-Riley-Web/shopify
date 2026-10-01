import { createStorefrontFetch, type StorefrontConfig, type StorefrontFetch } from './fetch.js';
import { demoProducts } from './mocks.js';
import {
  collectionProductsQuery,
  productByHandleListingQuery,
  productDetailQuery,
  productsQuery,
} from './queries.js';
import type { ShopifyProduct, ShopifyProductDetail } from './types.js';

/**
 * What a failed Storefront call does at build time.
 * - `throw`: fail the build (right for production deploys: a thinned-out
 *   catalog that ships silently is worse than a failed deploy).
 * - `warn`: log and fall back (empty list / null), the build carries on.
 * - `silent`: fall back without logging.
 */
export type ErrorPolicy = 'throw' | 'warn' | 'silent';

export interface CatalogConfig extends StorefrontConfig {
  onError?: ErrorPolicy;
  logger?: Pick<Console, 'warn'>;
  /** Storefront search syntax applied to `products(query:)`, e.g. `NOT tag:wholesale`. */
  listingQuery?: string;
  /** Applied to every listing result and to a product's `relatedProducts`. Not applied to mocks. */
  listingFilter?: (product: ShopifyProduct) => boolean;
  /** Images per product in listings. Default 1. */
  listingImages?: number;
  /** Images on the product detail query. Default 8. */
  detailImages?: number;
  /** Collection handle behind getFeaturedProducts(). Default `featured-collection`. */
  featuredCollection?: string;
  /** If the featured collection has fewer products than this, top up from getProducts(24). Default 0 (off). */
  featuredMinimum?: number;
  /** Last step of getProductByHandle(), e.g. dropping selling-plan groups the store doesn't sell. */
  detailTransform?: (product: ShopifyProductDetail) => ShopifyProductDetail;
  /** Catalog served when `useMocks` is on. Default: demoProducts. */
  mockProducts?: ShopifyProduct[];
}

export interface Catalog {
  fetch: StorefrontFetch;
  getProducts(first?: number, sortKey?: string): Promise<ShopifyProduct[]>;
  getAllProducts(sortKey?: string): Promise<ShopifyProduct[]>;
  getCollectionProducts(handle: string, first?: number): Promise<ShopifyProduct[]>;
  /** Resolves products one handle at a time. Unfiltered: a handle you ask for is a handle you get. */
  getProductsByHandles(handles: readonly string[]): Promise<ShopifyProduct[]>;
  getProductByHandle(handle: string): Promise<ShopifyProductDetail | null>;
  getFeaturedProducts(): Promise<ShopifyProduct[]>;
}

export const DEFAULT_FEATURED_COLLECTION = 'featured-collection';

type ProductsPage = {
  products: {
    edges: Array<{ node: ShopifyProduct }>;
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

function mockDetail(product: ShopifyProduct): ShopifyProductDetail {
  return {
    ...product,
    descriptionHtml: `<p>${product.description}</p>`,
    priceRange: {
      ...product.priceRange,
      maxVariantPrice: product.priceRange.minVariantPrice,
    },
    images: product.images,
    variants: {
      edges: product.variants.edges.map((e) => ({
        node: { ...e.node, availableForSale: product.availableForSale },
      })),
    },
  };
}

export function createCatalog(config: CatalogConfig): Catalog {
  const fetch = createStorefrontFetch(config);
  const onError = config.onError ?? 'silent';
  const logger = config.logger ?? console;
  const listingFilter = config.listingFilter ?? (() => true);
  const featuredCollection = config.featuredCollection ?? DEFAULT_FEATURED_COLLECTION;
  const featuredMinimum = config.featuredMinimum ?? 0;
  const mocks = () => config.mockProducts ?? demoProducts;

  const PRODUCTS_QUERY = productsQuery(config.listingImages, config.listingQuery);
  const COLLECTION_QUERY = collectionProductsQuery(config.listingImages);
  const BY_HANDLE_QUERY = productByHandleListingQuery(config.listingImages);
  const DETAIL_QUERY = productDetailQuery(config.detailImages, config.listingImages);

  function handleError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (onError === 'throw') throw new Error(`${context}: ${message}`);
    if (onError === 'warn') logger.warn(`${context}:`, message);
  }

  const filterListing = (products: ShopifyProduct[]) => products.filter(listingFilter);

  async function getProducts(first = 24, sortKey = 'BEST_SELLING'): Promise<ShopifyProduct[]> {
    if (config.useMocks) return mocks().slice(0, first);

    try {
      const data = await fetch<ProductsPage>(PRODUCTS_QUERY, { first, after: null, sortKey });
      return filterListing(data.products.edges.map((e) => e.node));
    } catch (error) {
      handleError('Shopify products fetch failed', error);
      return [];
    }
  }

  async function getAllProducts(sortKey = 'BEST_SELLING'): Promise<ShopifyProduct[]> {
    if (config.useMocks) return mocks();

    const products: ShopifyProduct[] = [];
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        const data: ProductsPage = await fetch<ProductsPage>(PRODUCTS_QUERY, { first: 100, after, sortKey });
        products.push(...data.products.edges.map((e) => e.node));
        hasNextPage = data.products.pageInfo?.hasNextPage ?? false;
        after = data.products.pageInfo?.endCursor ?? null;
      } catch (error) {
        handleError('Shopify all-products fetch failed', error);
        return filterListing(products);
      }
    }

    return filterListing(products);
  }

  async function getCollectionProducts(handle: string, first = 24): Promise<ShopifyProduct[]> {
    if (config.useMocks) {
      return mocks().filter((product) => {
        const text = product.collections.edges.map(({ node }) => node.title.toLowerCase()).join(' ');
        return handle === 'featured' || handle === featuredCollection || text.includes(handle.toLowerCase());
      }).slice(0, first);
    }

    try {
      const data = await fetch<{
        collection: { products: { edges: Array<{ node: ShopifyProduct }> } } | null;
      }>(COLLECTION_QUERY, { handle, first });
      return filterListing(data.collection?.products.edges.map((e) => e.node) ?? []);
    } catch (error) {
      handleError('Shopify collection fetch failed', error);
      return [];
    }
  }

  async function getProductsByHandles(handles: readonly string[]): Promise<ShopifyProduct[]> {
    if (config.useMocks) {
      const products = mocks();
      return handles
        .map((handle) => products.find((product) => product.handle === handle))
        .filter((product): product is ShopifyProduct => Boolean(product));
    }

    const products = await Promise.all(handles.map(async (handle) => {
      try {
        const data = await fetch<{ product: ShopifyProduct | null }>(BY_HANDLE_QUERY, { handle });
        return data.product;
      } catch (error) {
        handleError(`Shopify product fetch failed for ${handle}`, error);
        return null;
      }
    }));

    return products.filter((product): product is ShopifyProduct => Boolean(product));
  }

  async function getFeaturedProducts(): Promise<ShopifyProduct[]> {
    const collectionProducts = await getCollectionProducts(featuredCollection, 24);
    if (collectionProducts.length >= featuredMinimum) return collectionProducts;

    const fallbackProducts = await getProducts(24);
    const featuredIds = new Set(collectionProducts.map((product) => product.id));
    const uniqueFallback = fallbackProducts.filter((product) => !featuredIds.has(product.id));

    return [...collectionProducts, ...uniqueFallback].slice(0, 24);
  }

  async function getProductByHandle(handle: string): Promise<ShopifyProductDetail | null> {
    if (config.useMocks) {
      const mock = mocks().find((p) => p.handle === handle);
      return mock ? mockDetail(mock) : null;
    }

    try {
      const data = await fetch<{ product: ShopifyProductDetail | null }>(DETAIL_QUERY, { handle });
      if (!data.product) return null;
      const { metafield, ...product } = data.product as ShopifyProductDetail & {
        metafield?: { references?: { edges: Array<{ node: ShopifyProduct }> } } | null;
      };
      const references = metafield?.references?.edges.map(({ node }) => node) ?? [];
      const detail: ShopifyProductDetail = { ...product, relatedProducts: filterListing(references) };
      return config.detailTransform ? config.detailTransform(detail) : detail;
    } catch (error) {
      handleError(`Shopify product detail fetch failed for ${handle}`, error);
      return null;
    }
  }

  return {
    fetch,
    getProducts,
    getAllProducts,
    getCollectionProducts,
    getProductsByHandles,
    getProductByHandle,
    getFeaturedProducts,
  };
}

export function formatPrice(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}
