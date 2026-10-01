// Storefront wrapper (build-time only: nothing bundled for the browser imports
// this). The engine lives in @team-riley/shopify; this file reads this site's
// env, configures it, and is where store-specific catalog rules go.
import { createCatalog, envFlag, envValue, readEnv, PLACEHOLDER_DOMAIN } from '@team-riley/shopify';

export { formatPrice } from '@team-riley/shopify';
export type { ShopifyProduct, ShopifyProductDetail } from '@team-riley/shopify';

const env = readEnv(import.meta.env);

const USE_MOCKS = envFlag(env, ['SHOPIFY_USE_MOCKS', 'PUBLIC_SHOPIFY_USE_MOCKS']);

// A deploy must not ship a silently thinned-out catalog, so Shopify errors fail
// the build on Netlify/CI; locally they warn and the build goes on.
const STRICT = !USE_MOCKS && (env.NETLIFY === 'true' || env.CI === 'true' || env.SHOPIFY_STRICT_FETCH === 'true');

export const SHOPIFY_DOMAIN = envValue(env, ['SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STORE_DOMAIN'], PLACEHOLDER_DOMAIN, [PLACEHOLDER_DOMAIN]);
export const FEATURED_COLLECTION_HANDLE = 'featured-collection';

const catalog = createCatalog({
  domain: SHOPIFY_DOMAIN,
  token: envValue(env, ['SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN']),
  apiVersion: envValue(env, ['SHOPIFY_API_VERSION', 'PUBLIC_SHOPIFY_API_VERSION'], '2026-01'),
  useMocks: USE_MOCKS,
  onError: STRICT ? 'throw' : 'warn',
  featuredCollection: FEATURED_COLLECTION_HANDLE,
});

export const shopifyFetch = catalog.fetch;
export const {
  getProducts,
  getAllProducts,
  getCollectionProducts,
  getProductsByHandles,
  getProductByHandle,
  getFeaturedProducts,
} = catalog;
