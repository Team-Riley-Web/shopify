// Env helpers. The package never reads the environment itself: Vite only
// replaces `import.meta.env.*` inside the site's own source, not inside
// node_modules, so each site passes its `import.meta.env` in through readEnv()
// and hands the resulting values to the factories.
/**
 * Merge Vite's `import.meta.env` with `process.env`, process winning, which is
 * what every site did by hand before. `process` is absent in the browser.
 */
export function readEnv(importMetaEnv = {}) {
    const processEnv = typeof process === 'undefined' || !process ? {} : process.env;
    return { ...importMetaEnv, ...processEnv };
}
/**
 * First non-empty, trimmed value among `keys`. Values listed in `ignore` are
 * treated as unset, so a placeholder copied from .env.example cannot shadow a
 * real value set under the other name.
 */
export function envValue(env, keys, fallback = '', ignore = []) {
    for (const key of keys) {
        const value = env[key]?.trim();
        if (value && !ignore.includes(value))
            return value;
    }
    return fallback;
}
/** Comma-separated list from the first key that is defined, trimmed, blanks dropped. */
export function envList(env, keys) {
    const raw = keys.map((key) => env[key]).find((value) => value !== undefined) ?? '';
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
}
/** True when any of `keys` is exactly 'true'. */
export function envFlag(env, keys) {
    return keys.some((key) => env[key] === 'true');
}
