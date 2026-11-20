// SPDX-License-Identifier: Apache-2.0
// Parses a workspace Markdown artifact (data_model.md §1): front-matter, element-ID headings, ID references.
import { BOARD_STATUSES, FEATURE_STATUSES, type BoardStatus, type FeatureStatus } from '@specforge/domain';
import { parse as parseYaml } from 'yaml';

export type Approval = 'draft' | 'approved';

export interface ParsedElement {
  id: string;
  type: string;
  title: string;
  anchor: string | null;
}

export interface ParsedStory {
  id: string;
  title: string;
  status: BoardStatus;
  approval: Approval;
  size: string | null;
  epicId: string | null;
  featureId: string | null;
  branch: string | null;
  reworks: string[];
}

export interface ParsedEpic {
  id: string;
  title: string;
  approval: Approval;
  featureId: string | null;
  reviewOutcome: string | null;
}

/** Feature intent (data_model.md §1.5, US-081). */
export interface ParsedFeature {
  id: string;
  title: string;
  approval: Approval;
  status: FeatureStatus;
  sourceIdea: string | null;
  baseline: string | null;
}

/** Typed trace links of the feature workflow (US-081 AC-3); untyped links are plain references. */
export type FeatureLinkType = 'introduces' | 'changes' | 'reworks';

export interface ParsedLink {
  source: string;
  target: string;
  type?: FeatureLinkType;
}

export interface ParsedDependency {
  from: string;
  to: string;
  type: 'blocking' | 'related';
  rationale: string | null;
}

export interface ParsedArtifact {
  kind: string;
  approval: Approval;
  elements: ParsedElement[];
  links: ParsedLink[];
  story?: ParsedStory;
  epic?: ParsedEpic;
  feature?: ParsedFeature;
  /** Content hash per element: its section (heading elements) or the body (story, epic, feature intent) — US-086. */
  elementHashes?: Record<string, string>;
  dependencies: ParsedDependency[];
}

export class ArtifactParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ArtifactParseError';
  }
}

const ID = /\b(?:FR|NFR|CON|UC|BP|UF|ADR|EP|US|FI|TC|IDEA)-\d{1,4}\b|\bD\d{1,3}\b/g;
const HEADING = /^#{1,6}\s+((?:FR|NFR|CON|UC|BP|UF|ADR|EP|US|FI|TC|IDEA)-\d{1,4}):\s*(.+?)\s*$/;
const TYPES: Record<string, string> = {
  FR: 'fr',
  NFR: 'nfr',
  CON: 'con',
  UC: 'uc',
  BP: 'bp',
  UF: 'uf',
  ADR: 'adr',
  EP: 'epic',
  US: 'story',
  FI: 'feature_intent',
  TC: 'tc',
  IDEA: 'idea',
};

const FEATURE_LINE = /^\s*\*\*Feature\*\*:\s*(FI-\d{1,4})\b/;
const CHANGED_BY = /\bChanged by (FI-\d{1,4})\b/;

const typeOf = (id: string) => TYPES[id.split('-')[0]!] ?? 'other';
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

