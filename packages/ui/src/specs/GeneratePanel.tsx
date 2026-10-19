// SPDX-License-Identifier: Apache-2.0
// AI generation of a specification phase (US-027): Draft-inputs check (US-026), start, progress and the review.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommandInput, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { DraftInputsConfirm } from './DraftInputsConfirm.js';
import { ReviewChangesDialog, type SpecReview } from './ReviewChangesDialog.js';

export type GenerationTarget = CommandInput<'specs.generate'>['target'];

export const TARGETS: readonly { id: GenerationTarget; label: string; instruction: string }[] = [
  { id: 'requirements', label: 'Requirements', instruction: 'Generate the requirements from the approved intent.' },
  { id: 'design', label: 'Design', instruction: 'Generate the functional and technical design from the approved requirements.' },
  { id: 'epics', label: 'Epics', instruction: 'Generate epics from the approved design.' },
  { id: 'stories', label: 'User stories', instruction: 'Generate user stories for the approved epics.' },
  { id: 'test_concepts', label: 'Test concepts', instruction: 'Generate test concepts for the approved stories.' },
];

export interface GeneratePanelProps {
  session: CoreSession;
  projectId: string;
  /** Artifacts changed (kept or discarded). */
  onChanged(): void;
  /** Why AI generation is disabled (US-013), or null. */
  aiDisabledReason?: string | null;
}

export function GeneratePanel({ session, projectId, onChanged, aiDisabledReason = null }: GeneratePanelProps) {
  const [target, setTarget] = useState<GenerationTarget>('requirements');
  const [instruction, setInstruction] = useState(TARGETS[0]!.instruction);
  const [check, setCheck] = useState<QueryOutput<'artifacts.generationCheck'> | null>(null);
  /** US-036: approved epics to generate stories for (all by default). */
  const [epics, setEpics] = useState<{ id: string; title: string }[]>([]);
  const [selectedEpics, setSelectedEpics] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [review, setReview] = useState<SpecReview | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReview = useCallback(
    async (id: string) => {
      const r = await session.client().query('specs.review', { runId: id });
      setReview(r);
      if (r && r.state !== 'running') setShowReview(true);
    },
    [session],
  );

  // A running or undecided run of the target is resumed (e.g. after switching areas).
  useEffect(() => {
    let current = true;
    void session
      .client()
      .query('specs.openReview', { projectId, target })
      .then((r) => {
        if (!current) return;
        setRunId(r?.runId ?? null);
        setReview(r);
        setShowReview(false);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [session, projectId, target]);

  useEffect(
    () =>
      session.client().subscribe('spec.reviewReady', (e) => {
        if (e.projectId === projectId && e.runId === runId) void loadReview(e.runId).catch(() => undefined);
      }),
    [session, projectId, runId, loadReview],
  );

  const starting = useRef(false);
  const start = useCallback(async () => {
    setCheck(null);
    if (starting.current) return;
    starting.current = true;
    try {
      await startOnce();
    } finally {
      starting.current = false;
    }
  }, [startOnce]);
  async function startOnce() {
    const epicIds = target === 'stories' && epics.length > 0 ? selectedEpics : undefined;
    const result = await session.client().command('specs.generate', { projectId, target, instruction, ...(epicIds ? { epicIds } : {}) });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setRunId(result.runId);
    await loadReview(result.runId);
  }

  useEffect(() => {
    if (target !== 'stories') return setEpics([]);
    let current = true;
    void session
      .client()
      .query('epics.list', { projectId })
      .then((list) => {
        if (!current) return;
        const approved = list.epics.filter((e) => e.approval === 'approved').map((e) => ({ id: e.id, title: e.title }));
        setEpics(approved);
        setSelectedEpics(approved.map((e) => e.id));
      })
      .catch(() => setEpics([]));
    return () => {
      current = false;
    };
  }, [session, projectId, target]);

  const decide = (action: 'specs.keep' | 'specs.discard') => async () => {
    const result = await session.client().command(action, { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    setShowReview(false);
    setReview(null);
    setRunId(null);
    onChanged();
  };

  const fix = async () => {
    const result = await session.client().command('specs.fix', { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    setShowReview(false);
    setRunId(result.runId);
    await loadReview(result.runId);
  };

  const running = review?.state === 'running';
  const pending = review !== null && !running;

  return (
    <section className="generate-panel" aria-label="Generate with AI">
      <h2>Generate with AI</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Target{' '}
        <select
          aria-label="Target"
          value={target}
          onChange={(e) => {
            const next = TARGETS.find((t) => t.id === e.target.value)!;
            setTarget(next.id);
            setInstruction(next.instruction);
            setError(null);
          }}
        >
          {TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Instruction
        <textarea aria-label="Instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} />
      </label>
      {epics.length > 0 && (
        <fieldset aria-label="Epics">
          <legend>Approved epics</legend>
          {epics.map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={selectedEpics.includes(e.id)}
                onChange={(ev) => setSelectedEpics((sel) => (ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id)))}
              />
              {e.id} {e.title}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        disabled={aiDisabledReason !== null || running || pending || instruction.trim() === ''}
        title={aiDisabledReason ?? undefined}
        onClick={() => {
          setError(null);
          session
            .client()
            .query('artifacts.generationCheck', { projectId, target })
            .then(setCheck, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
        }}
      >
        Generate
      </button>
      {running && <p role="status">Generating… the agent is writing into the target folder.</p>}
      {pending && !showReview && (
        <p role="status">
          Changes are waiting for your review.{' '}
          <button type="button" onClick={() => setShowReview(true)}>
            Review changes
          </button>
        </p>
      )}
      {check && (
        <DraftInputsConfirm
          check={check}
          onConfirm={() => void start().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          onCancel={() => setCheck(null)}
        />
      )}
      {review && showReview && (
        <ReviewChangesDialog
          review={review}
          onKeep={decide('specs.keep')}
          onDiscard={decide('specs.discard')}
          onFix={fix}
          onClose={() => setShowReview(false)}
        />
      )}
    </section>
  );
}
