// SPDX-License-Identifier: Apache-2.0
// License policy for production dependencies (CON-015, NFR-027): permissive → allowed; weak copyleft or
// proprietary/custom → review; GPL/AGPL/SSPL or missing license → forbidden.

export type LicenseClass = 'allowed' | 'review' | 'forbidden';

export interface DependencyLicense {
  name: string;
  version: string;
  license: string;
}

export interface LicenseReport {
  ok: boolean;
  forbidden: DependencyLicense[];
  review: DependencyLicense[];
}

const ALLOWED = new Set(
  [
    'MIT',
    'MIT-0',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    '0BSD',
    'Apache-2.0',
    'CC0-1.0',
    'Unlicense',
    'BlueOak-1.0.0',
    'Python-2.0',
    'Zlib',
  ].map((l) => l.toLowerCase()),
);
const RANK: Record<LicenseClass, number> = { allowed: 0, review: 1, forbidden: 2 };

function classifySingle(id: string): LicenseClass {
  const license = id.trim();
  if (license === '' || /^unknown$/i.test(license)) return 'forbidden';
  if (ALLOWED.has(license.toLowerCase())) return 'allowed';
  if (/^LGPL/i.test(license)) return 'review';
  if (/^(A?GPL|SSPL)/i.test(license)) return 'forbidden';
  return 'review';
}

/** Classifies an SPDX expression: `OR` takes the most permissive option, `AND` the most restrictive. */
export function classifyLicense(expression: string): LicenseClass {
  const expr = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (/\sOR\s/i.test(expr)) {
    return expr
      .split(/\s+OR\s+/i)
      .map(classifyLicense)
      .reduce((best, c) => (RANK[c] < RANK[best] ? c : best));
  }
  if (/\sAND\s/i.test(expr)) {
    return expr
      .split(/\s+AND\s+/i)
      .map(classifyLicense)
      .reduce((worst, c) => (RANK[c] > RANK[worst] ? c : worst));
  }
  return classifySingle(expr);
}

/** Parses the output of `pnpm licenses list --prod --json`. */
export function parsePnpmLicenses(json: string): DependencyLicense[] {
  const grouped = JSON.parse(json) as Record<string, Array<{ name: string; versions: string[]; license?: string }>>;
  return Object.entries(grouped).flatMap(([groupLicense, packages]) =>
    packages.flatMap((p) => p.versions.map((version) => ({ name: p.name, version, license: p.license ?? groupLicense }))),
  );
}

/**
 * Accepted proprietary dependencies without an SPDX license (pnpm reports them as "Unknown"): always listed for review,
 * never silently allowed. Each entry names the decision that accepted it.
 */
export const PROPRIETARY: Readonly<Record<string, string>> = {
  '@anthropic-ai/claude-agent-sdk':
    "Anthropic's terms (ADR-006, technical_decisions.md): installer bundling to be confirmed before US-009; its bundled Claude Code binary is never installed (pnpm-workspace.yaml).",
};

const classifyDependency = (d: DependencyLicense): LicenseClass => (d.name in PROPRIETARY ? 'review' : classifyLicense(d.license));

export function evaluateLicenses(dependencies: DependencyLicense[]): LicenseReport {
  const forbidden = dependencies.filter((d) => classifyDependency(d) === 'forbidden');
  const review = dependencies.filter((d) => classifyDependency(d) === 'review');
  return { ok: forbidden.length === 0, forbidden, review };
}