function splitFrontMatter(path: string, content: string): { data: Record<string, unknown>; body: string } {
  const text = content.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) throw new ArtifactParseError(path, 'Front-matter is not closed with ---');
  let data: unknown;
  try {
    data = parseYaml(text.slice(4, end));
  } catch (e) {
    throw new ArtifactParseError(path, `Invalid front-matter: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (data !== null && (typeof data !== 'object' || Array.isArray(data)))
    throw new ArtifactParseError(path, 'Front-matter must be a mapping');
  return { data: (data ?? {}) as Record<string, unknown>, body: text.slice(text.indexOf('\n', end + 1) + 1) };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const ids = (v: unknown): string[] => list(v).map(String);

function approvalOf(path: string, value: unknown): Approval {
  if (value === undefined || value === null) return 'draft';
  if (value === 'draft' || value === 'approved') return value;
  throw new ArtifactParseError(path, `Invalid approval "${String(value)}"`);
}

function requireId(path: string, data: Record<string, unknown>, prefix: string): { id: string; title: string } {
  const id = str(data.id);
  if (!id || !new RegExp(`^${prefix}-\\d{1,4}$`).test(id)) throw new ArtifactParseError(path, `Missing or invalid ${prefix} id`);
  const title = str(data.title);
  if (!title) throw new ArtifactParseError(path, 'Missing title');
  return { id, title };
}

export function parseArtifact(path: string, content: string): ParsedArtifact {
  const { data, body } = splitFrontMatter(path, content);
  const kind = str(data.kind) ?? 'other';
  const approval = approvalOf(path, data.approval);
  const result: ParsedArtifact = { kind, approval, elements: [], links: [], dependencies: [] };
  let primary: string | undefined;
  const frontMatterRefs: string[] = [];
  const typedRefs: ParsedLink[] = [];

  if (kind === 'story') {
    const { id, title } = requireId(path, data, 'US');
    const status = (str(data.status) ?? 'backlog') as BoardStatus;
    if (!BOARD_STATUSES.includes(status)) throw new ArtifactParseError(path, `Invalid story status "${status}"`);
    result.story = {
      id,
      title,
      status,
      approval,
      size: str(data.size),
      epicId: str(data.epic),
      featureId: str(data.feature),
      branch: str(data.branch),
      reworks: ids(data.reworks),
    };
    // `US-002` or `{ id: US-002, rationale: … }` for both blocking and related dependencies (US-036 AC-2).
    const dependencies = (field: 'depends_on' | 'related_to', type: 'blocking' | 'related') => {
      for (const dep of list(data[field])) {
        const object = typeof dep === 'object' && dep !== null;
        const depId = object ? str((dep as { id?: unknown }).id) : str(typeof dep === 'number' ? String(dep) : dep);
        if (!depId) throw new ArtifactParseError(path, `Invalid ${field} entry`);
        const rationale = object ? str((dep as { rationale?: unknown }).rationale) : null;
        result.dependencies.push({ from: id, to: depId, type, rationale });
      }
    };
    dependencies('depends_on', 'blocking');
    dependencies('related_to', 'related');
    result.elements.push({ id, type: 'story', title, anchor: null });
    primary = id;
    frontMatterRefs.push(...ids(data.requirements), ...ids(data.design), ...(result.story.epicId ? [result.story.epicId] : []));
    if (result.story.featureId) typedRefs.push({ source: id, target: result.story.featureId, type: 'introduces' });
    for (const reworked of result.story.reworks) typedRefs.push({ source: id, target: reworked, type: 'reworks' });
  } else if (kind === 'epic') {
    const { id, title } = requireId(path, data, 'EP');
    const review = data.epic_review as { outcome?: unknown } | undefined;
    result.epic = { id, title, approval, featureId: str(data.feature), reviewOutcome: str(review?.outcome) };
    result.elements.push({ id, type: 'epic', title, anchor: null });
    primary = id;
    frontMatterRefs.push(...ids(data.requirements));
    if (result.epic.featureId) typedRefs.push({ source: id, target: result.epic.featureId, type: 'introduces' });
  } else if (kind === 'feature_intent') {
    const { id, title } = requireId(path, data, 'FI');
    const status = (str(data.status) ?? 'draft') as FeatureStatus;
    if (!FEATURE_STATUSES.includes(status)) throw new ArtifactParseError(path, `Invalid feature status "${status}"`);
    result.feature = { id, title, approval, status, sourceIdea: str(data.source_idea), baseline: str(data.baseline) };
    result.elements.push({ id, type: 'feature_intent', title, anchor: null });
    primary = id;
    frontMatterRefs.push(
      ...ids(data.related_epics),
      ...ids(data.related_requirements),
      ...(result.feature.sourceIdea ? [result.feature.sourceIdea] : []),
    );
  }

  const links = new Map<string, ParsedLink>();
  const link = (source: string | undefined, target: string, type?: FeatureLinkType) => {
    if (!source || source === target) return;
    const key = `${source}>${target}`;
    // A typed link wins over a plain reference between the same IDs.
    if (type) links.set(key, { source, target, type });
    else if (!links.has(key)) links.set(key, { source, target });
  };
  for (const target of frontMatterRefs) link(primary, target);
  for (const l of typedRefs) link(l.source, l.target, l.type);

  let current = primary;
  // US-086: the text of every element; primary elements (story, epic, feature intent) own the whole body.
  const texts = new Map<string, string[]>(primary ? [[primary, []]] : []);
  for (const line of body.split('\n')) {
    if (primary) texts.get(primary)!.push(line);
    const heading = HEADING.exec(line);
    if (heading) {
      const [, id, title] = heading as unknown as [string, string, string];
      result.elements.push({ id, type: typeOf(id), title, anchor: slug(`${id}: ${title}`) });
      current = id;
      if (!texts.has(id)) texts.set(id, []);
      if (id !== primary) texts.get(id)!.push(line);
      continue;
    }
    if (current && current !== primary) texts.get(current)?.push(line);
    const introduced = FEATURE_LINE.exec(line)?.[1];
    const changedBy = CHANGED_BY.exec(line)?.[1];
    if (introduced) link(current, introduced, 'introduces');
    if (changedBy) link(current, changedBy, 'changes');
    for (const match of line.matchAll(ID)) link(current, match[0]);
  }
  result.links = [...links.values()];
  result.elementHashes = Object.fromEntries([...texts].map(([id, lines]) => [id, contentHash(lines)]));
  return result;
}

/** FNV-1a over the trimmed, non-empty lines: whitespace-only edits are no content change. */
function contentHash(lines: readonly string[]): string {
  let hash = 0x811c9dc5;
  const text = lines
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
