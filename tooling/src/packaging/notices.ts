// SPDX-License-Identifier: Apache-2.0
// THIRD_PARTY_NOTICES for the installers (US-009 AC-2, CON-015, technical_decisions §7).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROPRIETARY, type DependencyLicense } from '../licenses.js';

export interface NoticeEntry {
  name: string;
  version: string;
  license: string;
  licenseText?: string;
  /** Set for accepted proprietary dependencies (their terms, not an OSI license). */
  proprietary?: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

/** Reads the license file of an installed package directory, if it has one. */
export function readLicenseText(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir).find((f) => LICENSE_FILE.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : undefined;
}

/** One entry per third-party package and version (workspace packages are SpecForge's own code), sorted by name. */
export function noticeEntries(dependencies: DependencyLicense[], readText: (dir: string) => string | undefined): NoticeEntry[] {
  const seen = new Set<string>();
  return dependencies
    .filter((d) => !d.name.startsWith('@specforge/'))
    .filter((d) => !seen.has(`${d.name}@${d.version}`) && seen.add(`${d.name}@${d.version}`))
    .map((d): NoticeEntry => {
      const licenseText = d.path ? readText(d.path) : undefined;
      const proprietary = PROPRIETARY[d.name];
      return {
        name: d.name,
        version: d.version,
        license: proprietary ? 'Proprietary' : d.license,
        ...(licenseText ? { licenseText } : {}),
        ...(proprietary ? { proprietary } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function renderThirdPartyNotices(entries: NoticeEntry[]): string {
  const header = [
    'SpecForge - third-party notices',
    '',
    'SpecForge is licensed under the Apache License, Version 2.0 (see LICENSE and NOTICE).',
    'It includes the following third-party software, each under its own license.',
    'The Electron and Chromium licenses are shipped beside the application (LICENSE.electron.txt, LICENSES.chromium.html).',
  ].join('\n');
  const sections = entries.map((e) =>
    [
      '-'.repeat(78),
      `${e.name} ${e.version}`,
      `License: ${e.license}`,
      ...(e.proprietary
        ? ["This component is not licensed under the Apache License; it is subject to its owner's terms.", e.proprietary]
        : []),
      ...(e.licenseText ? ['', e.licenseText] : []),
    ].join('\n'),
  );
  return [header, ...sections, ''].join('\n\n');
}

/** Shipped third-party packages without a notice entry (the packaging step fails on any). */
export function missingNotices(shipped: string[], entries: NoticeEntry[]): string[] {
  const listed = new Set(entries.map((e) => e.name));
  return [...new Set(shipped)].filter((name) => !name.startsWith('@specforge/') && !listed.has(name));
}
