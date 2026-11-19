// SPDX-License-Identifier: Apache-2.0
// CLI: `pnpm check:licenses` — fails on forbidden licenses in production dependencies, lists items needing review.
import { PROPRIETARY, evaluateLicenses, parsePnpmLicenses } from '../licenses.js';
import { runPnpm } from './pnpm.js';

const json = runPnpm(['-r', 'licenses', 'list', '--prod', '--json']);
const report = evaluateLicenses(parsePnpmLicenses(json));
for (const d of report.review) {
  const note = PROPRIETARY[d.name];
  console.warn(`⚠ review: ${d.name}@${d.version} (${d.license})${note ? ` — ${note}` : ''}`);
}
for (const d of report.forbidden) console.error(`✖ forbidden: ${d.name}@${d.version} (${d.license})`);
if (!report.ok) process.exit(1);
console.log(`✔ licenses OK (${report.review.length} to review)`);
