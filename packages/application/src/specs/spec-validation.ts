// SPDX-License-Identifier: Apache-2.0
// Validation of files produced by a specification run (US-027, ADR-014): front-matter schema, unique IDs, link targets,
// acyclic blocking dependencies.
import { DependencyGraph } from '@specforge/domain';
import { ArtifactParseError, parseArtifact, type ParsedArtifact } from '../indexing/parse-artifact.js';

export type SpecIssueKind =
  'front_matter' | 'duplicate_id' | 'broken_link' | 'unknown_dependency' | 'dependency_cycle' | 'missing_rationale' | 'incomplete';

const RELATION = { blocking: 'depends on', related: 'is related to' } as const;

export interface SpecValidationIssue {
  path: string;
  kind: SpecIssueKind;
  message: string;
}

/** The indexed workspace before the run. */
export interface SpecIndexView {
  elements: ReadonlyArray<{ id: string; path: string }>;
  dependencies: ReadonlyArray<{ from: string; to: string; type: 'blocking' | 'related'; path: string }>;
}

/** Changed files of the run; `content: null` for deleted files. */
export interface ProducedFile {
  path: string;
  content: string | null;
}

/** Intent decisions (D12) are referenced in text but are not indexed elements. */
const DECISION = /^D\d+$/;

export function validateSpecFiles(files: readonly ProducedFile[], index: SpecIndexView): SpecValidationIssue[] {
  const issues: SpecValidationIssue[] = [];
  const replaced = new Set(files.map((f) => f.path));
  const defined = new Map<string, string>();
  for (const e of index.elements) if (!replaced.has(e.path)) defined.set(e.id, e.path);
  const dependencies = index.dependencies.filter((d) => !replaced.has(d.path));

  const parsed: Array<{ path: string; content: string; artifact: ParsedArtifact }> = [];
  for (const file of files) {
    if (file.content === null || !file.path.endsWith('.md')) continue;
    try {
      parsed.push({ path: file.path, content: file.content, artifact: parseArtifact(file.path, file.content) });
    } catch (e) {
      if (!(e instanceof ArtifactParseError)) throw e;
      issues.push({ path: file.path, kind: 'front_matter', message: e.message.slice(file.path.length + 2) });
    }
  }

  for (const { path, artifact } of parsed) {
    for (const element of artifact.elements) {
      const existing = defined.get(element.id);
      if (existing !== undefined && existing !== path) {
        issues.push({ path, kind: 'duplicate_id', message: `${element.id} is already defined in ${existing}.` });
      } else {
        defined.set(element.id, path);
      }
    }
    for (const d of artifact.dependencies) {
      dependencies.push({ from: d.from, to: d.to, type: d.type, path });
      // US-036 AC-2: proposed blocking and related dependencies explain why.
      if (!d.rationale)
        issues.push({ path, kind: 'missing_rationale', message: `${d.from} ${RELATION[d.type]} ${d.to} without a rationale.` });
    }
  }

  for (const { path, content, artifact } of parsed) {
    issues.push(...completeness(path, content, artifact));
    for (const link of artifact.links) {
      if (DECISION.test(link.target) || defined.has(link.target)) continue;
      issues.push({ path, kind: 'broken_link', message: `${link.source} references ${link.target}, which does not exist.` });
    }
    for (const d of artifact.dependencies) {
      if (defined.has(d.to)) continue;
      issues.push({ path, kind: 'unknown_dependency', message: `${d.from} ${RELATION[d.type]} ${d.to}, which does not exist.` });
    }
  }

  const storyIds = new Set([...defined.keys()].filter((id) => id.startsWith('US-')));
  const graph = new DependencyGraph(
    storyIds,
    dependencies.filter((d) => storyIds.has(d.from) && storyIds.has(d.to)),
  );
  const cycle = graph.findCycle();
  if (cycle) {
    const producedStories = new Map(parsed.flatMap(({ path, artifact }) => (artifact.story ? [[artifact.story.id, path] as const] : [])));
    const start = cycle.findIndex((id) => producedStories.has(id));
    const ordered = start <= 0 ? cycle : [...cycle.slice(start, -1), ...cycle.slice(0, start), cycle[start]!];
    const path = producedStories.get(ordered[0]!) ?? defined.get(ordered[0]!) ?? '';
    issues.push({ path, kind: 'dependency_cycle', message: `Dependency cycle: ${ordered.join(' → ')}.` });
  }
  return issues;
}

/** Sections every produced epic (US-035 AC-1) and story (US-036 AC-1) has. */
const REQUIRED_SECTIONS = { epic: ['Goal', 'Value', 'Acceptance criteria'], story: ['Acceptance criteria'] } as const;
const REQUIREMENT = /^(FR|NFR|CON)-\d+$/;

function completeness(path: string, content: string, artifact: ParsedArtifact): SpecValidationIssue[] {
  const subject = artifact.epic ?? artifact.story;
  if (!subject) return [];
  const issues: SpecValidationIssue[] = [];
  const incomplete = (message: string) => issues.push({ path, kind: 'incomplete', message: `${subject.id} ${message}` });
  if (!artifact.links.some((l) => l.source === subject.id && REQUIREMENT.test(l.target))) incomplete('has no linked requirements.');
  for (const section of REQUIRED_SECTIONS[artifact.epic ? 'epic' : 'story']) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'im').test(content)) incomplete(`has no "## ${section}" section.`);
  }
  return issues;
}
