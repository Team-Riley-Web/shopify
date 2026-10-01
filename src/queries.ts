// GraphQL documents. Fields are the union of what every storefront reads; a
// field one store ignores costs nothing and keeps one query shape for all.

export function productListingFields(images = 1): string {
  return `
  id
  title
  handle
  description
  availableForSale
  tags
  category {
    id
    name
  }
  priceRange {
    minVariantPrice { amount currencyCode }
  }
  images(first: ${images}) {
    edges { node { url altText } }
  }
  variants(first: 1) {
    edges { node { id title price { amount } } }
  }
  collections(first: 10) {
    edges { node { title handle } }
  }
`;
}

export function productsQuery(images = 1, listingQuery = ''): string {
  const filter = listingQuery ? `, query: ${JSON.stringify(listingQuery)}` : '';
  return `
  query GetProducts($first: Int!, $after: String, $sortKey: ProductSortKeys) {
    products(first: $first, after: $after, sortKey: $sortKey${filter}) {
      edges {
        cursor
        node {
          ${productListingFields(images)}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
}

export function collectionProductsQuery(images = 1): string {
  return `
  query GetCollectionProducts($handle: String!, $first: Int!) {
    collection(handle: $handle) {
      products(first: $first) {
        edges {
          node {
            ${productListingFields(images)}
          }
        }
      }
    }
  }
`;
}

export function productByHandleListingQuery(images = 1): string {
  return `
  query GetProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${productListingFields(images)}
    }
  }
`;
}

const BILLING_POLICY = `
  billingPolicy {
    ... on SellingPlanRecurringBillingPolicy { interval intervalCount }
  }
`;

export function productDetailQuery(images = 8, listingImages = 1): string {
  return `
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      id
      title
      handle
      description
      descriptionHtml
      availableForSale
      tags
      category {
        id
        name
      }
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      options {
        name
        values
      }
      images(first: ${images}) {
        edges { node { url altText } }
      }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount }
            sellingPlanAllocations(first: 10) {
              edges {
                node {
                  sellingPlan {
                    id
                    name
                    description
                    recurringDeliveries
                    options { name value }
                    ${BILLING_POLICY}
                  }
                  priceAdjustments {
                    price { amount currencyCode }
                    compareAtPrice { amount currencyCode }
                    perDeliveryPrice { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
      sellingPlanGroups(first: 10) {
        edges {
          node {
            name
            appName
            options { name values }
            sellingPlans(first: 10) {
              edges {
                node {
                  id
                  name
                  description
                  recurringDeliveries
                  options { name value }
                  ${BILLING_POLICY}
                }
              }
            }
          }
        }
      }
      metafield(namespace: "custom", key: "related_products") {
        references(first: 4) {
          edges {
            node {
              ... on Product {
                ${productListingFields(listingImages)}
              }
            }
          }
        }
      }
      collections(first: 10) {
        edges { node { title handle } }
      }
    }
  }
`;
}
