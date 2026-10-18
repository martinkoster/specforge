// SPDX-License-Identifier: Apache-2.0
// Layering check (ADR-003, NFR-021) using the rules in .dependency-cruiser.cjs.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise, type ICruiseOptions, type ICruiseResult } from 'dependency-cruiser';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

export interface LayeringViolation {
  rule: string;
  from: string;
  to: string;
}

function loadConfig(): ICruiseOptions {
  const config = createRequire(import.meta.url)(join(ROOT, '.dependency-cruiser.cjs')) as {
    forbidden: NonNullable<ICruiseOptions['ruleSet']>['forbidden'];
    options: ICruiseOptions;
  };
  const { tsConfig: _tsConfig, ...options } = config.options;
  return { ...options, ruleSet: { forbidden: config.forbidden }, validate: true };
}

/** Cruises the given directories and returns all rule violations. */
export async function checkLayering(paths: string[]): Promise<LayeringViolation[]> {
  const { output } = await cruise(paths, loadConfig());
  const result = output as ICruiseResult;
  return result.summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}
