import { describe, expect, it } from 'vitest';
import { filterSellingPlanGroups, formatSellingPlanInterval, planIntervalMonths } from '../src/selling-plans.js';
import type { ShopifyProductDetail } from '../src/types.js';
import { productFixture, variantId } from './fixtures.js';

const planNode = (id: string) => ({
  id, name: 'Monthly', description: null, recurringDeliveries: true,
  options: [{ name: 'Delivery frequency', value: 'Monthly' }],
});
const allocation = (id: string) => ({ node: { sellingPlan: planNode(id), priceAdjustments: [] } });
const group = (appName: string | null, planId: string) => ({
  node: { appName, name: 'Subscribe and save', options: [], sellingPlans: { edges: [{ node: planNode(planId) }] } },
});

const BOLD_NEW = 'gid://shopify/SellingPlan/26788724954';
const BOLD_OLD = 'gid://shopify/SellingPlan/26788692186';
const PROPEL = 'gid://shopify/SellingPlan/26328826074';

const product: ShopifyProductDetail = {
  ...productFixture,
  descriptionHtml: '<p>x</p>',
  priceRange: { minVariantPrice: { amount: '48.00', currencyCode: 'USD' }, maxVariantPrice: { amount: '48.00', currencyCode: 'USD' } },
  sellingPlanGroups: { edges: [group('60442', BOLD_NEW), group('60315', BOLD_OLD), group(null, PROPEL)] },
  variants: {
    edges: [
      { node: { id: variantId, title: 'Default Title', availableForSale: true, price: { amount: '48.00' },
        sellingPlanAllocations: { edges: [allocation(BOLD_NEW), allocation(BOLD_OLD), allocation(PROPEL)] } } },
      { node: { id: 'v2', title: 'Travel Size', availableForSale: true, price: { amount: '18.00' } } },
    ],
  },
};

describe('filterSellingPlanGroups', () => {
  it('returns the product untouched when no group is configured', () => {
    expect(filterSellingPlanGroups(product, new Set())).toBe(product);
  });

  it('keeps only the configured group, dropping the grandfathered one and ownerless (Propel) groups', () => {
    const result = filterSellingPlanGroups(product, new Set(['60442']));
    expect(result.sellingPlanGroups?.edges.map((e) => e.node.appName)).toEqual(['60442']);
  });

  it("drops the other groups' allocations from every variant, so no offer is left priceless", () => {
    const result = filterSellingPlanGroups(product, new Set(['60442']));
    const ids = result.variants.edges[0]?.node.sellingPlanAllocations?.edges.map((e) => e.node.sellingPlan.id);
    expect(ids).toEqual([BOLD_NEW]);
    expect(result.variants.edges[1]?.node.sellingPlanAllocations?.edges).toEqual([]);
  });

  it('hides subscriptions entirely when no group matches', () => {
    const result = filterSellingPlanGroups(product, new Set(['99999']));
    expect(result.sellingPlanGroups?.edges).toEqual([]);
    expect(result.variants.edges[0]?.node.sellingPlanAllocations?.edges).toEqual([]);
  });

  it('does not mutate its input', () => {
    filterSellingPlanGroups(product, new Set(['60442']));
    expect(product.sellingPlanGroups?.edges).toHaveLength(3);
  });
});

describe('formatSellingPlanInterval', () => {
  it('names common intervals the way a shopper would read them', () => {
    expect(formatSellingPlanInterval('MONTH', 1)).toBe('Monthly');
    expect(formatSellingPlanInterval('MONTH', 2)).toBe('Every 2 months');
    expect(formatSellingPlanInterval('WEEK', 1)).toBe('Weekly');
    expect(formatSellingPlanInterval('DAY', 10)).toBe('Every 10 days');
    expect(formatSellingPlanInterval('YEAR', 1)).toBe('Yearly');
  });

  it('returns nothing for a non-recurring plan, so the caller can fall back', () => {
    expect(formatSellingPlanInterval(null, null)).toBe('');
    expect(formatSellingPlanInterval('MONTH', 0)).toBe('');
    expect(formatSellingPlanInterval(undefined, 3)).toBe('');
  });
});

describe('planIntervalMonths', () => {
  it('reads a plan interval in months and ignores cadences that are not monthly', () => {
    expect(planIntervalMonths('MONTH', 1)).toBe(1);
    expect(planIntervalMonths('month', 2)).toBe(2);
    expect(planIntervalMonths('WEEK', 2)).toBeNull();
    expect(planIntervalMonths('YEAR', 1)).toBeNull();
    expect(planIntervalMonths(null, null)).toBeNull();
    expect(planIntervalMonths('MONTH', 0)).toBeNull();
  });
});
