// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSearchStore } from '../src/search-store.js';

const hit = (handle: string) => ({ id: handle, title: handle, handle, price: '10.00', imageUrl: '', imageAlt: '', variantId: 'v' });
const five = ['a', 'b', 'c', 'd', 'e'].map(hit);

describe('search store', () => {
  it('exposes the members the search modal binds to', () => {
    const store = createSearchStore({ search: async () => [] });
    for (const key of ['isOpen', 'query', 'results', 'isLoading']) expect(store).toHaveProperty(key);
    for (const key of ['open', 'close', 'doSearch', 'submitSearch', 'formatPrice']) expect(typeof (store as any)[key]).toBe('function');
  });

  it('open() resets the query and results; close() only hides', () => {
    const store = createSearchStore({ search: async () => [] });
    store.query = 'old'; store.results = five;
    store.open();
    expect(store).toMatchObject({ isOpen: true, query: '', results: [] });
    store.close();
    expect(store.isOpen).toBe(false);
  });

  it('does not search a blank query and clears stale results', async () => {
    const search = vi.fn(async () => five);
    const store = createSearchStore({ search });
    store.results = five; store.query = '   ';
    await store.doSearch();
    expect(search).not.toHaveBeenCalled();
    expect(store.results).toEqual([]);
  });

  it('trims the query, keeps all results by default, and applies a limit when given', async () => {
    const search = vi.fn(async () => five);
    const all = createSearchStore({ search });
    all.query = ' mug ';
    await all.doSearch();
    expect(search).toHaveBeenCalledWith('mug');
    expect(all.results).toHaveLength(5);

    const limited = createSearchStore({ search, limit: 3 });
    limited.query = 'mug';
    await limited.doSearch();
    expect(limited.results.map((r) => r.handle)).toEqual(['a', 'b', 'c']);
  });

  it('swallows search failures and clears isLoading', async () => {
    const store = createSearchStore({ search: async () => { throw new Error('down'); } });
    store.query = 'x';
    await store.doSearch();
    expect(store.results).toEqual([]);
    expect(store.isLoading).toBe(false);
  });

  it('submitSearch navigates to resultsUrl, and is a no-op without one or with a blank query', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { set href(value: string) { assign(value); } });
    const store = createSearchStore({ search: async () => [], resultsUrl: (q) => `/shop?search=${encodeURIComponent(q)}` });
    store.query = ' red glass ';
    store.submitSearch();
    expect(assign).toHaveBeenCalledWith('/shop?search=red%20glass');

    store.query = '  ';
    store.submitSearch();
    const plain = createSearchStore({ search: async () => [] });
    plain.query = 'x';
    plain.submitSearch();
    expect(assign).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('formats prices', () => {
    expect(createSearchStore({ search: async () => [] }).formatPrice('3')).toBe('$3.00');
  });
});
