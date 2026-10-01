import { cleanDomain, createStorefrontFetch, type StorefrontConfig } from './fetch.js';

export { cleanDomain };

export interface CartClientConfig extends StorefrontConfig {
  /** Where checkout happens. Default: `domain`. Protocol and path are stripped. */
  checkoutDomain?: string;
  /** The static storefront's own domains. Checkout must never be sent there. */
  headlessDomains?: string[];
  /** Used when `checkoutDomain` turns out to be a headless domain. Default: `domain`. */
  headlessFallbackDomain?: string;
  /** Search results returned. Default 8. */
  searchLimit?: number;
  /** Results requested from predictiveSearch (filter runs before the cap). Default: searchLimit. */
  searchFetchLimit?: number;
  /** Drop search results the store should not show (wholesale, internal test products...). */
  searchFilter?: (product: { title: string; handle: string; tags: string[] }) => boolean;
}

export interface CartLineItem {
  id: string;
  quantity: number;
  variantId: string;
  variantTitle: string;
  price: string;
  productTitle: string;
  productHandle: string;
  imageUrl: string;
  imageAlt: string;
  sellingPlanId: string;
  sellingPlanName: string;
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  totalQuantity: number;
  totalAmount: string;
  items: CartLineItem[];
}

export interface SearchProduct {
  id: string;
  title: string;
  handle: string;
  price: string;
  imageUrl: string;
  imageAlt: string;
  variantId: string;
}

export interface CartLineInput {
  merchandiseId: string;
  quantity?: number;
  sellingPlanId?: string;
}

export interface CartClient {
  createCart(): Promise<Cart>;
  getCart(cartId: string): Promise<Cart | null>;
  addToCart(cartId: string, variantId: string, quantity?: number, sellingPlanId?: string): Promise<Cart>;
  addLinesToCart(cartId: string, lines: CartLineInput[]): Promise<Cart>;
  removeFromCart(cartId: string, lineId: string): Promise<Cart>;
  updateCartItem(cartId: string, lineId: string, quantity: number): Promise<Cart>;
  updateCartDiscountCodes(cartId: string, discountCodes: string[]): Promise<Cart>;
  searchProducts(query: string): Promise<SearchProduct[]>;
  normalizeCheckoutUrl(checkoutUrl: string): string;
  parseCart(raw: any): Cart;
}

const CART_FRAGMENT = `
  id
  checkoutUrl
  discountCodes { code applicable }
  totalQuantity
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        sellingPlanAllocation {
          sellingPlan { id name }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            price { amount currencyCode }
            product {
              title
              handle
              images(first: 1) { edges { node { url altText } } }
            }
          }
        }
      }
    }
  }
  cost { totalAmount { amount currencyCode } }
`;

const CART_LINES_ADD = `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`;

