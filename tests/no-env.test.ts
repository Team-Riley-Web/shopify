import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vite only replaces `import.meta.env.*` inside the consuming site's own source,
// never inside node_modules, so a read here would silently be undefined in
// production. Sites read their env and pass values into the factories.
// `process.env` is allowed in env.ts only (readEnv merges it at runtime, behind
// a browser-safe guard).
describe('package never reads the environment itself', () => {
  const files = readdirSync(join(import.meta.dirname, '../src')).filter((f) => f.endsWith('.ts'));

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(import.meta.dirname, '../src', file), 'utf8');
    expect(source).not.toContain('import.meta.env');
    if (file !== 'env.ts') expect(source).not.toContain('process.env');
  });
});
