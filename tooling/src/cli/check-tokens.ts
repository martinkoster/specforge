// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm check:tokens` (US-069 AC-3) — fails on colour, shadow or font-size literals outside tokens.css.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTokenViolationsIn } from '../tokens.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const violations = findTokenViolationsIn([join(root, 'packages')]);
for (const v of violations) console.error(`✖ ${v.file}:${v.line} ${v.reason}`);
if (violations.length > 0) process.exit(1);
console.log('✔ stylesheets use design tokens only');
