// SPDX-License-Identifier: Apache-2.0
// US-069 AC-3 (NFR-033): colour, shadow and font-size literals are only allowed in the token file.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findTokenViolations, findTokenViolationsIn } from '../src/tokens.js';

const ROOT = join(__dirname, '..', '..');

describe('US-069 AC-3: token check', () => {
  it('accepts a stylesheet that uses only tokens, keywords and system colours', () => {
    const css = `
      /* a #comment with red and #fff */
      #root .card:hover { color: var(--text); background: transparent; border: 1px solid currentColor; }
      .x { box-shadow: var(--shadow-sm), var(--shadow-md); font-size: var(--text-sm); }
      .y { box-shadow: none; font-size: inherit; outline-color: var(--focus); }
      @media (forced-colors: active) { .z { border-color: CanvasText; } }
      .grid { grid-template-areas: 'red blue'; }
    `;
    expect(findTokenViolations(css, 'ok.css')).toEqual([]);
  });

  it('reports colour, shadow and font-size literals with file and line', () => {
    const css = [
      '.a { color: #c80; }',
      '.b { background: rgb(0 0 0 / 0.4); }',
      '.c { border-color: hsl(10 50% 50%); }',
      '.d { color: white; }',
      '.e { box-shadow: 0 1px 2px var(--shadow-colour); }',
      '.f { font-size: 12px; }',
      '.g { border: 1px solid #8884; }',
    ].join('\n');

    expect(findTokenViolations(css, 'bad.css').map((v) => `${v.line}: ${v.reason}`)).toEqual([
      '1: colour literal "#c80"',
      '2: colour literal "rgb("',
      '3: colour literal "hsl("',
      '4: colour literal "white"',
      '5: box-shadow must be "none" or tokens',
      '6: font-size must be a token',
      '7: colour literal "#8884"',
    ]);
  });

  it('skips tokens.css and reports violations of other stylesheets below the roots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-tokens-'));
    mkdirSync(join(dir, 'styles', 'areas'), { recursive: true });
    writeFileSync(join(dir, 'styles', 'tokens.css'), ':root { --text: #18181b; }');
    writeFileSync(join(dir, 'styles', 'areas', 'shell.css'), '.top { color: var(--text); }\n.bad { color: #fff; }');

    expect(findTokenViolationsIn([dir]).map((v) => `${v.file.slice(dir.length + 1).replace(/\\/g, '/')}:${v.line}`)).toEqual([
      'styles/areas/shell.css:2',
    ]);
  });

  it('the repository stylesheets pass', () => {
    expect(findTokenViolationsIn([join(ROOT, 'packages')])).toEqual([]);
  });
});
