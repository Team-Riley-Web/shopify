import { describe, expect, it } from 'vitest';
import { excludeWholesale, hasTag, isWholesaleProduct } from '../src/filters.js';
import { product } from './fixtures.js';

describe('isWholesaleProduct', () => {
  it.each([
    ['title', { title: 'Vitamin C Back Bar' }],
    ['handle', { handle: 'serum-wholesale' }],
    ['description', { description: 'Whole sale pack for salons' }],
    ['tag', { tags: ['Wholesale'] }],
  ])('flags wholesale wording in the %s', (_where, overrides) => {
    expect(isWholesaleProduct(product(overrides))).toBe(true);
    expect(excludeWholesale(product(overrides))).toBe(false);
  });

  it('flags a product whose every collection is wholesale', () => {
    const p = product({ collections: { edges: [{ node: { title: 'Wholesale', handle: 'wholesale' } }, { node: { title: 'Back Bar', handle: 'back-bar' } }] } });
    expect(isWholesaleProduct(p)).toBe(true);
  });

  it('keeps a retail product that is also in a wholesale collection', () => {
    const p = product({ collections: { edges: [{ node: { title: 'Wholesale', handle: 'wholesale' } }, { node: { title: 'Cleanse', handle: 'cleanse' } }] } });
    expect(isWholesaleProduct(p)).toBe(false);
  });

  it('keeps a plain retail product, including one with no collections', () => {
    expect(isWholesaleProduct(product())).toBe(false);
    expect(isWholesaleProduct(product({ collections: { edges: [] } }))).toBe(false);
  });
});

describe('hasTag', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(hasTag({ tags: [' Internal-Test '] }, 'internal-test')).toBe(true);
    expect(hasTag({ tags: ['internal'] }, 'internal-test')).toBe(false);
  });
});
