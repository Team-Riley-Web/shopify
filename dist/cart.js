import { cleanDomain, createStorefrontFetch } from './fetch.js';
export { cleanDomain };
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
export function createCartClient(config) {
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
    function normalizeCheckoutUrl(checkoutUrl) {
        if (!checkoutUrl)
            return '';
        try {
            const url = new URL(checkoutUrl);
            const cartCheckoutMatch = url.pathname.match(/^\/cart\/c\/([^/]+)$/);
            const pathname = cartCheckoutMatch ? `/checkouts/cn/${cartCheckoutMatch[1]}` : url.pathname;
            if (url.hostname.endsWith('.myshopify.com') && !cartCheckoutMatch)
                return url.href;
            return `https://${checkoutDomain}${pathname}${url.search}${url.hash}`;
        }
        catch {
            return checkoutUrl;
        }
    }
    function parseCart(raw) {
        const items = raw.lines.edges.map(({ node }) => ({
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
    async function createCart() {
        const data = await gql(`mutation { cartCreate(input: {}) { cart { ${CART_FRAGMENT} } } }`);
        return parseCart(data.cartCreate.cart);
    }
    async function getCart(cartId) {
        const data = await gql(`query getCart($cartId: ID!) { cart(id: $cartId) { ${CART_FRAGMENT} } }`, { cartId });
        return data.cart ? parseCart(data.cart) : null;
    }
    async function addToCart(cartId, variantId, quantity = 1, sellingPlanId) {
        const line = { merchandiseId: variantId, quantity };
        if (sellingPlanId)
            line.sellingPlanId = sellingPlanId;
        const data = await gql(CART_LINES_ADD, { cartId, lines: [line] });
        return parseCart(data.cartLinesAdd.cart);
    }
    async function addLinesToCart(cartId, lines) {
        const cartLines = lines
            .filter((line) => line.merchandiseId)
            .map((line) => ({
            merchandiseId: line.merchandiseId,
            quantity: line.quantity ?? 1,
            ...(line.sellingPlanId ? { sellingPlanId: line.sellingPlanId } : {}),
        }));
        if (cartLines.length === 0) {
            const cart = await getCart(cartId);
            if (!cart)
                throw new Error('Cart unavailable');
            return cart;
        }
        const data = await gql(CART_LINES_ADD, { cartId, lines: cartLines });
        return parseCart(data.cartLinesAdd.cart);
    }
    async function removeFromCart(cartId, lineId) {
        const data = await gql(`mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FRAGMENT} } }
    }`, { cartId, lineIds: [lineId] });
        return parseCart(data.cartLinesRemove.cart);
    }
    async function updateCartItem(cartId, lineId, quantity) {
        const data = await gql(`mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`, { cartId, lines: [{ id: lineId, quantity }] });
        return parseCart(data.cartLinesUpdate.cart);
    }
    async function updateCartDiscountCodes(cartId, discountCodes) {
        const data = await gql(`mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart { ${CART_FRAGMENT} }
        userErrors { field message }
      }
    }`, { cartId, discountCodes });
        const userError = data.cartDiscountCodesUpdate.userErrors?.[0];
        if (userError)
            throw new Error(userError.message);
        return parseCart(data.cartDiscountCodesUpdate.cart);
    }
    async function searchProducts(query) {
        const data = await gql(`query predictiveSearch($query: String!) {
      predictiveSearch(query: $query, types: [PRODUCT], limit: ${searchFetchLimit}) {
        products {
          id title handle tags
          priceRange { minVariantPrice { amount currencyCode } }
          images(first: 1) { edges { node { url altText } } }
          variants(first: 1) { edges { node { id } } }
        }
      }
    }`, { query });
        return (data.predictiveSearch?.products ?? [])
            .filter((p) => !searchFilter || searchFilter({ title: p.title ?? '', handle: p.handle ?? '', tags: p.tags ?? [] }))
            .slice(0, searchLimit)
            .map((p) => ({
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
