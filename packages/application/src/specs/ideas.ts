// SPDX-License-Identifier: Apache-2.0
// Idea inbox file (US-095, FR-111, data_model.md §1.6): `01_intent/ideas.md` with one section per idea —
// `## IDEA-007: Text`, a meta line (created · source · state [→ FI-x | — reason]) and an optional note.

export type IdeaState = 'new' | 'turned_into_feature' | 'merged' | 'dismissed';
export const IDEA_STATES: readonly IdeaState[] = ['new', 'turned_into_feature', 'merged', 'dismissed'];

export interface ParsedIdea {
  id: string;
  text: string;
  note: string | null;
  /** Where it was captured: menu, dashboard, shortcut, chat. */
  source: string;
  /** Capture date (YYYY-MM-DD). */
  createdAt: string;
  state: IdeaState;
  /** The feature it was turned into or merged into. */
  featureId: string | null;
  dismissReason: string | null;
}

export interface NewIdea {
  id: string;
  text: string;
  note: string | null;
  source: string;
  createdAt: string;
}

const HEADING = /^##\s+(IDEA-\d{1,4}):\s*(.*?)\s*$/;
const META = /^- created: (\S+) · source: (\S+) · state: ([a-z_]+)(?: → (FI-\d{1,4}))?(?: — (.*?))?\s*$/;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function metaLine(idea: Pick<ParsedIdea, 'createdAt' | 'source' | 'state' | 'featureId' | 'dismissReason'>): string {
  const target = idea.featureId && (idea.state === 'turned_into_feature' || idea.state === 'merged') ? ` → ${idea.featureId}` : '';
  const reason = idea.state === 'dismissed' && idea.dismissReason ? ` — ${oneLine(idea.dismissReason)}` : '';
  return `- created: ${idea.createdAt} · source: ${idea.source} · state: ${idea.state}${target}${reason}`;
}

/** The ideas of an ideas file (front-matter allowed). */
export function parseIdeas(content: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  let current: { idea: ParsedIdea; note: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const note = current.note.join('\n').trim();
    ideas.push({ ...current.idea, note: note === '' ? null : note });
    current = null;
  };
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      current = {
        idea: {
          id: heading[1]!,
          text: heading[2]!,
          note: null,
          source: 'unknown',
          createdAt: '',
          state: 'new',
          featureId: null,
          dismissReason: null,
        },
        note: [],
      };
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      flush();
      continue;
    }
    if (!current) continue;
    const meta = current.idea.createdAt === '' ? META.exec(line) : null;
    if (meta) {
      const state = (IDEA_STATES as readonly string[]).includes(meta[3]!) ? (meta[3] as IdeaState) : 'new';
      current.idea = {
        ...current.idea,
        createdAt: meta[1]!,
        source: meta[2]!,
        state,
        featureId: meta[4] ?? null,
        dismissReason: meta[5] ?? null,
      };
      continue;
    }
    current.note.push(line);
  }
  flush();
  return ideas;
}

/** Next free `IDEA-` number (IDs are never reused). */
export function nextIdeaId(existing: readonly string[]): string {
  const highest = existing.reduce((max, id) => Math.max(max, Number(/^IDEA-(\d+)$/.exec(id)?.[1] ?? 0)), 0);
  return `IDEA-${String(highest + 1).padStart(3, '0')}`;
}

/** The file with the idea appended (a new file when `content` is null). */
export function appendIdea(content: string | null, idea: NewIdea): string {
  const section = [
    `## ${idea.id}: ${oneLine(idea.text)}`,
    metaLine({ createdAt: idea.createdAt, source: idea.source, state: 'new', featureId: null, dismissReason: null }),
    ...(idea.note?.trim() ? [idea.note.trim()] : []),
  ].join('\n');
  const base = content === null ? '---\nkind: ideas\n---\n# Idea inbox\n' : content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  return `${base}\n${section}\n`;
}

/** The file with the meta line of one idea replaced, or null when the idea is not in the file. */
export function updateIdea(
  content: string,
  ideaId: string,
  change: { state: IdeaState; featureId?: string; dismissReason?: string },
): string | null {
  const idea = parseIdeas(content).find((i) => i.id === ideaId);
  if (!idea) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => HEADING.exec(l)?.[1] === ideaId);
  const meta = metaLine({ ...idea, state: change.state, featureId: change.featureId ?? null, dismissReason: change.dismissReason ?? null });
  if (META.test(lines[start + 1] ?? '')) lines[start + 1] = meta;
  else lines.splice(start + 1, 0, meta);
  return lines.join('\n');
}
