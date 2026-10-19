// SPDX-License-Identifier: Apache-2.0
// Parses a workspace Markdown artifact (data_model.md §1): front-matter, element-ID headings, ID references.
import { BOARD_STATUSES, type BoardStatus } from '@specforge/domain';
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
  links: Array<{ source: string; target: string }>;
  story?: ParsedStory;
  epic?: ParsedEpic;
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
  } else if (kind === 'epic') {
    const { id, title } = requireId(path, data, 'EP');
    const review = data.epic_review as { outcome?: unknown } | undefined;
    result.epic = { id, title, approval, featureId: str(data.feature), reviewOutcome: str(review?.outcome) };
    result.elements.push({ id, type: 'epic', title, anchor: null });
    primary = id;
    frontMatterRefs.push(...ids(data.requirements));
  }

  const links = new Map<string, { source: string; target: string }>();
  const link = (source: string | undefined, target: string) => {
    if (source && source !== target) links.set(`${source}>${target}`, { source, target });
  };
  for (const target of frontMatterRefs) link(primary, target);

  let current = primary;
  for (const line of body.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      const [, id, title] = heading as unknown as [string, string, string];
      result.elements.push({ id, type: typeOf(id), title, anchor: slug(`${id}: ${title}`) });
      current = id;
      continue;
    }
    for (const match of line.matchAll(ID)) link(current, match[0]);
  }
  result.links = [...links.values()];
  return result;
}
