// SPDX-License-Identifier: Apache-2.0
// Delta change sets (US-089, ADR-021, FR-107): the file changes of a delta run are split per element (heading with an
// element ID) into change items — new, modified, deprecated — validated (no deletions, no reused IDs); new ADRs are
// Proposed.
import { createTwoFilesPatch } from 'diff';

export type ChangeKind = 'new' | 'modified' | 'deprecated';

export interface DeltaItem {
  path: string;
  /** Null for changes outside element sections (preamble, changelog, summary tables). */
  elementId: string | null;
  kind: ChangeKind;
  /** Section text before the change (null for new elements). */
  before: string | null;
  after: string;
  /** Unified diff of the section. */
  patch: string;
}

const HEADING = /^#{1,6}\s+((?:FR|NFR|CON|UC|BP|UF|ADR|EP|US|FI|TC)-\d{1,4}):/;
const ID = /^([A-Z]+)-(\d+)$/;

/** The text before the first element heading and the section of each element (heading to the next element heading). */
export function elementSections(content: string): { preamble: string; sections: Map<string, string> } {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const sections = new Map<string, string[]>();
  const preamble: string[] = [];
  let current: string[] = preamble;
  for (const line of lines) {
    const id = HEADING.exec(line)?.[1];
    if (id) {
      current = [];
      sections.set(id, current);
    }
    current.push(line);
  }
  const text = (part: string[]) => `${part.join('\n').replace(/\n+$/, '')}\n`;
  return { preamble: text(preamble), sections: new Map([...sections].map(([id, part]) => [id, text(part)])) };
}

/** Next free ID per prefix after the highest existing one (IDs are never reused or renumbered). */
export function nextFreeIds(existing: readonly string[], prefixes: readonly string[]): Record<string, string> {
  const highest = new Map<string, number>();
  for (const id of existing) {
    const m = ID.exec(id);
    if (m) highest.set(m[1]!, Math.max(highest.get(m[1]!) ?? 0, Number(m[2])));
  }
  return Object.fromEntries(prefixes.map((p) => [p, `${p}-${String((highest.get(p) ?? 0) + 1).padStart(3, '0')}`]));
}

const patchOf = (path: string, before: string, after: string) => createTwoFilesPatch(path, path, before, after, '', '', { context: 3 });
const normalise = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

/** AC-4: a new ADR is created as *Proposed*. */
function proposedAdr(section: string): string {
  if (/^\*\*Status\*\*:/m.test(section)) return section.replace(/^\*\*Status\*\*:.*$/m, '**Status**: Proposed');
  const [heading, ...rest] = section.split('\n');
  return [heading, '**Status**: Proposed', ...rest].join('\n');
}

export function splitDelta(input: {
  path: string;
  before: string | null;
  after: string | null;
  /** Element IDs indexed elsewhere in the project (a new element must not reuse one). */
  existingIds: readonly string[];
}): { items: DeltaItem[]; issues: string[] } {
  const { path } = input;
  if (input.after === null) return { items: [], issues: input.before === null ? [] : [`${path}: the file was deleted.`] };
  const before = input.before === null ? { preamble: '\n', sections: new Map<string, string>() } : elementSections(input.before);
  const after = elementSections(input.after);
  const items: DeltaItem[] = [];
  const issues: string[] = [];
  const elsewhere = new Set(input.existingIds);

  for (const id of before.sections.keys()) {
    if (!after.sections.has(id)) issues.push(`${path}: ${id} was deleted — deprecate elements instead of deleting them.`);
  }
  // A new file keeps its front-matter and preamble as a file-level item (US-090: applying recreates the whole file).
  if (input.before === null && normalise(after.preamble) !== '') {
    items.push({ path, elementId: null, kind: 'new', before: null, after: after.preamble, patch: patchOf(path, '', after.preamble) });
  }
  if (input.before !== null && normalise(before.preamble) !== normalise(after.preamble)) {
    items.push({
      path,
      elementId: null,
      kind: 'modified',
      before: before.preamble,
      after: after.preamble,
      patch: patchOf(path, before.preamble, after.preamble),
    });
  }
  for (const [id, section] of after.sections) {
    const old = before.sections.get(id);
    if (old === undefined) {
      if (elsewhere.has(id)) {
        issues.push(`${path}: ${id} is already used elsewhere — new elements need the next free ID.`);
        continue;
      }
      const text = id.startsWith('ADR-') ? proposedAdr(section) : section;
      items.push({ path, elementId: id, kind: 'new', before: null, after: text, patch: patchOf(path, '', text) });
      continue;
    }
    if (normalise(old) === normalise(section)) continue;
    const kind: ChangeKind = section.includes('[DEPRECATED]') && !old.includes('[DEPRECATED]') ? 'deprecated' : 'modified';
    items.push({ path, elementId: id, kind, before: old, after: section, patch: patchOf(path, old, section) });
  }
  return { items, issues };
}
