export type EnvRecord = Record<string, string | undefined>;
/**
 * Merge Vite's env object with `process.env`, process winning, which is
 * what every site did by hand before. `process` is absent in the browser.
 */
export declare function readEnv(importMetaEnv?: EnvRecord): EnvRecord;
/**
 * First non-empty, trimmed value among `keys`. Values listed in `ignore` are
 * treated as unset, so a placeholder copied from .env.example cannot shadow a
 * real value set under the other name.
 */
export declare function envValue(env: EnvRecord, keys: string[], fallback?: string, ignore?: string[]): string;
/** Comma-separated list from the first key that is defined, trimmed, blanks dropped. */
export declare function envList(env: EnvRecord, keys: string[]): string[];
/** True when any of `keys` is exactly 'true'. */
export declare function envFlag(env: EnvRecord, keys: string[]): boolean;
