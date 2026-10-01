# @team-riley/shopify

The headless-Shopify engine behind Team Riley's Astro storefronts: Storefront
API client, catalog queries, cart, predictive search, discount links and
subscription helpers. Pure TypeScript, no runtime dependencies, no framework
dependency: it runs on Astro 6 and 7 alike.

It holds no secrets and no store-specific logic. Each site keeps a thin
`src/lib/shopify.ts` / `src/lib/cart-client.ts` that reads its own env, calls
the factories here, and adds anything specific to that store.

## Install

```sh
npm i github:Team-Riley-Web/shopify#v1.0.0
```

Pin to a tag. Netlify installs it with plain `npm ci`, no auth needed.

## Use

```ts
// src/lib/shopify.ts (build-time: catalog)
import { readEnv, envValue, envFlag, createCatalog, excludeWholesale } from '@team-riley/shopify';
export { formatPrice, type ShopifyProduct, type ShopifyProductDetail } from '@team-riley/shopify';

const env = readEnv(import.meta.env);
const catalog = createCatalog({
  domain: envValue(env, ['SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STORE_DOMAIN']),
  token: envValue(env, ['SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN']),
  useMocks: envFlag(env, ['SHOPIFY_USE_MOCKS', 'PUBLIC_SHOPIFY_USE_MOCKS']),
  onError: env.NETLIFY === 'true' ? 'throw' : 'warn',
  listingQuery: 'NOT tag:wholesale',
  listingFilter: excludeWholesale,
});
export const { getProducts, getAllProducts, getCollectionProducts, getProductsByHandles, getProductByHandle, getFeaturedProducts } = catalog;
```

```ts
// src/lib/cart-client.ts (browser: cart + search). Only PUBLIC_ vars here.
import { createCartClient, envList } from '@team-riley/shopify';
const env = import.meta.env;
export const cartClient = createCartClient({
  domain: env.PUBLIC_SHOPIFY_STORE_DOMAIN,
  token: env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN,
  checkoutDomain: env.PUBLIC_SHOPIFY_CHECKOUT_DOMAIN,
  headlessDomains: envList(env, ['PUBLIC_HEADLESS_DOMAINS']),
});
export const { searchProducts } = cartClient;
```

```ts
// src/alpine.ts
import { createCartStore, createSearchStore } from '@team-riley/shopify';
import { cartClient, searchProducts } from './lib/cart-client';
export default (Alpine) => {
  Alpine.store('cart', createCartStore(cartClient));   // Alpine calls init() for you
  Alpine.store('search', createSearchStore({ search: searchProducts }));
};
```

```astro
---
// src/components/DiscountRedirect.astro
const { code = '' } = Astro.props;
---
<div id="discount-redirect" data-code={code}></div>
<script>
  import { runDiscountRedirect } from '@team-riley/shopify';
  runDiscountRedirect(window, document.getElementById('discount-redirect')?.dataset.code ?? '');
</script>
```

Rule of thumb: the package never reads env vars. Vite only inlines
`import.meta.env` inside your own source, so pass values in.

## Upgrade a site

```sh
npm i github:Team-Riley-Web/shopify#v1.1.0
npm run test:unit && npm run test:e2e
```

Read `CHANGELOG.md` for the tag you are moving to. Breaking changes bump the
major version.

## Release

```sh
# bump "version" in package.json and add a CHANGELOG entry, then:
npm run check          # typecheck, tests, build, and dist/ must be committed
git commit -am "release: v1.1.0"
git tag v1.1.0 && git push && git push --tags
```

`dist/` is committed on purpose: a git dependency has no build step, so what is
in the repo is what sites install. CI fails if `dist/` is stale. Never add a
`prepare` or `prepack` script; npm would try to build during every site install.

## Develop

```sh
npm ci
npm test          # vitest
npm run check     # what CI runs
```
