# Changelog

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
