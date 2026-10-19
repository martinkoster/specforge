// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm check:spdx` — fails if a source file lacks the Apache-2.0 SPDX header.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMissingSpdx } from '../spdx.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const missing = findMissingSpdx(['packages', 'tooling', 'spikes'].map((d) => join(root, d)));
for (const file of missing) console.error(`✖ missing SPDX header: ${file}`);
if (missing.length > 0) process.exit(1);
console.log('✔ all source files carry the SPDX header');
