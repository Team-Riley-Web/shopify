import { createStorefrontFetch } from './fetch.js';
import { demoProducts } from './mocks.js';
import { collectionProductsQuery, productByHandleListingQuery, productDetailQuery, productsQuery, } from './queries.js';
export const DEFAULT_FEATURED_COLLECTION = 'featured-collection';
function mockDetail(product) {
    return {
        ...product,
        descriptionHtml: `<p>${product.description}</p>`,
        priceRange: {
            ...product.priceRange,
            maxVariantPrice: product.priceRange.minVariantPrice,
        },
        images: product.images,
        variants: {
            edges: product.variants.edges.map((e) => ({
                node: { ...e.node, availableForSale: product.availableForSale },
            })),
        },
    };
}
export function createCatalog(config) {
    const fetch = createStorefrontFetch(config);
    const onError = config.onError ?? 'silent';
    const logger = config.logger ?? console;
    const listingFilter = config.listingFilter ?? (() => true);
    const featuredCollection = config.featuredCollection ?? DEFAULT_FEATURED_COLLECTION;
    const featuredMinimum = config.featuredMinimum ?? 0;
    const mocks = () => config.mockProducts ?? demoProducts;
    const PRODUCTS_QUERY = productsQuery(config.listingImages, config.listingQuery);
    const COLLECTION_QUERY = collectionProductsQuery(config.listingImages);
    const BY_HANDLE_QUERY = productByHandleListingQuery(config.listingImages);
    const DETAIL_QUERY = productDetailQuery(config.detailImages, config.listingImages);
    function handleError(context, error) {
        const message = error instanceof Error ? error.message : String(error);
        if (onError === 'throw')
            throw new Error(`${context}: ${message}`);
        if (onError === 'warn')
            logger.warn(`${context}:`, message);
    }
    const filterListing = (products) => products.filter(listingFilter);
    async function getProducts(first = 24, sortKey = 'BEST_SELLING') {
        if (config.useMocks)
            return mocks().slice(0, first);
        try {
            const data = await fetch(PRODUCTS_QUERY, { first, after: null, sortKey });
            return filterListing(data.products.edges.map((e) => e.node));
        }
        catch (error) {
            handleError('Shopify products fetch failed', error);
            return [];
        }
    }
    async function getAllProducts(sortKey = 'BEST_SELLING') {
        if (config.useMocks)
            return mocks();
        const products = [];
        let after = null;
        let hasNextPage = true;
        while (hasNextPage) {
            try {
                const data = await fetch(PRODUCTS_QUERY, { first: 100, after, sortKey });
                products.push(...data.products.edges.map((e) => e.node));
                hasNextPage = data.products.pageInfo?.hasNextPage ?? false;
                after = data.products.pageInfo?.endCursor ?? null;
                // A page that claims to continue but gives no cursor would refetch page 1 forever.
                if (hasNextPage && !after)
                    break;
            }
            catch (error) {
                handleError('Shopify all-products fetch failed', error);
                return filterListing(products);
            }
        }
        return filterListing(products);
    }
    async function getCollectionProducts(handle, first = 24) {
        if (config.useMocks) {
            return mocks().filter((product) => {
                const text = product.collections.edges.map(({ node }) => node.title.toLowerCase()).join(' ');
                return handle === 'featured' || handle === featuredCollection || text.includes(handle.toLowerCase());
            }).slice(0, first);
        }
        try {
            const data = await fetch(COLLECTION_QUERY, { handle, first });
            return filterListing(data.collection?.products.edges.map((e) => e.node) ?? []);
        }
        catch (error) {
            handleError('Shopify collection fetch failed', error);
            return [];
        }
    }
    async function getProductsByHandles(handles) {
        if (config.useMocks) {
            const products = mocks();
            return handles
                .map((handle) => products.find((product) => product.handle === handle))
                .filter((product) => Boolean(product));
        }
        const products = await Promise.all(handles.map(async (handle) => {
            try {
                const data = await fetch(BY_HANDLE_QUERY, { handle });
                return data.product;
            }
            catch (error) {
                handleError(`Shopify product fetch failed for ${handle}`, error);
                return null;
            }
        }));
        return products.filter((product) => Boolean(product));
    }
    async function getFeaturedProducts() {
        const collectionProducts = await getCollectionProducts(featuredCollection, 24);
        if (collectionProducts.length >= featuredMinimum)
            return collectionProducts;
        const fallbackProducts = await getProducts(24);
        const featuredIds = new Set(collectionProducts.map((product) => product.id));
        const uniqueFallback = fallbackProducts.filter((product) => !featuredIds.has(product.id));
        return [...collectionProducts, ...uniqueFallback].slice(0, 24);
    }
    async function getProductByHandle(handle) {
        if (config.useMocks) {
            const mock = mocks().find((p) => p.handle === handle);
            return mock ? mockDetail(mock) : null;
        }
        try {
            const data = await fetch(DETAIL_QUERY, { handle });
            if (!data.product)
                return null;
            const { metafield, ...product } = data.product;
            const references = metafield?.references?.edges.map(({ node }) => node) ?? [];
            const detail = { ...product, relatedProducts: filterListing(references) };
            return config.detailTransform ? config.detailTransform(detail) : detail;
        }
        catch (error) {
            handleError(`Shopify product detail fetch failed for ${handle}`, error);
            return null;
        }
    }
    return {
        fetch,
        getProducts,
        getAllProducts,
        getCollectionProducts,
        getProductsByHandles,
        getProductByHandle,
        getFeaturedProducts,
    };
}
export function formatPrice(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}
