export const DEFAULT_API_VERSION = '2026-01';
export const PLACEHOLDER_DOMAIN = 'your-store.myshopify.com';
export function storefrontUrl(domain, apiVersion = DEFAULT_API_VERSION) {
    return `https://${domain}/api/${apiVersion}/graphql.json`;
}
// A production build makes one Storefront call per product (hundreds), so a
// single transient hiccup used to fail or silently thin out a whole deploy.
// Only genuinely transient failures are retried: a GraphQL error or a 4xx is
// deterministic, and repeating it just delays the real error.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function createStorefrontFetch(config) {
    const url = storefrontUrl(config.domain, config.apiVersion);
    const attempts = Math.max(1, config.retry?.attempts ?? 3);
    const baseDelayMs = config.retry?.baseDelayMs ?? 500;
    const sleep = config.sleep ?? defaultSleep;
    return async function storefrontFetch(query, variables = {}) {
        if (!config.useMocks) {
            if (!config.domain || config.domain === PLACEHOLDER_DOMAIN)
                throw new Error('Missing Shopify store domain');
            if (!config.token)
                throw new Error('Missing Shopify Storefront API token');
        }
        const doFetch = config.fetchImpl ?? globalThis.fetch;
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const isLastAttempt = attempt === attempts;
            let res;
            try {
                res = await doFetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Storefront-Access-Token': config.token,
                    },
                    body: JSON.stringify({ query, variables }),
                });
            }
            catch (error) {
                // fetch() itself rejecting means DNS/TLS/socket: always worth another go.
                lastError = error instanceof Error ? error : new Error(String(error));
                if (isLastAttempt)
                    throw lastError;
                await sleep(baseDelayMs * 2 ** (attempt - 1));
                continue;
            }
            if (!res.ok) {
                const error = new Error(`Shopify API error: ${res.status}`);
                if (!RETRYABLE_STATUSES.has(res.status) || isLastAttempt)
                    throw error;
                lastError = error;
                await sleep(baseDelayMs * 2 ** (attempt - 1));
                continue;
            }
            const json = await res.json();
            if (json.errors)
                throw new Error(json.errors[0]?.message ?? 'Shopify GraphQL error');
            return json.data;
        }
        // Unreachable: the final attempt either returns or throws.
        throw lastError ?? new Error('Shopify fetch failed');
    };
}
