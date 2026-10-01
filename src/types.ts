export interface Money {
  amount: string;
  currencyCode: string;
}

export interface Edges<T> {
  edges: Array<{ node: T }>;
}

export interface ProductImage {
  url: string;
  altText: string | null;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  availableForSale: boolean;
  /** Shopify standard taxonomy category. Null when the product has none. */
  category?: { id: string; name: string } | null;
  priceRange: {
    minVariantPrice: Money;
  };
  images: Edges<ProductImage>;
  variants: Edges<{ id: string; title: string; price: { amount: string } }>;
  tags: string[];
  collections: Edges<{ title: string; handle: string }>;
}

export interface SellingPlanBillingPolicy {
  interval?: string | null;
  intervalCount?: number | null;
}

export interface SellingPlan {
  id: string;
  name: string;
  description: string | null;
  recurringDeliveries: boolean;
  options: Array<{ name: string; value: string }>;
  billingPolicy?: SellingPlanBillingPolicy | null;
}

export interface SellingPlanAllocation {
  sellingPlan: SellingPlan;
  priceAdjustments: Array<{
    price: Money;
    compareAtPrice: Money | null;
    perDeliveryPrice: Money;
  }>;
}

export interface ShopifyVariantDetail {
  id: string;
  title: string;
  price: { amount: string };
  availableForSale: boolean;
  sellingPlanAllocations?: Edges<SellingPlanAllocation>;
}

export interface SellingPlanGroup {
  name: string;
  /** The app that owns the group. Bold puts its group ID here; Propel leaves it null. */
  appName: string | null;
  options: Array<{ name: string; values: string[] }>;
  sellingPlans: Edges<SellingPlan>;
}

export interface ShopifyProductDetail extends Omit<ShopifyProduct, 'priceRange' | 'variants' | 'images'> {
  descriptionHtml: string;
  priceRange: {
    minVariantPrice: Money;
    maxVariantPrice: Money;
  };
  options?: Array<{ name: string; values: string[] }>;
  images: Edges<ProductImage>;
  variants: Edges<ShopifyVariantDetail>;
  sellingPlanGroups?: Edges<SellingPlanGroup>;
  /** Products referenced by the `custom.related_products` metafield, filtered like any listing. */
  relatedProducts?: ShopifyProduct[];
}
