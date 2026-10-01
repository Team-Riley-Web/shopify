// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cart } from '../src/cart.js';
import { CART_STORAGE_KEY, DISCOUNT_STORAGE_KEY, createCartStore } from '../src/cart-store.js';

const variantId = 'gid://shopify/ProductVariant/2001';
const alternateVariantId = 'gid://shopify/ProductVariant/2002';
const sellingPlanId = 'gid://shopify/SellingPlan/3001';

function cartFixture(quantity: number): Cart {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://shop.myshopify.com/checkouts/cn/test',
    discountCodes: [],
    totalQuantity: quantity,
    totalAmount: `${28 * quantity}.00`,
    items: quantity > 0 ? [{
      id: 'gid://shopify/CartLine/line-1', quantity, variantId, variantTitle: 'Default Title', price: '28.00',
      productTitle: 'Mug', productHandle: 'mug', imageUrl: '', imageAlt: '', sellingPlanId: '', sellingPlanName: '',
    }] : [],
  };
}

function mockApi() {
  return {
    createCart: vi.fn(async () => cartFixture(0)),
    getCart: vi.fn(async () => cartFixture(1)),
    addToCart: vi.fn(async (_cartId: string, _variantId: string, quantity: number, _sellingPlanId?: string) => cartFixture(quantity)),
    addLinesToCart: vi.fn(async (_cartId: string, lines: Array<{ quantity?: number }>) => (
      cartFixture(lines.reduce((total, line) => total + (line.quantity ?? 1), 0))
    )),
    removeFromCart: vi.fn(async () => cartFixture(0)),
    updateCartItem: vi.fn(async (_cartId: string, _lineId: string, quantity: number) => cartFixture(quantity)),
    updateCartDiscountCodes: vi.fn(async (_cartId: string, discountCodes: string[]) => ({
      ...cartFixture(1),
      discountCodes: discountCodes.map((code) => ({ code, applicable: true })),
    })),
  };
}

afterEach(() => localStorage.clear());

describe('public contract', () => {
  it('exposes every member the storefront templates and the wholesale tab bind to', () => {
    const store = createCartStore(mockApi());
    const state = ['isOpen', 'isLoading', 'id', 'items', 'totalQuantity', 'totalAmount', 'checkoutUrl', 'errorMessage'];
    const methods = ['init', 'applyCart', 'addItem', 'addItems', 'removeItem', 'updateItem', 'open', 'close', 'formatPrice',
      'getPendingDiscountCode', 'clearPendingDiscountCode', 'applyPendingDiscountCode'];
    for (const key of state) expect(store).toHaveProperty(key);
    for (const key of methods) expect(typeof (store as any)[key]).toBe('function');
    expect(CART_STORAGE_KEY).toBe('shopify_cart_id');
    expect(DISCOUNT_STORAGE_KEY).toBe('shopify_discount_code');
  });

  it('formats prices in the configured currency', () => {
    expect(createCartStore(mockApi()).formatPrice('12.5')).toBe('$12.50');
    expect(createCartStore(mockApi(), { currency: 'EUR' }).formatPrice('12.5')).toBe('€12.50');
    expect(createCartStore(mockApi()).formatPrice('garbage')).toBe('$0.00');
  });
});

