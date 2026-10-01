// Adds the Shopify storefront to a copy of the Team Riley `starter`.
// Copies template/ into the current directory without overwriting anything,
// wires src/alpine.ts when it still looks like the starter's, and adds the
// e2e script + Playwright dev dependency. Safe to re-run.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = join(here, '..', 'template');
const target = process.cwd();

const E2E_SCRIPT =
  'SHOPIFY_USE_MOCKS=true PUBLIC_SHOPIFY_USE_MOCKS=true ' +
  'SHOPIFY_STORE_DOMAIN=demo-store.myshopify.com PUBLIC_SHOPIFY_STORE_DOMAIN=demo-store.myshopify.com ' +
  'SHOPIFY_CHECKOUT_DOMAIN=demo-store.myshopify.com PUBLIC_SHOPIFY_CHECKOUT_DOMAIN=demo-store.myshopify.com ' +
  'HEADLESS_DOMAINS=demo-headless.example PUBLIC_HEADLESS_DOMAINS=demo-headless.example ' +
  'ALLOW_PLACEHOLDER_SITE=1 npm run build && playwright test';
const PLAYWRIGHT_VERSION = '^1.59.1';

export function init({ cwd = target, log = console.log } = {}) {
  const copied = [];
  const skipped = [];

  function copyTree(dir) {
    for (const entry of readdirSync(dir)) {
      const from = join(dir, entry);
      const rel = relative(templateDir, from);
      const to = join(cwd, rel);
      if (statSync(from).isDirectory()) {
        mkdirSync(to, { recursive: true });
        copyTree(from);
      } else if (existsSync(to)) {
        skipped.push(rel);
      } else {
        cpSync(from, to);
        copied.push(rel);
      }
    }
  }
  copyTree(templateDir);

  // src/alpine.ts: register the stores if the file still looks like the starter's.
  let alpineWired = false;
  const alpinePath = join(cwd, 'src/alpine.ts');
  if (existsSync(alpinePath)) {
    let source = readFileSync(alpinePath, 'utf8');
    if (source.includes('registerShopify')) {
      alpineWired = true;
    } else if (source.includes("import intersect from '@alpinejs/intersect';") && source.includes('  Alpine.plugin(intersect);')) {
      source = source
        .replace("import intersect from '@alpinejs/intersect';", "import intersect from '@alpinejs/intersect';\nimport { registerShopify } from './alpine-shopify';")
        .replace('  Alpine.plugin(intersect);', '  Alpine.plugin(intersect);\n  registerShopify(Alpine);');
      writeFileSync(alpinePath, source);
      alpineWired = true;
    }
  }

  // package.json: e2e script + Playwright.
  const pkgPath = join(cwd, 'package.json');
  let pkgChanged = false;
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts ??= {};
    pkg.devDependencies ??= {};
    if (!pkg.scripts['test:e2e']) { pkg.scripts['test:e2e'] = E2E_SCRIPT; pkgChanged = true; }
    if (!pkg.devDependencies['@playwright/test']) { pkg.devDependencies['@playwright/test'] = PLAYWRIGHT_VERSION; pkgChanged = true; }
    if (pkgChanged) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  for (const file of copied) log(`  add   ${file}`);
  for (const file of skipped) log(`  skip  ${file} (exists)`);
  log('');
  log(alpineWired ? '  src/alpine.ts registers the cart and search stores.' : '  ! Add to src/alpine.ts:  import { registerShopify } from \'./alpine-shopify\';  and call  registerShopify(Alpine);');
  log('  Next:');
  log('    1. Mount <CartDrawer /> and <SearchModal /> once in src/layouts/BaseLayout.astro (the shop pages mount their own until you do),');
  log('       and put <ShopControls /> in src/components/Header.astro.');
  log('    2. Copy .env.example to .env and fill in the store domain and Storefront token.');
  log('    3. npm install && npx playwright install chromium && npm run test:e2e');

  return { copied, skipped, alpineWired, pkgChanged };
}
