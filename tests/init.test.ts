import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { init } from '../lib/init.mjs';

const STARTER_ALPINE = `import type { Alpine } from 'alpinejs';
import intersect from '@alpinejs/intersect';

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);
};
`;

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeStarter() {
  dir = mkdtempSync(join(tmpdir(), 'starter-'));
  mkdirSync(join(dir, 'src/lib'), { recursive: true });
  writeFileSync(join(dir, 'src/alpine.ts'), STARTER_ALPINE);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'astro build' }, devDependencies: {} }, null, 2));
  return dir;
}

describe('init', () => {
  it('copies the template, wires alpine.ts and package.json', () => {
    const cwd = fakeStarter();
    const result = init({ cwd, log: () => {} });

    expect(result.copied).toContain('src/lib/shopify.ts');
    expect(result.copied).toContain('src/pages/products/[handle].astro');
    expect(existsSync(join(cwd, 'public/_redirects'))).toBe(true);
    expect(result.alpineWired).toBe(true);
    const alpine = readFileSync(join(cwd, 'src/alpine.ts'), 'utf8');
    expect(alpine).toContain("import { registerShopify } from './alpine-shopify';");
    expect(alpine).toContain('  Alpine.plugin(intersect);\n  registerShopify(Alpine);');
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:e2e']).toMatch(/SHOPIFY_USE_MOCKS=true .*npm run build && playwright test/);
    expect(pkg.scripts.build).toBe('astro build');
    expect(pkg.devDependencies['@playwright/test']).toMatch(/^\^1\./);
  });

  it('never overwrites an existing file', () => {
    const cwd = fakeStarter();
    writeFileSync(join(cwd, 'src/lib/shopify.ts'), '// mine');
    const result = init({ cwd, log: () => {} });

    expect(readFileSync(join(cwd, 'src/lib/shopify.ts'), 'utf8')).toBe('// mine');
    expect(result.skipped).toEqual(['src/lib/shopify.ts']);
    expect(result.copied).toContain('src/lib/cart-client.ts');
  });

  it('is idempotent', () => {
    const cwd = fakeStarter();
    init({ cwd, log: () => {} });
    const before = { alpine: readFileSync(join(cwd, 'src/alpine.ts'), 'utf8'), pkg: readFileSync(join(cwd, 'package.json'), 'utf8') };
    const second = init({ cwd, log: () => {} });

    expect(second.copied).toEqual([]);
    expect(second.pkgChanged).toBe(false);
    expect(second.alpineWired).toBe(true);
    expect(readFileSync(join(cwd, 'src/alpine.ts'), 'utf8')).toBe(before.alpine);
    expect(readFileSync(join(cwd, 'package.json'), 'utf8')).toBe(before.pkg);
  });

  it('leaves a customised alpine.ts alone and reports it', () => {
    const cwd = fakeStarter();
    writeFileSync(join(cwd, 'src/alpine.ts'), "export default (Alpine) => { Alpine.plugin(somethingElse); };\n");
    const lines: string[] = [];
    const result = init({ cwd, log: (line: string) => lines.push(line) });

    expect(result.alpineWired).toBe(false);
    expect(readFileSync(join(cwd, 'src/alpine.ts'), 'utf8')).toContain('somethingElse');
    expect(lines.join('\n')).toContain('registerShopify(Alpine)');
  });
});
