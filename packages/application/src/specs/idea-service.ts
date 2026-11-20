// SPDX-License-Identifier: Apache-2.0
// Idea inbox (US-095, FR-111, UC-047): capture one-line ideas into `01_intent/ideas.md` and triage them later — turn
// into a feature (wizard pre-filled, US-082), merge into a feature, or dismiss with a reason.
import type { ArtifactFiles } from '../stories/dependency-service.js';
import { appendIdea, nextIdeaId, updateIdea, type IdeaState, type ParsedIdea } from './ideas.js';

export interface IdeaServiceDeps {
  files(projectId: string): Pick<ArtifactFiles, 'read' | 'writeAtomic'>;
  reindex(projectId: string, path: string): Promise<unknown>;
  /** `<specRoot>/01_intent/ideas.md`. */
  ideasPath(projectId: string): string;
  /** The indexed ideas (table `idea`). */
  ideas(projectId: string): ParsedIdea[];
  featureIds(projectId: string): string[];
  now(): string;
}

export class IdeaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdeaError';
  }
}

export class IdeaService {
  /** One write at a time per project: two quick captures must not both take the same ID. */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: IdeaServiceDeps) {}

  list(projectId: string): { ideas: ParsedIdea[]; untriaged: number } {
    const ideas = this.deps.ideas(projectId);
    return { ideas, untriaged: ideas.filter((i) => i.state === 'new').length };
  }

  get(projectId: string, ideaId: string): ParsedIdea | undefined {
    return this.deps.ideas(projectId).find((i) => i.id === ideaId);
  }

  /** AC-1/AC-2: appends the idea with date and source and indexes it. */
  capture(projectId: string, input: { text: string; note?: string | null; source: string }): Promise<ParsedIdea> {
    const text = input.text.replace(/\s+/g, ' ').trim();
    if (text === '') return Promise.reject(new IdeaError('An idea needs a text.'));
    return this.serial(projectId, async () => {
      const path = this.deps.ideasPath(projectId);
      const files = this.deps.files(projectId);
      const current = await files.read(path);
      const id = nextIdeaId(this.deps.ideas(projectId).map((i) => i.id));
      const idea = { id, text, note: input.note?.trim() || null, source: input.source, createdAt: this.deps.now().slice(0, 10) };
      await files.writeAtomic(path, appendIdea(current?.content ?? null, idea), { expectedHash: current?.hash ?? null });
      await this.deps.reindex(projectId, path);
      return { ...idea, state: 'new' as const, featureId: null, dismissReason: null };
    });
  }

  /** AC-3: *Merge into…* an existing feature intent. */
  merge(projectId: string, ideaId: string, featureId: string): Promise<ParsedIdea> {
    if (!this.deps.featureIds(projectId).includes(featureId)) return Promise.reject(new IdeaError(`Unknown feature ${featureId}.`));
    return this.change(projectId, ideaId, { state: 'merged', featureId });
  }

  /** AC-3: *Dismiss* with a reason. */
  dismiss(projectId: string, ideaId: string, reason: string): Promise<ParsedIdea> {
    if (reason.trim() === '') return Promise.reject(new IdeaError('Dismissing an idea needs a reason.'));
    return this.change(projectId, ideaId, { state: 'dismissed', dismissReason: reason.trim() });
  }

  /** AC-3: the feature wizard saved a feature intent from the idea ("→ FI-xxx"). */
  turnedIntoFeature(projectId: string, ideaId: string, featureId: string): Promise<ParsedIdea> {
    return this.change(projectId, ideaId, { state: 'turned_into_feature', featureId });
  }

  private change(
    projectId: string,
    ideaId: string,
    change: { state: IdeaState; featureId?: string; dismissReason?: string },
  ): Promise<ParsedIdea> {
    return this.serial(projectId, async () => {
      const idea = this.get(projectId, ideaId);
      if (!idea) throw new IdeaError(`Unknown idea ${ideaId}.`);
      if (idea.state !== 'new') throw new IdeaError(`${ideaId} is already triaged (${idea.state.replace(/_/g, ' ')}).`);
      const path = this.deps.ideasPath(projectId);
      const files = this.deps.files(projectId);
      const current = await files.read(path);
      const next = current ? updateIdea(current.content, ideaId, change) : null;
      if (!current || next === null) throw new IdeaError(`${ideaId} is no longer in ${path}.`);
      await files.writeAtomic(path, next, { expectedHash: current.hash });
      await this.deps.reindex(projectId, path);
      return { ...idea, state: change.state, featureId: change.featureId ?? null, dismissReason: change.dismissReason ?? null };
    });
  }

  private serial<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(projectId) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.tails.set(
      projectId,
      next.catch(() => undefined),
    );
    return next;
  }
}