describe('cart store behaviour', () => {
  it('adds a product to cart and opens the drawer', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(api.createCart).toHaveBeenCalled();
    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', variantId, 1);
    expect(store.items).toHaveLength(1);
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it('adds a selected variant with quantity', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem(alternateVariantId, 2);
    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', alternateVariantId, 2);
    expect(store.totalQuantity).toBe(2);
  });

  it('passes selling plan IDs through cart adds', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem(variantId, 1, sellingPlanId);
    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', variantId, 1, sellingPlanId);
  });

  it('adds multiple lines in one call and opens the drawer unless told not to', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItems([{ merchandiseId: variantId, quantity: 1 }, { merchandiseId: alternateVariantId, quantity: 1 }]);
    expect(api.addLinesToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', [
      { merchandiseId: variantId, quantity: 1 }, { merchandiseId: alternateVariantId, quantity: 1 },
    ]);
    expect(store.totalQuantity).toBe(2);
    expect(store.isOpen).toBe(true);

    store.close();
    await store.addItems([{ merchandiseId: variantId }], { openCart: false });
    expect(store.isOpen).toBe(false);
  });

  it('rejects an addItems call with no valid lines', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItems([{ merchandiseId: '' }, { merchandiseId: variantId, quantity: 0 }]);
    expect(api.addLinesToCart).not.toHaveBeenCalled();
    expect(store.errorMessage).toBe('These products are not available right now.');
  });

  it('persists and restores the cart across page loads', async () => {
    localStorage.setItem(CART_STORAGE_KEY, 'gid://shopify/Cart/cart-1');
    const api = mockApi();
    const store = createCartStore(api);
    await store.init();
    expect(api.getCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1');
    expect(api.createCart).not.toHaveBeenCalled();
    expect(store.totalQuantity).toBe(1);
  });

  it('creates a fresh cart when the saved one is gone, and forgets a saved id that errors', async () => {
    localStorage.setItem(CART_STORAGE_KEY, 'stale');
    const api = mockApi();
    api.getCart.mockRejectedValueOnce(new Error('boom'));
    const store = createCartStore(api);
    await store.init();
    expect(api.createCart).toHaveBeenCalled();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe('gid://shopify/Cart/cart-1');
  });

  it('reports when the cart cannot be created at all', async () => {
    const api = mockApi();
    api.createCart.mockRejectedValueOnce(new Error('down'));
    const store = createCartStore(api);
    await store.init();
    expect(store.errorMessage).toBe('Cart is temporarily unavailable. Please try again.');
    expect(store.id).toBeNull();
  });

  it('applies a pending discount code to a restored cart', async () => {
    localStorage.setItem(CART_STORAGE_KEY, 'gid://shopify/Cart/cart-1');
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'COLLAB10');
    const api = mockApi();
    const store = createCartStore(api);
    await store.init();
    expect(api.updateCartDiscountCodes).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', ['COLLAB10']);
    expect(store.checkoutUrl).toContain('discount=COLLAB10');
  });

  it('applies a pending discount code after adding an item', async () => {
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'COLLAB10');
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(api.updateCartDiscountCodes).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', ['COLLAB10']);
    expect(store.checkoutUrl).toContain('discount=COLLAB10');
  });

  it('keeps a pending code when the cart is still empty', async () => {
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'ALAINA');
    const api = mockApi();
    const store = createCartStore(api);
    await store.init();
    expect(api.updateCartDiscountCodes).not.toHaveBeenCalled();
    expect(localStorage.getItem(DISCOUNT_STORAGE_KEY)).toBe('ALAINA');
  });

  it('keeps a code Shopify rejects, and still puts it on the checkout URL', async () => {
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'ALAINA');
    const api = mockApi();
    api.updateCartDiscountCodes.mockResolvedValueOnce({ ...cartFixture(1), discountCodes: [{ code: 'ALAINA', applicable: false }] });
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(localStorage.getItem(DISCOUNT_STORAGE_KEY)).toBe('ALAINA');
    expect(store.checkoutUrl).toContain('discount=ALAINA');
  });

  it('keeps a code when the discount call fails outright', async () => {
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'ALAINA');
    const api = mockApi();
    api.updateCartDiscountCodes.mockRejectedValueOnce(new Error('503'));
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(localStorage.getItem(DISCOUNT_STORAGE_KEY)).toBe('ALAINA');
    expect(store.checkoutUrl).toContain('discount=ALAINA');
  });

  it('stops reapplying a discount code once the cart has accepted it', async () => {
    // A referral code used to live in localStorage forever, so it reattached to
    // every later cart on the same browser, including subscription orders.
    localStorage.setItem(DISCOUNT_STORAGE_KEY, 'CHRISTAL');
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(store.checkoutUrl).toContain('discount=CHRISTAL');
    expect(localStorage.getItem(DISCOUNT_STORAGE_KEY)).toBeNull();
    await store.addItem(alternateVariantId, 1);
    expect(api.updateCartDiscountCodes).toHaveBeenCalledTimes(1);
  });

  it('updates quantities, and removes the line when quantity drops below one', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    store.applyCart(cartFixture(1));
    await store.updateItem('gid://shopify/CartLine/line-1', 3);
    expect(store.totalQuantity).toBe(3);
    await store.updateItem('gid://shopify/CartLine/line-1', 0);
    expect(api.removeFromCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', 'gid://shopify/CartLine/line-1');
    expect(store.items).toEqual([]);
  });

  it('removing an item updates cart state', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    store.applyCart(cartFixture(1));
    await store.removeItem('gid://shopify/CartLine/line-1');
    expect(store.items).toEqual([]);
    expect(store.totalQuantity).toBe(0);
  });

  it('does nothing on remove/update before a cart exists', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.removeItem('x');
    await store.updateItem('x', 2);
    expect(api.removeFromCart).not.toHaveBeenCalled();
    expect(api.updateCartItem).not.toHaveBeenCalled();
  });

  it('prevents unavailable variants from being added', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    await store.addItem('', 1);
    expect(api.addToCart).not.toHaveBeenCalled();
    expect(store.errorMessage).toBe('This product is not available right now.');
  });

  it('shows friendly messages for API errors and clears isLoading', async () => {
    const api = mockApi();
    api.addToCart.mockRejectedValueOnce(new Error('GraphQL unavailable'));
    api.removeFromCart.mockRejectedValueOnce(new Error('x'));
    api.updateCartItem.mockRejectedValueOnce(new Error('x'));
    api.addLinesToCart.mockRejectedValueOnce(new Error('x'));
    const store = createCartStore(api);
    await store.addItem(variantId, 1);
    expect(store.errorMessage).toBe('We could not add that item to your cart. Please try again.');
    await store.removeItem('line');
    expect(store.errorMessage).toBe('We could not remove that item. Please try again.');
    await store.updateItem('line', 2);
    expect(store.errorMessage).toBe('We could not update your cart. Please try again.');
    await store.addItems([{ merchandiseId: variantId }]);
    expect(store.errorMessage).toBe('We could not add those items to your cart. Please try again.');
    expect(store.isLoading).toBe(false);
  });
});
