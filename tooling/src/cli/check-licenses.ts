// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm check:licenses` — fails on forbidden licenses in production dependencies, lists items needing review.
import { execFileSync } from 'node:child_process';
import { evaluateLicenses, parsePnpmLicenses } from '../licenses.js';

const args = ['-r', 'licenses', 'list', '--prod', '--json'];
// When started via a pnpm script, npm_execpath points to the running pnpm (JS entry or native binary): no shell needed.
const pnpmEntry = process.env.npm_execpath;
const options = { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
const json = !pnpmEntry
  ? execFileSync('pnpm', args, options)
  : /\.c?js$/.test(pnpmEntry)
    ? execFileSync(process.execPath, [pnpmEntry, ...args], options)
    : execFileSync(pnpmEntry, args, options);
const report = evaluateLicenses(parsePnpmLicenses(json));
for (const d of report.review) console.warn(`⚠ review: ${d.name}@${d.version} (${d.license})`);
for (const d of report.forbidden) console.error(`✖ forbidden: ${d.name}@${d.version} (${d.license})`);
if (!report.ok) process.exit(1);
console.log(`✔ licenses OK (${report.review.length} to review)`);
