/** Case- and whitespace-insensitive tag check. */
export function hasTag(product, tag) {
    const wanted = tag.trim().toLowerCase();
    return product.tags.some((value) => value.trim().toLowerCase() === wanted);
}
/**
 * Wholesale / Back Bar SKUs are published to the storefront channel so B2B
 * buyers can purchase them, which also puts them in every retail listing.
 * Matches on text (title, handle, description, tags) or on every collection
 * being a wholesale one.
 */
export function isWholesaleProduct(product) {
    const productText = [product.title, product.handle, product.description, ...product.tags]
        .join(' ')
        .toLowerCase();
    if (productText.includes('back bar') ||
        productText.includes('wholesale') ||
        productText.includes('whole sale')) {
        return true;
    }
    const collections = product.collections.edges.map(({ node }) => `${node.title} ${node.handle}`.toLowerCase());
    return collections.length > 0 && collections.every((c) => c.includes('wholesale') || c.includes('back bar'));
}
/** `listingFilter` that keeps retail products only. */
export const excludeWholesale = (product) => !isWholesaleProduct(product);
