// SPDX-License-Identifier: Apache-2.0
// US-069 AC-1/AC-2 (NFR-033, ADR-023, ui_design_concept.md §2, §6): token file, cascade layers and base styles.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const STYLES = join(SRC, 'styles');
const read = (file: string) => readFileSync(join(STYLES, file), 'utf8');

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );
}

/** Body of the first `selector { … }` block (no nested braces inside). */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

const declared = (body: string) => new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const COLOUR_TOKENS = [
  '--bg',
  '--bg-subtle',
  '--surface',
  '--surface-hover',
  '--surface-selected',
  '--border',
  '--border-strong',
  '--text',
  '--text-muted',
  '--text-subtle',
  '--accent',
  '--accent-hover',
  '--accent-text',
  '--accent-subtle',
  '--on-accent',
  '--focus',
  '--success',
  '--success-subtle',
  '--warning',
  '--warning-subtle',
  '--danger',
  '--danger-subtle',
  '--info',
  '--info-subtle',
];
const OTHER_TOKENS = [
  '--font-sans',
  '--font-mono',
  '--font-size-root',
  ...['xs', 'sm', 'md', 'lg', 'xl', '2xl'].flatMap((s) => [`--text-${s}`, `--leading-${s}`]),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `--space-${n}`),
  '--control-sm',
  '--control-md',
  '--control-lg',
  ...['sm', 'md', 'lg', 'xl', 'full'].map((s) => `--radius-${s}`),
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--duration-fast',
  '--duration-normal',
  '--ease-standard',
  ...['sticky', 'drawer', 'popover', 'dialog', 'toast'].map((s) => `--z-${s}`),
];

describe('US-069 AC-1: token file and cascade layers', () => {
  it('defines every token of the concept for light and every colour token again for dark', () => {
    const tokens = read('tokens.css');
    const light = declared(block(tokens, ':root'));
    for (const token of [...COLOUR_TOKENS, ...OTHER_TOKENS]) expect(light, token).toContain(token);
    expect(block(tokens, ':root')).toMatch(/color-scheme:\s*light/);

    const darkMedia = block(tokens, '@media (prefers-color-scheme: dark)');
    const dark = declared(darkMedia);
    for (const token of COLOUR_TOKENS) expect(dark, token).toContain(token);
    expect(darkMedia).toMatch(/color-scheme:\s*dark/);
  });

  it('index.css declares the layer order and imports every stylesheet; each file wraps its rules in its layer', () => {
    const index = read('index.css');
    expect(index).toMatch(/@layer reset, tokens, base, components, areas, utilities;/);
    const imported = [...index.matchAll(/@import '\.\/([^']+)';/g)].map((m) => m[1]);
    const files = cssFiles(STYLES)
      .map((f) => relative(STYLES, f).replace(/\\/g, '/'))
      .filter((f) => f !== 'index.css');
    expect([...imported].sort()).toEqual([...files].sort());
    expect(files).toEqual(expect.arrayContaining(['reset.css', 'tokens.css', 'base.css', 'utilities.css']));
    expect(files.some((f) => f.startsWith('areas/'))).toBe(true);

    for (const file of files) {
      const layer = file.includes('/') ? file.split('/')[0] : file.replace('.css', '');
      const body = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
      expect(body.startsWith(`@layer ${layer} {`), file).toBe(true);
      expect(body.endsWith('}'), file).toBe(true);
    }
  });

  it('the renderer loads only styles/index.css; the old stylesheet is gone', () => {
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
    expect(main).toMatch(/import '\.\/styles\/index\.css';/);
    expect(main).not.toMatch(/styles\.css/);
    expect(existsSync(join(SRC, 'styles.css'))).toBe(false);
  });
});

describe('US-069 AC-2: base styles', () => {
  const base = read('base.css');

  it('applies font stacks, the rem-based root size and token colours', () => {
    expect(block(base, 'html')).toMatch(/font-size:\s*var\(--font-size-root\)/);
    expect(block(read('tokens.css'), ':root')).toMatch(/--font-size-root:\s*87\.5%/);
    const body = block(base, 'body');
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(body).toMatch(/background:\s*var\(--bg\)/);
    expect(body).toMatch(/color:\s*var\(--text\)/);
    expect(base).toMatch(/(code|pre|kbd|samp)[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/);
  });

  it('shows a 2 px focus ring, honours reduced motion and forced colours', () => {
    expect(block(base, ':focus-visible')).toMatch(/outline:\s*2px solid var\(--focus\)/);
    expect(block(base, '@media (prefers-reduced-motion: reduce)')).toMatch(/transition-duration:\s*0s !important/);
    expect(block(base, '@media (forced-colors: active)')).toMatch(/outline/);
  });
});

describe('US-070 AC-1/AC-2: control styles', () => {
  it('buttons: variants, sizes and all interaction states', () => {
    const css = read('components/button.css');
    for (const selector of ['.btn', '.btn-primary', '.btn-secondary', '.btn-ghost', '.btn-danger', '.btn-sm', '.btn-lg', '.btn-icon']) {
      expect(css, selector).toContain(`${selector} {`);
    }
    for (const state of [':hover', ':active', ':focus-visible', ':disabled', "[aria-busy='true']"]) expect(css, state).toContain(state);
  });

  it('fields: inputs, selects, textareas, checkboxes, radios, switch, label, hint and error', () => {
    const css = read('components/field.css');
    for (const selector of ['.input', '.select', '.textarea', '.checkbox', '.radio', '.switch', '.field', '.field-hint', '.field-error']) {
      expect(css, selector).toContain(selector);
    }
    expect(css).toContain("[aria-invalid='true']");
    expect(css).toMatch(/accent-color:\s*var\(--accent\)/);
  });
});
