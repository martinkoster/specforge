// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm check:layering` — fails if any package violates the layering rules.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLayering } from '../layering.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const violations = await checkLayering([join(root, 'packages')]);
for (const v of violations) console.error(`✖ ${v.rule}: ${v.from} → ${v.to}`);
if (violations.length > 0) process.exit(1);
console.log('✔ layering rules satisfied');
