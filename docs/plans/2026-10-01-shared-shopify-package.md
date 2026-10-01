# Shared Shopify Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the headless-Shopify engine (Storefront API client, catalog, cart, discount links, subscriptions) out of the three copies it lives in today into one versioned package, `@team-riley/shopify`, then move Rosario and CFC onto it and make `starter` + the package the way new Shopify sites are made.

**Architecture:** The package is pure TypeScript with zero runtime dependencies and **never reads env vars** — every site keeps a thin `src/lib/shopify.ts` / `src/lib/cart-client.ts` that reads its own `import.meta.env`, calls the package's `create*()` factories, re-exports the result, and adds store-specific logic (Rosario's shop sort, CFC's hidden/unlisted products, wholesale, travel-size cadence). Because the wrappers keep the same file paths and export names, no component, page, or design file in either site changes. The package ships compiled `dist/` committed to git and is installed as a git dependency pinned to a tag.

**Tech Stack:** TypeScript 5/6 (`tsc` build, ESM), Vitest 4 + jsdom, GitHub Actions, npm git dependencies, Astro 6/7 sites on Netlify.

**Spec:** This document (the design discussion in the session is summarised in "Background" below).

## Status (2026-10-01, end of day)

| Task | State | Evidence |
|---|---|---|
| 1–9 package v1.0.0 | done | 140 tests, `npm run check` green, CI green on `main` and `v1.0.0`; public repo `Team-Riley-Web/shopify` |
| 10 Rosario baseline | done | e2e 4/7 → 7/7 on `master` (version-agnostic mocks), separate commit |
| 11 Rosario migration | PR open | [rosario#3](https://github.com/Team-Riley-Web/rosario/pull/3): unit 48/48, e2e 7/7, real-catalog build identical except `discount/index.html` |
| 12 CFC baseline + migration | PR open | [cfc#3](https://github.com/TheRileyBird/cfc/pull/3): unit 88/88, e2e 17/17 (was 15/17), real-catalog build identical (0 changed), leak check clean |
| 13 template + init | done | `template/` (17 files), `lib/init.mjs` + `bin`, 4 init tests |
| 14 scaffold verification + v1.1.0 + starter README | done | `scripts/verify-scaffold.sh v1.1.1` passes installing from the GitHub tag; [starter#1](https://github.com/Team-Riley-Web/starter/pull/1) |
| 15 final review | done | Independent reviewer: both site PRs safe to merge; template fixes + hardening shipped as v1.1.1 (see CHANGELOG) |

Discoveries during execution (beyond the plan review):
- Parallel shell calls share one working directory: an `npm install -D alpinejs` meant for the package landed in `cfc` and was reverted with `git checkout` + `npm ci`. Everything after that used subshells and absolute paths.
- Bundled module scripts run after the Alpine `page.js` module, so the discount page now boots the cart store before redirecting. The e2e `getCart` mock returned a 1-item cart for a cart nobody had added to, which made the (intended) clear-once-applied logic remove the code; both specs now restore the cart as created. A `<noscript>` refresh fallback was added to the discount page.
- Both live sites' e2e cart tests had been failing on `master` since the API version bump; two further CFC test bugs were masked behind that.
- Netlify install proven with `GIT_SSH_COMMAND=false npm ci` (npm fetches the pinned commit's tarball over HTTPS).
- Netlify CLI is not linked for either site, so deploy-preview env scoping was not checked; the real-catalog local build comparison replaced that check.

## Background (what we found, 2026-10-01)

- Three copies of the engine: `starter-shopify`, `rosario`, `cfc`. They have diverged: 294 / 349 changed lines in `shopify.ts` alone.
- Each copy carries fixes the others lack:
  - **Rosario:** retry on transient Storefront errors (429/5xx/network), strict errors on Netlify, placeholder-domain guard, API `2026-01`, `category` + `options` fields, featured-collection fallback.
  - **CFC:** API `2026-01`, selling-plan `billingPolicy` + `appName`, subscription-group filtering, `formatSellingPlanInterval`, pending-discount clearing fix (a one-off code no longer reattaches to every later cart), search filtering.
  - **starter-shopify:** none — it is the oldest.
- **Pre-existing breakage:** Rosario (3) and CFC (2) e2e cart tests fail on `master` today. The specs intercept `**/api/2024-01/graphql.json` but both sites call `2026-01`, so the mocked Storefront is never hit. Nobody noticed when the version was bumped. This is exactly the drift a shared package prevents.
- Baseline unit tests: starter-shopify 33/33, rosario 45/45, cfc 83/83 pass. e2e: starter-shopify 6/6, rosario 4/7, cfc 15/17.
- `starter` is Astro 7 + Tailwind 4. Rosario is Astro 7 + TW3; CFC is Astro 6 + TW3. Framework upgrades of the live sites are **out of scope** — the package has no framework dependency, so it works on all of them.
- CFC side branches (`design-2`, `design-3`, `wholesale-dev`) do not touch `src/lib`, so the migration will not conflict with them.

## Decisions (confirmed with user)

- Package repo: **new public** `github.com/Team-Riley-Web/shopify`, installed as `"@team-riley/shopify": "github:Team-Riley-Web/shopify#vX.Y.Z"`. Public means zero Netlify auth setup; it holds no secrets or store data.
- Live sites: **branch + PR**; the user merges. Nothing is pushed to `master`.
- `starter-shopify`: left untouched; user archives it after the migration is verified.

## Global Constraints

- Package has **no runtime `dependencies`**. No `import.meta.env`, no `process.env` anywhere in `src/` of the package.
- Default Storefront API version: `2026-01`.
- Public API names are frozen once v1.0.0 is tagged; breaking changes require a major version.
- `dist/` is committed and must equal a fresh `npm run build` (CI-enforced).
- Site migrations must be **behaviour-preserving**: same exports from the site's `src/lib/*` paths; mock build output (`dist/` HTML) identical before vs after, apart from hashed asset filenames.
- Two deliberate behaviour changes are allowed and must be called out in the PRs: (1) retries on transient errors (all sites), (2) CFC's pending-discount clearing fix (Rosario gains it).
- Server-only values (`SHOPIFY_STOREFRONT_TOKEN` non-public copy, `SHOPIFY_UNLISTED_PRODUCT_HANDLES`) must never appear in browser bundles.
- No push to `master` of `rosario` or `cfc`.

## Review Focus

1. **Server-only env inlined into the browser.** CFC's unlisted handles are deliberately read build-side only. The migration must not route them through a module the client imports. Test: build CFC with `SHOPIFY_UNLISTED_PRODUCT_HANDLES=zz-secret-handle` and assert `grep -r zz-secret-handle dist/_astro` finds nothing (Task 12).
2. **Missing/placeholder env on a real deploy.** Rosario must still fail the Netlify build loudly when Shopify errors; CFC must keep its current (warn-and-continue) behaviour. Test: package unit tests for `onError: 'throw' | 'warn'` + Rosario wrapper test asserting strict mode when `NETLIFY=true` (Tasks 3, 10).
3. **Git dependency install on Netlify.** `npm ci` must install the package from the lockfile with no build step and no auth. Test: `npm ci` from a clean clone of each site + Netlify deploy preview green (Tasks 11, 13).
4. **Real catalog differs from the mocks.** Mock-build equality does not prove live data renders the same. Test: compare the deploy preview's `sitemap-0.xml` URL set and three product pages against production (Tasks 11, 13).
5. **Upgrading a site later.** A future `npm i github:Team-Riley-Web/shopify#v1.1.0` must be the whole upgrade. Test: the scaffold verification installs the package by tag from GitHub, not by local path (Task 15).

---

## Plan review outcomes (2026-10-01, independent reviewer)

Accepted and folded into the tasks below (these override any conflicting step text):

1. `readEnv` may read `process.env` (runtime, safe in the browser behind a guard); the no-env test forbids `import.meta.env` everywhere and `process.env` outside `src/env.ts`.
2. `DiscountRedirect` becomes a bundled module script reading the optional code from `data-code`. This changes the discount page's HTML (expected diff, called out); the e2e discount tests are the proof for that page. Sanitising keeps `[A-Za-z0-9_-]` only.
3. `createCartClient` gets `headlessFallbackDomain` (default `domain`). CFC passes `'cfcskincare.myshopify.com'` (its current constant); Rosario uses the default and its placeholder-asserting test is updated (bug fix, called out).
4. **Real-data equivalence**: the Storefront token is public (`PUBLIC_SHOPIFY_STOREFRONT_TOKEN` ships in each live site's JS). Read it, plus the live API version, from the production bundle; build each site against the real catalog before and after migration back to back and `diff -r dist/` (normalised). This replaces mock-only proof as the main equivalence check; mock diff stays as a secondary check.
5. `getProductsByHandles` and mock paths stay unfiltered (already implemented that way).
6. Site wrappers copy their current env-read lines verbatim (`??` semantics, PUBLIC-first order in cart-client); the package normalises domains with `cleanDomain`.
7. Freeze `CartStore` member names that CFC's wholesale tab duck-types (`applyCart`, `errorMessage`, `isOpen`, `items`, `id`) with a contract test.
8. Store tests run inside real Alpine (`alpinejs` dev dep, jsdom) to prove reactivity through `this`.
9. `fetch` resolved per call (already implemented).
10. Leak check greps all of `dist/`, asserts `GetProducts` is absent from `dist/_astro` (catalog code not in browser), and a site test asserts `cart-client.ts`/`entrypoint.ts` never import `lib/shopify`.
11. dist freshness: `test -z "$(git status --porcelain dist)"`; never add `prepare`/`prepack`.
12. Install check runs with `GIT_SSH_COMMAND=false` (no SSH keys, like Netlify); the lockfile diff must add only the package.
13. Check deploy-preview env scoping before relying on previews; compare sitemap path sets only.
- Minor: e2e `.includes('/api/2024-01/…')` matchers also fixed; `exports` gets a `default` condition; template/`init` (Tasks 13–14) ship as v1.1.0 after the site PRs.

## File structure (package repo `~/Sites/shopify`)

```
package.json            name @team-riley/shopify, exports map, bin team-riley-shopify
tsconfig.json           strict, ESM, declaration, outDir dist
vitest.config.ts        jsdom env for store/discount tests
src/
  index.ts              re-exports everything below
  env.ts                readEnv(), envValue(), envList(), envFlag() — pure helpers over a passed-in record
  fetch.ts              createStorefrontFetch(): retry, strict/warn, token/domain guards
  types.ts              ShopifyProduct, ShopifyProductDetail, selling-plan types
  queries.ts            productListingFields(), PRODUCT_DETAIL_QUERY builder
  catalog.ts            createCatalog(): getProducts/getAllProducts/getCollectionProducts/
                        getProductsByHandles/getProductByHandle/getFeaturedProducts, formatPrice
  filters.ts            excludeWholesale, hasTag helpers
  selling-plans.ts      formatSellingPlanInterval, planIntervalMonths, filterSellingPlanGroups
  cart.ts               createCartClient(): cart mutations, parseCart, normalizeCheckoutUrl, searchProducts
  cart-store.ts         createCartStore(api)
  search-store.ts       createSearchStore({ search, limit, resultsUrl })
  discount.ts           sanitizeDiscountCode, discountCodeFromUrl, discountRedirectUrl, runDiscountRedirect
  mocks.ts              demoProducts (generic mock catalog)
tests/                  one test file per src module
template/               files `init` copies into a fresh starter copy (Task 14)
bin/init.mjs            the scaffolder
scripts/verify-scaffold.sh
.github/workflows/ci.yml
README.md, CHANGELOG.md
```

Site side (Rosario and CFC each): `src/lib/shopify.ts` and `src/lib/cart-client.ts` become thin wrappers; `src/lib/cart-store.ts` becomes a one-line re-export; `src/components/DiscountRedirect.astro` imports `runDiscountRedirect`. Everything else untouched.

---

### Task 1: Package scaffold

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`, `README.md`, `CHANGELOG.md`.

**Interfaces:** Produces the `exports` map: `"."` → `dist/index.js` (types `dist/index.d.ts`). Subpath exports are not used (one entry keeps tree-shaking simple; every module is side-effect free, `"sideEffects": false`).

- [ ] Step 1: `package.json`

```json
{
  "name": "@team-riley/shopify",
  "version": "1.0.0",
  "description": "Headless Shopify engine for Team Riley Astro storefronts",
  "type": "module",
  "sideEffects": false,
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist", "template", "bin"],
  "bin": { "team-riley-shopify": "./bin/init.mjs" },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "check": "npm run typecheck && npm test && npm run build && git diff --exit-code -- dist"
  },
  "devDependencies": { "typescript": "^6.0.3", "vitest": "^4.1.5", "jsdom": "^29.1.1" },
  "engines": { "node": ">=20" }
}
```

- [ ] Step 2: `tsconfig.json` (strict, `module`/`moduleResolution` `NodeNext`, `target` ES2022, `lib` ES2022+DOM, include `src` and `tests`) and `tsconfig.build.json` (extends, `include: ["src"]`, `declaration: true`, `outDir: dist`, `rootDir: src`).
- [ ] Step 3: `npm install`, `npm run typecheck` passes on an empty `src/index.ts`.
- [ ] Step 4: Commit `chore: scaffold @team-riley/shopify`.

### Task 2: env helpers

**Files:** Create `src/env.ts`, `tests/env.test.ts`.

**Interfaces — Produces:**
```ts
export type EnvRecord = Record<string, string | undefined>;
// Merge Vite's import.meta.env with process.env (process wins, matching today's sites).
export function readEnv(importMetaEnv?: EnvRecord): EnvRecord;
// First non-empty, trimmed value among keys; values equal to `ignore` are skipped
// (Rosario's 'your-store.myshopify.com' placeholder guard).
export function envValue(env: EnvRecord, keys: string[], fallback?: string, ignore?: string[]): string;
export function envList(env: EnvRecord, keys: string[]): string[];   // comma split, trimmed, non-empty
export function envFlag(env: EnvRecord, keys: string[]): boolean;    // any key === 'true'
```

- [ ] Step 1: Tests: `readEnv` merges and lets process.env override; returns `{}`-safe when `process` undefined (simulate via `vi.stubGlobal('process', undefined)`); `envValue` order, trimming, placeholder skipping, fallback; `envList` drops blanks; `envFlag` true only for `'true'`.
- [ ] Step 2: Run `npx vitest run tests/env.test.ts` → FAIL (module missing).
- [ ] Step 3: Implement.
- [ ] Step 4: PASS. Commit `feat: env helpers`.

### Task 3: Storefront fetch with retry + error policy

**Files:** Create `src/fetch.ts`, `tests/fetch.test.ts`.

**Interfaces — Produces:**
```ts
export const DEFAULT_API_VERSION = '2026-01';
export const PLACEHOLDER_DOMAIN = 'your-store.myshopify.com';
export interface StorefrontConfig {
  domain: string;               // e.g. rosario.myshopify.com
  token: string;
  apiVersion?: string;          // default DEFAULT_API_VERSION
  useMocks?: boolean;           // true → guards skipped, catalog serves mocks
  retry?: { attempts?: number; baseDelayMs?: number }; // default 3 / 500
  fetchImpl?: typeof fetch;     // tests
  sleep?: (ms: number) => Promise<void>; // tests
}
export function storefrontUrl(domain: string, apiVersion?: string): string;
export type StorefrontFetch = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
export function createStorefrontFetch(config: StorefrontConfig): StorefrontFetch;
```

Behaviour (port Rosario's `shopifyFetch` exactly): throws `Missing Shopify store domain` if domain is the placeholder/empty and not mocks; `Missing Shopify Storefront API token` if no token and not mocks; retries statuses 429/500/502/503/504 and rejected `fetch` with backoff `baseDelayMs * 2^(attempt-1)`; never retries other 4xx or GraphQL `errors`; throws `Shopify API error: <status>`.

- [ ] Step 1: Tests (inject `fetchImpl` and a no-op `sleep`): success returns `data`; 503,503,200 → 3 calls, returns data; 503×3 → throws `Shopify API error: 503` after 3 calls; 400 → 1 call, throws; GraphQL errors → 1 call, throws message; network reject then 200 → 2 calls; backoff delays recorded `[500, 1000]`; missing token / placeholder domain throw; headers include `X-Shopify-Storefront-Access-Token`; URL uses `apiVersion`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Commit `feat: storefront fetch with retry`.

### Task 4: Types, queries, catalog

**Files:** Create `src/types.ts`, `src/queries.ts`, `src/filters.ts`, `src/catalog.ts`, `src/mocks.ts`, `tests/catalog.test.ts`, `tests/filters.test.ts`.

**Interfaces — Consumes:** `createStorefrontFetch`, `StorefrontConfig`. **Produces:**
```ts
// types.ts — union of all three copies' shapes; new fields optional so old code still typechecks
export interface ShopifyProduct { id; title; handle; description; availableForSale; tags: string[];
  category?: { id: string; name: string } | null;
  priceRange: { minVariantPrice: Money }; images: Edges<Image>; variants: Edges<ListingVariant>;
  collections: Edges<{ title: string; handle: string }>; }
export interface ShopifyProductDetail /* starter shape + Rosario options + CFC billingPolicy/appName */
export type ErrorPolicy = 'throw' | 'warn' | 'silent';
export interface CatalogConfig extends StorefrontConfig {
  onError?: ErrorPolicy;                 // default 'silent' (today's starter/CFC behaviour)
  logger?: Pick<Console, 'warn'>;
  listingQuery?: string;                 // products(query:) filter, e.g. 'NOT tag:wholesale'
  listingFilter?: (p: ShopifyProduct) => boolean;  // applied to every list result + relatedProducts
  listingImages?: number;                // default 1 (Rosario: 2)
  detailImages?: number;                 // default 8 (Rosario: 25)
  featuredCollection?: string;           // default 'featured-collection'
  featuredMinimum?: number;              // default 0; Rosario 4 → top up from getProducts(24)
  detailTransform?: (p: ShopifyProductDetail) => ShopifyProductDetail; // CFC: filterSellingPlanGroups
  mockProducts?: ShopifyProduct[];       // default demoProducts
}
export interface Catalog {
  fetch: StorefrontFetch;
  getProducts(first?: number, sortKey?: string): Promise<ShopifyProduct[]>;
  getAllProducts(sortKey?: string): Promise<ShopifyProduct[]>;
  getCollectionProducts(handle: string, first?: number): Promise<ShopifyProduct[]>;
  getProductsByHandles(handles: readonly string[]): Promise<ShopifyProduct[]>;
  getProductByHandle(handle: string): Promise<ShopifyProductDetail | null>;
  getFeaturedProducts(): Promise<ShopifyProduct[]>;
}
export function createCatalog(config: CatalogConfig): Catalog;
export function formatPrice(amount: string, currency?: string): string;
// filters.ts
export function hasTag(p: { tags: string[] }, tag: string): boolean;   // case/space-insensitive
export function isWholesaleProduct(p: ShopifyProduct): boolean;        // today's isRetailProduct inverted
export const excludeWholesale: (p: ShopifyProduct) => boolean;
```

The listing GraphQL fields are the union (adds `category { id name }`); the detail query is the union (Rosario `category`, `options`; CFC `billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } }` on both plan locations, `appName`). Extra fields are harmless to stores that don't use them.

Error policy mapping: `throw` rethrows with context (`Shopify products fetch failed: …`), `warn` logs and returns the same fallback as today, `silent` returns fallback. `getAllProducts` on a mid-pagination failure returns what it has (today's behaviour) unless `throw`.

- [ ] Step 1: Port tests. Start from `rosario/tests/unit/shopify.test.ts`, `cfc/tests/unit/shopify.test.ts`, `starter-shopify/tests/unit/shopify.test.ts`; rewrite each to construct `createCatalog({ ..., fetchImpl })` instead of `vi.resetModules()` + env. Add: `listingQuery` is sent in the variables-free query string; `listingFilter` applied to list results AND `relatedProducts`; `featuredMinimum: 4` tops up with de-duplicated products, capped at 24; `featuredMinimum: 0` doesn't call `getProducts`; `onError` three modes; pagination stops on `hasNextPage: false` and uses `endCursor`; mocks: `getCollectionProducts('featured-collection')` returns mocks; `getProductByHandle` mock synthesises `descriptionHtml` and `maxVariantPrice`; `listingImages`/`detailImages` interpolated into queries. `filters.test.ts`: port wholesale cases.
- [ ] Step 2: FAIL. Step 3: implement (move code from Rosario's `shopify.ts`, generalised). Step 4: PASS. Commit `feat: catalog`.

### Task 5: Selling plans

**Files:** Create `src/selling-plans.ts`, `tests/selling-plans.test.ts`.

**Produces:**
```ts
export function formatSellingPlanInterval(interval?: string | null, intervalCount?: number | null): string;
export function planIntervalMonths(interval?: string | null, intervalCount?: number | null): number | null;
export function filterSellingPlanGroups<T extends ShopifyProductDetail>(product: T, groupIds: ReadonlySet<string>): T;
```
(CFC's travel-size rules `isTravelVariant`, `signupIntervalMonths`, `plansForSignup` stay in CFC — they encode CFC's catalog.)

- [ ] Step 1: Port the corresponding cases from `cfc/tests/unit/shopify.test.ts`; add: empty `groupIds` returns the same object; groups with `appName: null` dropped when set; allocations for dropped plans removed from every variant.
- [ ] Step 2–4: FAIL → implement → PASS. Commit `feat: selling plan helpers`.

### Task 6: Cart client + search

**Files:** Create `src/cart.ts`, `tests/cart.test.ts`.

**Consumes:** `createStorefrontFetch` (with `retry: { attempts: 1 }` — browser cart calls should fail fast, matching today). **Produces:**
```ts
export interface CartClientConfig extends StorefrontConfig {
  checkoutDomain?: string;       // default = domain
  headlessDomains?: string[];    // checkoutDomain in this list → fall back to domain
  searchLimit?: number;          // returned results, default 8
  searchFetchLimit?: number;     // predictiveSearch limit, default = searchLimit
  searchFilter?: (p: { title: string; handle: string; tags: string[] }) => boolean;
}
export interface CartLineItem, Cart, SearchProduct, CartLineInput   // unchanged shapes
export interface CartClient {
  createCart(): Promise<Cart>; getCart(id: string): Promise<Cart | null>;
  addToCart(cartId, variantId, quantity?, sellingPlanId?): Promise<Cart>;
  addLinesToCart(cartId, lines: CartLineInput[]): Promise<Cart>;
  removeFromCart(cartId, lineId): Promise<Cart>; updateCartItem(cartId, lineId, quantity): Promise<Cart>;
  updateCartDiscountCodes(cartId, codes: string[]): Promise<Cart>;
  searchProducts(query: string): Promise<SearchProduct[]>;
  normalizeCheckoutUrl(url: string): string; parseCart(raw: unknown): Cart;
}
export function createCartClient(config: CartClientConfig): CartClient;
```
Note: today's `cart-client.ts` falls back to `your-store.myshopify.com` when the checkout domain is a headless domain; that is a bug (it sends checkout to the placeholder). The package falls back to `domain` (the real myshopify domain). Covered by a test and called out in the PRs.

- [ ] Step 1: Port `starter-shopify` + `cfc` `tests/unit/cart-client.test.ts` onto the factory. Add: `searchFilter` applied before `searchLimit` slice (CFC fetches 10, filters, keeps 8); `tags` requested in the search query; headless-domain fallback goes to `domain`.
- [ ] Step 2–4. Commit `feat: cart client`.

### Task 7: Cart store + search store

**Files:** Create `src/cart-store.ts`, `src/search-store.ts`, `tests/cart-store.test.ts`, `tests/search-store.test.ts`.

**Produces:**
```ts
export const CART_STORAGE_KEY = 'shopify_cart_id';
export const DISCOUNT_STORAGE_KEY = 'shopify_discount_code';
export type CartApi = Pick<CartClient, 'createCart'|'getCart'|'addToCart'|'addLinesToCart'|'removeFromCart'|'updateCartItem'|'updateCartDiscountCodes'>;
export function createCartStore(api: CartApi, options?: { currency?: string }): CartStore; // CFC's version incl. clearPendingDiscountCode
export function createSearchStore(options: { search: (q: string) => Promise<SearchProduct[]>; limit?: number; resultsUrl?: (q: string) => string; currency?: string }): SearchStore;
```
`createCartStore` no longer has a default `api` argument (the package can't know the store's config); sites pass their cart client. `SearchStore` = today's `$store.search` object (`isOpen, query, results, isLoading, open, close, doSearch, formatPrice`) plus `submitSearch()` when `resultsUrl` is given (Rosario).

- [ ] Step 1: Port `cfc/tests/integration/cart-store.test.ts` (superset). Add search-store tests: blank query clears results without calling search; limit slices; failure → `[]` and `isLoading` false; `submitSearch` sets `window.location.href` to `resultsUrl(q)`.
- [ ] Step 2–4. Commit `feat: alpine cart and search stores`.

### Task 8: Discount redirect

**Files:** Create `src/discount.ts`, `tests/discount.test.ts`.

**Produces:**
```ts
export function sanitizeDiscountCode(value: string): string;
export function discountCodeFromUrl(url: URL, fallback?: string): string;
export function discountRedirectUrl(url: URL): string;  // same-origin only, carries tracking params
export function runDiscountRedirect(win?: Window, fallback?: string): void; // store code, location.replace
```
Logic is a verbatim port of the inline script in `DiscountRedirect.astro`.

- [ ] Step 1: Tests: `?code=`, `?discount=`, `/discount/CODE`, `/CODE`, fallback; sanitising strips `<>`, caps at 128; `redirect=https://evil.example` → `/`; tracking params carried, `code|discount|redirect` dropped, existing target params win.
- [ ] Step 2–4. Commit `feat: discount redirect`.

### Task 9: Build, CI, publish v1.0.0

**Files:** `src/index.ts` (re-export all), `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `dist/`.

- [ ] Step 1: Add `tests/no-env.test.ts`: reads every file in `src/` and asserts none contains `import.meta.env` or `process.env` (Global Constraint, Review Focus 1).
- [ ] Step 2: `npm run check` green.
- [ ] Step 3: CI workflow: Node 22, `npm ci`, `npm run check`.
- [ ] Step 4: README: what the package is, install line, wrapper example, upgrade procedure (`npm i github:Team-Riley-Web/shopify#vX.Y.Z` then run site tests), release procedure (bump version + CHANGELOG, `npm run check`, commit, `git tag vX.Y.Z`, push tags).
- [ ] Step 5: `gh repo create Team-Riley-Web/shopify --public --source . --push`; tag and push `v1.0.0`; CI green.

### Task 10: Rosario — repair baseline

**Branch:** `shared-shopify-package` in `~/Sites/rosario`.

- [ ] Step 1: In `tests/e2e/shopping-flow.spec.ts` change both `2024-01` matchers to match any version (`'**/api/*/graphql.json'` and `/\/api\/[^/]+\/graphql\.json/`).
- [ ] Step 2: `npm run test:e2e` → 7/7. Commit `test: match any Storefront API version in e2e mocks` (separate commit: this fix is valid even if the migration is rejected).
- [ ] Step 3: Snapshot: `npm run build` under the e2e mock env → copy `dist` to scratchpad `rosario-before/`.

### Task 11: Rosario — migrate onto the package

**Files:** Modify `package.json`, `src/lib/shopify.ts`, `src/lib/cart-client.ts`, `src/lib/cart-store.ts`, `src/entrypoint.ts`, `src/components/DiscountRedirect.astro`; tests import paths unchanged.

- [ ] Step 1: `npm i github:Team-Riley-Web/shopify#v1.0.0`.
- [ ] Step 2: `src/lib/shopify.ts` becomes:
```ts
import { readEnv, envValue, envFlag, createCatalog, excludeWholesale, PLACEHOLDER_DOMAIN, type ShopifyProduct } from '@team-riley/shopify';
export { formatPrice, type ShopifyProduct, type ShopifyProductDetail } from '@team-riley/shopify';

const env = readEnv(import.meta.env);
const useMocks = envFlag(env, ['SHOPIFY_USE_MOCKS', 'PUBLIC_SHOPIFY_USE_MOCKS']);
export const SHOPIFY_DOMAIN = envValue(env, ['SHOPIFY_STORE_DOMAIN', 'PUBLIC_SHOPIFY_STORE_DOMAIN'], PLACEHOLDER_DOMAIN, [PLACEHOLDER_DOMAIN]);
export const FEATURED_COLLECTION_HANDLE = 'best-sellers';
const strict = !useMocks && (env.NETLIFY === 'true' || env.CONTEXT === 'production' || env.SHOPIFY_STRICT_FETCH === 'true');

const catalog = createCatalog({
  domain: SHOPIFY_DOMAIN,
  token: envValue(env, ['SHOPIFY_STOREFRONT_TOKEN', 'PUBLIC_SHOPIFY_STOREFRONT_TOKEN']),
  apiVersion: envValue(env, ['SHOPIFY_API_VERSION', 'PUBLIC_SHOPIFY_API_VERSION'], '2026-01'),
  useMocks, onError: strict ? 'throw' : 'warn',
  listingQuery: 'NOT tag:wholesale', listingFilter: excludeWholesale,
  listingImages: 2, detailImages: 25,
  featuredCollection: FEATURED_COLLECTION_HANDLE, featuredMinimum: 4,
  mockProducts: ROSARIO_MOCK_PRODUCTS,   // moved verbatim into src/lib/mock-products.ts
});
export const { getProducts, getAllProducts, getCollectionProducts, getProductsByHandles, getProductByHandle, getFeaturedProducts } = catalog;
export const shopifyFetch = catalog.fetch;
// + getShopProductPriority / sortShopProductsForDisplay kept verbatim (Rosario-only)
```
- [ ] Step 3: `src/lib/cart-client.ts`: `createCartClient({ ... searchFetchLimit: 3, searchLimit: 3 })` from `PUBLIC_*` env; re-export functions + types. `src/lib/cart-store.ts`: `export { createCartStore } from '@team-riley/shopify'` and entrypoint passes `cartClient`. `entrypoint.ts`: `createSearchStore({ search: searchProducts, limit: 3, resultsUrl: q => `/shop?group=all&search=${encodeURIComponent(q)}` })`.
- [ ] Step 4: `DiscountRedirect.astro`: replace inline script with `<script>import { runDiscountRedirect } from '@team-riley/shopify'; runDiscountRedirect();</script>`.
- [ ] Step 5: Rewrite site unit tests that tested moved internals: keep only tests of Rosario-only code (`sortShopProductsForDisplay`, homepage collection links, redirects) plus one wrapper test asserting the config (strict on `NETLIFY=true`, featured handle). Moved behaviour is covered in the package.
- [ ] Step 6: Verify: `npm run test:unit`, `npm run test:e2e` (7/7), `npx astro check` if configured, then mock build → `diff -r` against `rosario-before/` after normalising `_astro/*.[hash].*` names. Expected: identical HTML.
- [ ] Step 7: Clean-clone check: `git clone . /tmp/x && cd /tmp/x && npm ci && npm run build` with mocks.
- [ ] Step 8: Commit `refactor: use @team-riley/shopify for the Storefront engine`; push branch; open PR (body: what moved, the two behaviour changes, the headless-fallback fix, test evidence).
- [ ] Step 9: Real-data check on the Netlify deploy preview: fetch `https://www.rosarioleonardi.shop/sitemap-0.xml` and the preview's; `comm` the URL path sets (expect identical, modulo products added between builds); fetch 3 product pages from both and diff their `<main>` text.

### Task 12: CFC — repair baseline + migrate

Same shape as Tasks 10–11, branch `shared-shopify-package` in `~/Sites/cfc`.

- [ ] Step 1: e2e version matcher fix, separate commit, e2e 17/17; mock-build snapshot `cfc-before/`.
- [ ] Step 2: `src/lib/shopify.ts` wrapper: `createCatalog({ onError: 'silent', listingQuery: 'NOT tag:wholesale', listingFilter: p => isRetailProduct(p) /* = excludeWholesale && !isHiddenProduct */, detailTransform: p => filterSellingPlanGroups(p, SUBSCRIPTION_GROUP_IDS), mockProducts: CFC_MOCK_PRODUCTS })`. Keep CFC-only code verbatim in the wrapper: hidden/unlisted handles, `getHiddenProductsForDev` (wraps `getProducts`/`getAllProducts`), `getUnlistedProducts` (uses `getProductsByHandles` without the filter → call `catalog.fetch` with the package's exported `PRODUCT_BY_HANDLE_QUERY`), `SUBSCRIPTION_RECURRING_DISCOUNT`, travel-size helpers. Re-export `formatSellingPlanInterval`, `planIntervalMonths` from the package.
- [ ] Step 3: `cart-client.ts` wrapper: `createCartClient({ headlessDomains: [...the 5 CFC domains], searchFetchLimit: 10, searchLimit: 8, searchFilter: p => !isWholesaleOnly(...) && !isHiddenProduct(...) })`; keep `isHiddenProduct` export (client-safe: only PUBLIC_ vars). `wholesale-core.ts` keeps its own B2B fetch (different API version and auth) and imports `Cart` type from the wrapper, unchanged.
- [ ] Step 4: Review Focus 1 check: build with `SHOPIFY_UNLISTED_PRODUCT_HANDLES=zz-secret-handle` and `grep -r zz-secret-handle dist/_astro` → no matches (it may appear in HTML only if such a product page is built; with mocks it won't).
- [ ] Step 5: Unit + e2e (17/17) + dist diff + clean clone; commit; PR; deploy-preview sitemap/product comparison against `https://cfcskincare.shop`.

### Task 13: Starter template + `init`

**Files (package repo):** `template/src/lib/shopify.ts`, `template/src/lib/cart-client.ts`, `template/src/alpine-shopify.ts`, `template/src/components/shop/{ProductCard,CartDrawer,SearchModal,AddToCart}.astro`, `template/src/pages/shop.astro`, `template/src/pages/products/[handle].astro`, `template/src/pages/discount.astro`, `template/public/_redirects`, `template/.env.example`, `template/tests/e2e/shopping-flow.spec.ts`, `template/playwright.config.ts`, `bin/init.mjs`, `tests/init.test.ts`.

Template components are **neutral** (Tailwind 4 utilities, grayscale, no brand tokens, Lucide icons) so each new store restyles them — matching `starter`'s AGENTS.md "grayscale first" rule. They use only the starter's stack (Astro 7, TW4, Alpine, Lucide).

`init` behaviour: copies `template/` into cwd, **never overwrites** an existing file (prints `skip <path>`), adds the npm scripts `test:e2e` and the devDependency `@playwright/test` to `package.json`, and prints the two manual steps: add `registerShopify(Alpine)` to `src/alpine.ts` and `<CartDrawer />`/`<SearchModal />` to the layout.

- [ ] Step 1: `tests/init.test.ts`: runs `init` in a temp dir with a fake `src/lib/shopify.ts` already present → that file untouched, others created, `package.json` scripts merged, idempotent on second run.
- [ ] Step 2–4: FAIL → implement → PASS. Commit `feat: starter template and init`.

### Task 14: Verify the new-store path end to end; release v1.1.0

**Files:** `scripts/verify-scaffold.sh`; `starter/README.md` (one section).

- [ ] Step 1: `verify-scaffold.sh`: copy `~/Sites/starter` (git archive of HEAD, so uncommitted local edits are excluded) to a temp dir, `npm i github:Team-Riley-Web/shopify#<tag>`, `npx team-riley-shopify init`, apply the two manual edits with `sed`, `npm i`, `npx playwright install chromium`, run the mock build and `test:e2e`. Expected: build succeeds, e2e passes (add to cart, drawer, checkout handoff, discount link).
- [ ] Step 2: Tag `v1.1.0`, push, run `verify-scaffold.sh v1.1.0` (installs from GitHub — Review Focus 5).
- [ ] Step 3: On a `shopify-docs` branch in `starter`, add a "Make it a Shopify store" README section (three commands). Commit only `README.md` (starter has unrelated uncommitted edits to `TASKS.md` and `BaseLayout.astro` that must not be swept in). Push branch + PR.
- [ ] Step 4: Bump Rosario/CFC PRs to `#v1.1.0` only if v1.1.0 changed `src/` (it shouldn't — template only).

### Task 15: Final review + handoff

- [ ] Step 1: Whole-branch review of the package and both site PRs (fresh reviewer).
- [ ] Step 2: Report: PR links, test counts before/after, deploy-preview comparison results, the behaviour changes, follow-ups.

## Out of scope / follow-ups (not done in this plan)

- Upgrading CFC to Astro 7 and either site to Tailwind 4.
- The product-change rebuild GitHub workflows (also duplicated and diverged — Rosario's uses the Admin API with good reasons). Candidate for a reusable workflow in the package repo later.
- Making CFC's builds strict like Rosario's (recommended; behaviour change, needs your call).
- Archiving `starter-shopify` (you do this after merging).
