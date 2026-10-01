import { describe, expect, it, vi } from 'vitest';
import { createStorefrontFetch, DEFAULT_API_VERSION, storefrontUrl } from '../src/fetch.js';

const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const status = (code: number) => new Response('nope', { status: code });

function setup(responses: Array<Response | Error>, overrides = {}) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => { delays.push(ms); });
  const fetch = createStorefrontFetch({
    domain: 'shop.myshopify.com',
    token: 'tok',
    fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    sleep,
    ...overrides,
  });
  return { fetch, fetchImpl, delays };
}

describe('storefrontUrl', () => {
  it('defaults to the current API version', () => {
    expect(DEFAULT_API_VERSION).toBe('2026-01');
    expect(storefrontUrl('shop.myshopify.com')).toBe('https://shop.myshopify.com/api/2026-01/graphql.json');
    expect(storefrontUrl('shop.myshopify.com', '2025-07')).toBe('https://shop.myshopify.com/api/2025-07/graphql.json');
  });
});

describe('createStorefrontFetch', () => {
  it('posts the query with the storefront token and returns data', async () => {
    const { fetch, fetchImpl } = setup([ok({ shop: { name: 'x' } })]);
    await expect(fetch('{ shop { name } }', { a: 1 })).resolves.toEqual({ shop: { name: 'x' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://shop.myshopify.com/api/2026-01/graphql.json');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token']).toBe('tok');
    expect(JSON.parse(init.body as string)).toEqual({ query: '{ shop { name } }', variables: { a: 1 } });
  });

  it('uses the configured API version', async () => {
    const { fetch, fetchImpl } = setup([ok({})], { apiVersion: '2025-04' });
    await fetch('{}');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://shop.myshopify.com/api/2025-04/graphql.json');
  });

  it('retries transient statuses with exponential backoff', async () => {
    const { fetch, fetchImpl, delays } = setup([status(503), status(429), ok({ n: 1 })]);
    await expect(fetch('{}')).resolves.toEqual({ n: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
  });

  it('gives up after the last attempt with the status in the message', async () => {
    const { fetch, fetchImpl } = setup([status(502), status(502), status(502)]);
    await expect(fetch('{}')).rejects.toThrow('Shopify API error: 502');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries a rejected fetch (DNS/TLS/socket)', async () => {
    const { fetch, fetchImpl } = setup([new TypeError('fetch failed'), ok({ n: 2 })]);
    await expect(fetch('{}')).resolves.toEqual({ n: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rethrows the network error after the last attempt', async () => {
    const { fetch } = setup([new TypeError('a'), new TypeError('b'), new TypeError('fetch failed')]);
    await expect(fetch('{}')).rejects.toThrow('fetch failed');
  });

  it('does not retry deterministic 4xx failures', async () => {
    const { fetch, fetchImpl } = setup([status(401)]);
    await expect(fetch('{}')).rejects.toThrow('Shopify API error: 401');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry GraphQL errors', async () => {
    const { fetch, fetchImpl } = setup([
      new Response(JSON.stringify({ errors: [{ message: 'Field x does not exist' }] }), { status: 200 }),
    ]);
    await expect(fetch('{}')).rejects.toThrow('Field x does not exist');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honours a custom attempt count', async () => {
    const { fetch, fetchImpl } = setup([status(503)], { retry: { attempts: 1 } });
    await expect(fetch('{}')).rejects.toThrow('Shopify API error: 503');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses to run against the placeholder or an empty domain', async () => {
    for (const domain of ['your-store.myshopify.com', '']) {
      const { fetch, fetchImpl } = setup([ok({})], { domain });
      await expect(fetch('{}')).rejects.toThrow('Missing Shopify store domain');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses to run without a token', async () => {
    const { fetch, fetchImpl } = setup([ok({})], { token: '' });
    await expect(fetch('{}')).rejects.toThrow('Missing Shopify Storefront API token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips the guards in mock mode', async () => {
    const { fetch } = setup([ok({ n: 3 })], { token: '', domain: 'your-store.myshopify.com', useMocks: true });
    await expect(fetch('{}')).resolves.toEqual({ n: 3 });
  });

  it('uses the global fetch when none is injected', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ g: 1 }));
    const fetch = createStorefrontFetch({ domain: 'shop.myshopify.com', token: 't' });
    await expect(fetch('{}')).resolves.toEqual({ g: 1 });
    spy.mockRestore();
  });
});
