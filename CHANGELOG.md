# Changelog

## 1.1.1 — 2026-10-01

Fixes from the post-migration review:

- Template: a sold-out Add to Cart / Buy Now button no longer becomes
  clickable once Alpine binds `:disabled`; `[x-cloak]` is now styled so the
  cart drawer and search modal do not flash before Alpine initialises;
  dialogs get `aria-modal` and the drawer focuses its close button on open;
  empty image URLs no longer render `src=""`; dropped the `prose` classes
  the starter does not ship.
- Store domain is normalised (`https://`, paths, case) for the Storefront URL
  as well as for checkout.
- Pagination stops instead of looping if Shopify reports a next page with no
  cursor; a 200 with a non-JSON body throws a labelled error.
- `@types/node` moved to devDependencies (the package has no runtime deps).
- `verify-scaffold.sh` leak and `astro check` failures are fatal.
- Docs explain how the git dependency installs on Netlify without SSH.

## 1.1.0 — 2026-10-01

New-store path for the Team Riley `starter`:

- `npx team-riley-shopify` scaffolds a storefront into a copy of `starter`
  without overwriting anything: thin `src/lib` wrappers, neutral
  `components/shop/*` (product card, add-to-cart, cart drawer, search modal,
  header controls, discount redirect), `/shop`, `/products/[handle]` and
  `/discount` pages, `public/_redirects`, `.env.example`, and a Playwright
  suite that runs against the mock catalog. Wires `src/alpine.ts` when it
  still looks like the starter's; adds the `test:e2e` script.
- `scripts/verify-scaffold.sh` exercises that path end to end.

No changes to the runtime package.

## 1.0.0 — 2026-10-01

First release. Extracted from the `starter-shopify`, `rosario` and `cfc`
storefronts, taking the newest behaviour from each:

- Storefront fetch with retry on 429/5xx/network errors and a strict
  (`throw`) / `warn` / `silent` error policy (from Rosario).
- Catalog: products, collections, by-handle, detail, featured with optional
  top-up; listing query/filter hooks; image counts; mock mode.
- Detail query carries `category`, `options`, selling-plan `billingPolicy`
  and group `appName` (union of all sites).
- Cart client with checkout URL normalisation (never to a headless domain),
  predictive search with filter + limits.
- Alpine cart store (CFC's version: clears a pending discount once applied)
  and search store (Rosario's `submitSearch`).
- Discount redirect helpers. Fix: a bare `/discount/` no longer stores the
  word `discount` as a code.
- Selling-plan helpers: `formatSellingPlanInterval`, `planIntervalMonths`,
  `filterSellingPlanGroups`.
