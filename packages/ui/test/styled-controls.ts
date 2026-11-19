// SPDX-License-Identifier: Apache-2.0
// Test helper (US-070 AC-5, NFR-033): every button, input, select and textarea — or the label wrapping it — carries a
// class that is styled in packages/ui/src/styles, so no control falls back to the unstyled browser look.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup } from '@testing-library/react';
import { expect } from 'vitest';

const STYLES = join(__dirname, '..', 'src', 'styles');

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );
}

let styled: Set<string> | undefined;

/** Class names that appear in a selector of the renderer stylesheets. */
export function styledClasses(): Set<string> {
  styled ??= new Set(
    cssFiles(STYLES).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .matchAll(/\.(-?[_a-zA-Z][\w-]*)/g),
      ].map((m) => m[1]!),
    ),
  );
  return styled;
}

const hasStyledClass = (el: Element | null) => !!el && [...el.classList].some((c) => styledClasses().has(c));

/** Controls in `container` without a styled class on themselves or their wrapping label. */
export function unstyledControls(container: ParentNode): string[] {
  return (
    [...container.querySelectorAll('button, input, select, textarea')]
      .filter((el) => (el as HTMLInputElement).type !== 'hidden')
      // React Flow's own controls are styled by its stylesheet (themed through tokens in the areas layer).
      .filter((el) => !el.closest('.react-flow'))
      .filter((el) => !hasStyledClass(el) && !hasStyledClass(el.closest('label')))
      .map((el) => el.outerHTML.slice(0, 120))
  );
}

export function expectStyledControls(container: ParentNode): void {
  expect(unstyledControls(container)).toEqual([]);
}

/** RTL cleanup that first checks every control still rendered by the test (US-070 AC-5). */
export function cleanupChecked(): void {
  try {
    expectStyledControls(document.body);
  } finally {
    cleanup();
  }
}
