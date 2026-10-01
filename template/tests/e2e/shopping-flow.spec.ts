import { expect, test } from '@playwright/test';

// Runs against the mock build (see the test:e2e script): the Storefront API is
// intercepted here, so no store credentials are needed.
const storefrontPattern = '**/api/*/graphql.json';

function cart(quantity: number, discountCodes: Array<{ code: string; applicable: boolean }> = []) {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://demo-headless.example/cart/c/test-checkout?key=checkout-key',
    discountCodes,
    totalQuantity: quantity,
    lines: {
      edges: quantity > 0 ? [{
        node: {
          id: 'gid://shopify/CartLine/line-1',
          quantity,
          merchandise: {
            id: 'gid://shopify/ProductVariant/2001',
            title: 'Default Title',
            price: { amount: '28.00', currencyCode: 'USD' },
            product: {
              title: 'Starter Ceramic Mug',
              handle: 'ceramic-mug',
              images: { edges: [{ node: { url: '/favicon.svg', altText: 'Starter Ceramic Mug' } }] },
            },
          },
        },
      }] : [],
    },
    cost: { totalAmount: { amount: (28 * quantity).toFixed(2), currencyCode: 'USD' } },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://demo-store.myshopify.com/checkouts/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mock Shopify Checkout</title><h1>Mock Shopify Checkout</h1>' });
  });

  await page.route(storefrontPattern, async (route) => {
    const body = route.request().postDataJSON();
    const query = String(body.query);
    const variables = body.variables ?? {};

    if (query.includes('cartCreate')) return route.fulfill({ json: { data: { cartCreate: { cart: cart(0) } } } });
    if (query.includes('cartLinesAdd')) return route.fulfill({ json: { data: { cartLinesAdd: { cart: cart(variables.lines?.[0]?.quantity ?? 1) } } } });
    if (query.includes('cartLinesUpdate')) return route.fulfill({ json: { data: { cartLinesUpdate: { cart: cart(variables.lines?.[0]?.quantity ?? 1) } } } });
    if (query.includes('cartLinesRemove')) return route.fulfill({ json: { data: { cartLinesRemove: { cart: cart(0) } } } });
    if (query.includes('cartDiscountCodesUpdate')) {
      return route.fulfill({ json: { data: { cartDiscountCodesUpdate: {
        cart: cart(1, variables.discountCodes.map((code: string) => ({ code, applicable: true }))),
        userErrors: [],
      } } } });
    }
    // A restored cart holds what was put in it; these flows add nothing first.
    if (query.includes('getCart')) return route.fulfill({ json: { data: { cart: cart(0) } } });
    return route.fulfill({ json: { data: {} } });
  });
});

test('customer can shop through to the Shopify checkout handoff', async ({ page }) => {
  await page.goto('/shop');

  const productLink = page.getByRole('link', { name: /Starter Ceramic Mug/i }).first();
  await expect(productLink).toHaveAttribute('href', /ceramic-mug/);

  await page.getByRole('button', { name: /Add to Cart/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /Shopping cart/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Starter Ceramic Mug')).toBeVisible();

  await dialog.getByRole('button', { name: /Increase quantity/i }).click();
  await expect(dialog.locator('[data-quantity]')).toHaveText('2');

  await dialog.getByRole('button', { name: /Remove item/i }).click();
  await expect(dialog.getByText(/Your cart is empty/i)).toBeVisible();

  await dialog.getByRole('button', { name: /Continue Shopping/i }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: /Add to Cart/i }).first().click();

  const checkout = dialog.getByRole('link', { name: /^Checkout$/i });
  await expect(checkout).toHaveAttribute('href', /demo-store\.myshopify\.com\/checkouts/);
  await checkout.click();
  await expect(page).toHaveURL(/demo-store\.myshopify\.com\/checkouts/);
});

test('buy now goes to the Shopify checkout in the same tab', async ({ page }) => {
  await page.goto('/products/ceramic-mug');

  const popupPromise = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
  await page.getByRole('button', { name: /^Buy Now$/i }).click();

  await expect(page).toHaveURL(/demo-store\.myshopify\.com\/checkouts/);
  expect(await popupPromise).toBeNull();
});

test('discount links store the code, keep tracking params, and apply at add-to-cart', async ({ page }) => {
  let appliedDiscountCodes: string[] = [];

  await page.goto('/discount?code=WELCOME10&redirect=/shop&utm_source=partner');

  await expect(page).toHaveURL(/\/shop\?utm_source=partner$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe('WELCOME10');

  page.on('request', (request) => {
    if (!/\/api\/[^/]+\/graphql\.json/.test(request.url())) return;
    const body = request.postDataJSON();
    if (String(body.query).includes('cartDiscountCodesUpdate')) appliedDiscountCodes = body.variables.discountCodes;
  });

  await page.getByRole('button', { name: /Add to Cart/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /Shopping cart/i });
  await expect(dialog).toBeVisible();
  expect(appliedDiscountCodes).toEqual(['WELCOME10']);
  await expect(dialog.getByRole('link', { name: /^Checkout$/i })).toHaveAttribute('href', /discount=WELCOME10/);
});

test('bare discount slugs redirect home and store the code', async ({ page }) => {
  for (const [index, code] of ['SPRING', 'SUMMER'].entries()) {
    if (index > 0) await page.evaluate(() => localStorage.clear());
    await page.goto(`/discount?code=${code}&utm_source=qr`);

    await expect(page).toHaveURL(/\/\?utm_source=qr$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe(code);
  }
});