export function createCartClient(config: CartClientConfig): CartClient {
  // Browser calls fail fast: a shopper clicking "add to cart" should see an
  // error now, not after seconds of silent backoff.
  const gql = createStorefrontFetch({ ...config, retry: config.retry ?? { attempts: 1 } });

  const storeDomain = cleanDomain(config.domain);
  const configuredCheckout = cleanDomain(config.checkoutDomain) || storeDomain;
  const headless = new Set((config.headlessDomains ?? []).map(cleanDomain).filter(Boolean));
  const checkoutDomain = headless.has(configuredCheckout)
    ? cleanDomain(config.headlessFallbackDomain) || storeDomain
    : configuredCheckout;
  const searchLimit = config.searchLimit ?? 8;
  const searchFetchLimit = config.searchFetchLimit ?? searchLimit;
  const searchFilter = config.searchFilter;

  function normalizeCheckoutUrl(checkoutUrl: string): string {
    if (!checkoutUrl) return '';

    try {
      const url = new URL(checkoutUrl);
      const cartCheckoutMatch = url.pathname.match(/^\/cart\/c\/([^/]+)$/);
      const pathname = cartCheckoutMatch ? `/checkouts/cn/${cartCheckoutMatch[1]}` : url.pathname;

      if (url.hostname.endsWith('.myshopify.com') && !cartCheckoutMatch) return url.href;
      return `https://${checkoutDomain}${pathname}${url.search}${url.hash}`;
    } catch {
      return checkoutUrl;
    }
  }

  function parseCart(raw: any): Cart {
    const items = raw.lines.edges.map(({ node }: any) => ({
      id: node.id,
      quantity: node.quantity,
      variantId: node.merchandise.id,
      variantTitle: node.merchandise.title,
      price: node.merchandise.price.amount,
      productTitle: node.merchandise.product.title,
      productHandle: node.merchandise.product.handle,
      imageUrl: node.merchandise.product.images.edges[0]?.node.url ?? '',
      imageAlt: node.merchandise.product.images.edges[0]?.node.altText ?? '',
      sellingPlanId: node.sellingPlanAllocation?.sellingPlan?.id ?? '',
      sellingPlanName: node.sellingPlanAllocation?.sellingPlan?.name ?? '',
    }));

    return {
      id: raw.id,
      checkoutUrl: normalizeCheckoutUrl(raw.checkoutUrl),
      discountCodes: raw.discountCodes ?? [],
      totalQuantity: raw.totalQuantity,
      totalAmount: raw.cost.totalAmount.amount,
      items,
    };
  }

  async function createCart(): Promise<Cart> {
    const data = await gql<any>(`mutation { cartCreate(input: {}) { cart { ${CART_FRAGMENT} } } }`);
    return parseCart(data.cartCreate.cart);
  }

  async function getCart(cartId: string): Promise<Cart | null> {
    const data = await gql<any>(
      `query getCart($cartId: ID!) { cart(id: $cartId) { ${CART_FRAGMENT} } }`,
      { cartId }
    );
    return data.cart ? parseCart(data.cart) : null;
  }

  async function addToCart(cartId: string, variantId: string, quantity = 1, sellingPlanId?: string): Promise<Cart> {
    const line: { merchandiseId: string; quantity: number; sellingPlanId?: string } = { merchandiseId: variantId, quantity };
    if (sellingPlanId) line.sellingPlanId = sellingPlanId;

    const data = await gql<any>(CART_LINES_ADD, { cartId, lines: [line] });
    return parseCart(data.cartLinesAdd.cart);
  }

  async function addLinesToCart(cartId: string, lines: CartLineInput[]): Promise<Cart> {
    const cartLines = lines
      .filter((line) => line.merchandiseId)
      .map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity ?? 1,
        ...(line.sellingPlanId ? { sellingPlanId: line.sellingPlanId } : {}),
      }));

    if (cartLines.length === 0) {
      const cart = await getCart(cartId);
      if (!cart) throw new Error('Cart unavailable');
      return cart;
    }

    const data = await gql<any>(CART_LINES_ADD, { cartId, lines: cartLines });
    return parseCart(data.cartLinesAdd.cart);
  }

  async function removeFromCart(cartId: string, lineId: string): Promise<Cart> {
    const data = await gql<any>(
      `mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FRAGMENT} } }
    }`,
      { cartId, lineIds: [lineId] }
    );
    return parseCart(data.cartLinesRemove.cart);
  }

  async function updateCartItem(cartId: string, lineId: string, quantity: number): Promise<Cart> {
    const data = await gql<any>(
      `mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`,
      { cartId, lines: [{ id: lineId, quantity }] }
    );
    return parseCart(data.cartLinesUpdate.cart);
  }

  async function updateCartDiscountCodes(cartId: string, discountCodes: string[]): Promise<Cart> {
    const data = await gql<any>(
      `mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart { ${CART_FRAGMENT} }
        userErrors { field message }
      }
    }`,
      { cartId, discountCodes }
    );
    const userError = data.cartDiscountCodesUpdate.userErrors?.[0];
    if (userError) throw new Error(userError.message);
    return parseCart(data.cartDiscountCodesUpdate.cart);
  }

  async function searchProducts(query: string): Promise<SearchProduct[]> {
    const data = await gql<any>(
      `query predictiveSearch($query: String!) {
      predictiveSearch(query: $query, types: [PRODUCT], limit: ${searchFetchLimit}) {
        products {
          id title handle tags
          priceRange { minVariantPrice { amount currencyCode } }
          images(first: 1) { edges { node { url altText } } }
          variants(first: 1) { edges { node { id } } }
        }
      }
    }`,
      { query }
    );
    return (data.predictiveSearch?.products ?? [])
      .filter((p: any) => !searchFilter || searchFilter({ title: p.title ?? '', handle: p.handle ?? '', tags: p.tags ?? [] }))
      .slice(0, searchLimit)
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        price: p.priceRange.minVariantPrice.amount,
        imageUrl: p.images.edges[0]?.node.url ?? '',
        imageAlt: p.images.edges[0]?.node.altText ?? '',
        variantId: p.variants.edges[0]?.node.id ?? '',
      }));
  }

  return {
    createCart,
    getCart,
    addToCart,
    addLinesToCart,
    removeFromCart,
    updateCartItem,
    updateCartDiscountCodes,
    searchProducts,
    normalizeCheckoutUrl,
    parseCart,
  };
}
