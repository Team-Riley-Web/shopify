import { afterEach, describe, expect, it, vi } from 'vitest';
import { envFlag, envList, envValue, readEnv } from '../src/env.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('readEnv', () => {
  it('merges import.meta.env with process.env, process winning', () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'from-process.myshopify.com');
    const env = readEnv({ SHOPIFY_STORE_DOMAIN: 'from-vite.myshopify.com', PUBLIC_X: 'vite-only' });
    expect(env.SHOPIFY_STORE_DOMAIN).toBe('from-process.myshopify.com');
    expect(env.PUBLIC_X).toBe('vite-only');
  });

  it('works where process does not exist (the browser)', () => {
    vi.stubGlobal('process', undefined);
    expect(readEnv({ A: '1' })).toEqual({ A: '1' });
  });

  it('accepts no argument', () => {
    vi.stubGlobal('process', undefined);
    expect(readEnv()).toEqual({});
  });
});

describe('envValue', () => {
  it('returns the first non-empty trimmed value in key order', () => {
    expect(envValue({ A: '  ', B: ' b ', C: 'c' }, ['A', 'B', 'C'])).toBe('b');
  });

  it('skips ignored placeholder values', () => {
    const env = { A: 'your-store.myshopify.com', B: 'real.myshopify.com' };
    expect(envValue(env, ['A', 'B'], '', ['your-store.myshopify.com'])).toBe('real.myshopify.com');
  });

  it('falls back when nothing usable is set', () => {
    expect(envValue({}, ['A'], 'fallback')).toBe('fallback');
    expect(envValue({}, ['A'])).toBe('');
  });
});

describe('envList', () => {
  it('splits on commas from the first key that is set, trimming and dropping blanks', () => {
    expect(envList({ A: ' x, ,y ,', B: 'z' }, ['A', 'B'])).toEqual(['x', 'y']);
    expect(envList({ B: 'z' }, ['A', 'B'])).toEqual(['z']);
    expect(envList({}, ['A'])).toEqual([]);
  });
});

describe('envFlag', () => {
  it("is true only when some key is exactly 'true'", () => {
    expect(envFlag({ A: 'false', B: 'true' }, ['A', 'B'])).toBe(true);
    expect(envFlag({ A: '1' }, ['A'])).toBe(false);
    expect(envFlag({}, ['A'])).toBe(false);
  });
});
