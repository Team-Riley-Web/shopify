import { describe, expect, it, vi } from 'vitest';
import { discountCodeFromUrl, discountRedirectUrl, runDiscountRedirect, sanitizeDiscountCode } from '../src/discount.js';

const u = (s: string) => new URL(s, 'https://shop.example.com');

describe('sanitizeDiscountCode', () => {
  it('keeps only letters, digits, underscore and hyphen, trimmed and capped at 128', () => {
    expect(sanitizeDiscountCode('  WELCOME-10_x ')).toBe('WELCOME-10_x');
    expect(sanitizeDiscountCode('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(sanitizeDiscountCode('a b.c/d?e')).toBe('abcde');
    expect(sanitizeDiscountCode('x'.repeat(200))).toHaveLength(128);
  });
});

describe('discountCodeFromUrl', () => {
  it('prefers ?code, then ?discount', () => {
    expect(discountCodeFromUrl(u('/discount/PATH?code=QUERY&discount=OTHER'))).toBe('QUERY');
    expect(discountCodeFromUrl(u('/?discount=OTHER'))).toBe('OTHER');
  });

  it('reads /discount/CODE, decoding it', () => {
    expect(discountCodeFromUrl(u('/discount/SPRING%2D20?redirect=/shop'))).toBe('SPRING-20');
    expect(discountCodeFromUrl(u('/discount/SPRING/extra'))).toBe('SPRING');
  });

  it('reads a bare single-segment path, the Netlify /:discount_code rewrite', () => {
    expect(discountCodeFromUrl(u('/WELCOME'))).toBe('WELCOME');
    expect(discountCodeFromUrl(u('/LISA/'))).toBe('LISA');
    expect(discountCodeFromUrl(u('/products/mug'))).toBe('');
  });

  it('falls back to the page code, sanitised', () => {
    expect(discountCodeFromUrl(u('/'), ' FALL BACK ')).toBe('FALLBACK');
    expect(discountCodeFromUrl(u('/'))).toBe('');
  });

  it('survives a malformed percent-encoding', () => {
    expect(discountCodeFromUrl(u('/discount/%E0%A4%A'))).toBe('E0A4A');
  });
});

describe('discountRedirectUrl', () => {
  it('goes home by default and carries tracking params, dropping the discount ones', () => {
    expect(discountRedirectUrl(u('/discount/X?utm_source=partner&code=X&redirect=&discount=Y')))
      .toBe('https://shop.example.com/?utm_source=partner');
  });

  it('honours a same-origin redirect and lets its own params win', () => {
    expect(discountRedirectUrl(u('/X?redirect=%2Fshop%3Futm_source%3Dkeep&utm_source=lose&fbclid=1')))
      .toBe('https://shop.example.com/shop?utm_source=keep&fbclid=1');
    expect(discountRedirectUrl(u('/X?redirect=https://shop.example.com/products/mug')))
      .toBe('https://shop.example.com/products/mug');
  });

  it('refuses an off-origin redirect', () => {
    expect(discountRedirectUrl(u('/X?redirect=https://evil.example/phish&utm_medium=qr')))
      .toBe('https://shop.example.com/?utm_medium=qr');
    expect(discountRedirectUrl(u('/X?redirect=//evil.example'))).toBe('https://shop.example.com/');
  });
});

describe('runDiscountRedirect', () => {
  function fakeWindow(href: string) {
    const store = new Map<string, string>();
    const replace = vi.fn();
    const win = {
      location: { href, replace },
      localStorage: { setItem: (k: string, v: string) => store.set(k, v), getItem: (k: string) => store.get(k) ?? null },
    } as unknown as Window;
    return { win, store, replace };
  }

  it('stores the code and leaves the page', () => {
    const { win, store, replace } = fakeWindow('https://shop.example.com/WELCOME?utm_source=qr');
    runDiscountRedirect(win);
    expect(store.get('shopify_discount_code')).toBe('WELCOME');
    expect(replace).toHaveBeenCalledWith('https://shop.example.com/?utm_source=qr');
  });

  it('uses the page fallback code when the URL has none, and stores nothing when there is no code at all', () => {
    const withFallback = fakeWindow('https://shop.example.com/discount/');
    runDiscountRedirect(withFallback.win, 'PAGE');
    expect(withFallback.store.get('shopify_discount_code')).toBe('PAGE');

    const none = fakeWindow('https://shop.example.com/discount/');
    runDiscountRedirect(none.win);
    expect(none.store.has('shopify_discount_code')).toBe(false);
    expect(none.replace).toHaveBeenCalledWith('https://shop.example.com/');
  });
});
