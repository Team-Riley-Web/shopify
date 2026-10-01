import type { ShopifyProductDetail } from './types.js';

/**
 * The cadence a shopper is shown, derived from what Shopify will actually bill
 * rather than from the plan's name. A subscription app supplies both and they
 * can disagree (Bold shipped a plan named "Monthly" that billed every two
 * months), so the name is only a fallback for a non-recurring plan.
 */
export function formatSellingPlanInterval(
  interval: string | null | undefined,
  intervalCount: number | null | undefined
): string {
  if (!interval || !intervalCount || intervalCount < 1) return '';

  const unit = interval.toLowerCase();
  if (intervalCount === 1) {
    const everyUnit: Record<string, string> = {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
      year: 'Yearly',
    };
    return everyUnit[unit] ?? `Every ${unit}`;
  }

  return `Every ${intervalCount} ${unit}s`;
}

/** A plan's billing interval in months, or null when it does not recur monthly. */
export function planIntervalMonths(
  interval: string | null | undefined,
  intervalCount: number | null | undefined
): number | null {
  if (!interval || !intervalCount || intervalCount < 1) return null;
  return interval.toUpperCase() === 'MONTH' ? intervalCount : null;
}

/**
 * Keep only the selling-plan groups whose owner (`appName`) is in `groupIds`.
 * Bold reports its own group ID there; groups with no owner (e.g. Propel
 * leftovers) are dropped whenever a list is given. Plans are removed from
 * BOTH the group list and every variant's allocations: leaving one behind
 * would render an offer with no price, or a price with no offer.
 *
 * An empty set means "show everything", which is only right while a product
 * has exactly one group.
 */
export function filterSellingPlanGroups<T extends ShopifyProductDetail>(product: T, groupIds: ReadonlySet<string>): T {
  if (groupIds.size === 0) return product;

  const groups = (product.sellingPlanGroups?.edges ?? []).filter(
    ({ node }) => node.appName !== null && groupIds.has(node.appName)
  );

  const allowedPlanIds = new Set(
    groups.flatMap(({ node }) => node.sellingPlans.edges.map(({ node: plan }) => plan.id))
  );

  return {
    ...product,
    sellingPlanGroups: { edges: groups },
    variants: {
      edges: product.variants.edges.map((edge) => ({
        ...edge,
        node: {
          ...edge.node,
          sellingPlanAllocations: {
            edges: (edge.node.sellingPlanAllocations?.edges ?? []).filter(
              ({ node }) => allowedPlanIds.has(node.sellingPlan.id)
            ),
          },
        },
      })),
    },
  };
}
