import { DISCOUNT_STORAGE_KEY } from './cart-store.js';

/** Keep only characters Shopify accepts in a discount code; cap the length. */
export function sanitizeDiscountCode(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
}

/**
 * The code a discount link carries, in priority order: `?code=` / `?discount=`,
 * then `/discount/CODE`, then a bare single-segment path `/CODE` (what Netlify's
 * `/:discount_code` rewrite serves), then the page's own fallback.
 */
export function discountCodeFromUrl(url: URL, fallback = ''): string {
  const queryCode = url.searchParams.get('code') || url.searchParams.get('discount');
  if (queryCode) return sanitizeDiscountCode(queryCode);

  const pathMatch = url.pathname.match(/^\/discount\/([^/?#]+)/);
  if (pathMatch?.[1]) return sanitizeDiscountCode(safeDecode(pathMatch[1]));

  // A bare `/discount/` is the redirect page itself, not a code named "discount".
  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length === 1 && pathSegments[0] !== 'discount') {
    return sanitizeDiscountCode(safeDecode(pathSegments[0]!));
  }

  return sanitizeDiscountCode(fallback);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Where to send the visitor after storing the code: `?redirect=` if it is on
 * this origin, else `/`. Tracking params (utm_*, fbclid...) are carried over;
 * `code`, `discount` and `redirect` are not, and params already on the target win.
 */
export function discountRedirectUrl(url: URL): string {
  const requestedRedirect = url.searchParams.get('redirect') || '/';
  let target: URL;

  try {
    target = new URL(requestedRedirect, url.origin);
  } catch {
    target = new URL('/', url.origin);
  }

  if (target.origin !== url.origin) {
    target = new URL('/', url.origin);
  }

  url.searchParams.forEach((value, key) => {
    if (['code', 'discount', 'redirect'].includes(key)) return;
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });

  return target.href;
}

/**
 * Store the discount code for the cart store to apply, then leave the page.
 * `fallback` is the code baked into the page (the `code` prop), used when the
 * URL carries none.
 */
export function runDiscountRedirect(win: Window = window, fallback = ''): void {
  const current = new URL(win.location.href);
  const discountCode = discountCodeFromUrl(current, fallback);
  if (discountCode) {
    win.localStorage.setItem(DISCOUNT_STORAGE_KEY, discountCode);
  }
  win.location.replace(discountRedirectUrl(current));
}
