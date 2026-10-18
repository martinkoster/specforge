// SPDX-License-Identifier: Apache-2.0
// Clarify the intent with AI (US-028, UC-005): questions, ambiguities, alternatives and assumptions as cards; answers
// continue the agent session; finishing proposes a "Clarified decisions" section; cancelling keeps a draft.
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { ReviewChangesDialog, type SpecReview } from '../specs/ReviewChangesDialog.js';

type Clarification = NonNullable<QueryOutput<'clarify.current'>>;
type Item = Clarification['items'][number];

const TYPE_LABEL: Record<Item['type'], string> = {
  question: 'Question',
  ambiguity: 'Ambiguity',
  alternative: 'Alternative',
  assumption: 'Assumption',
};

export interface ClarificationPanelProps {
  session: CoreSession;
  projectId: string;
  path: string;
  /** The intent changed (proposal kept or discarded). */
  onChanged(): void;
  aiDisabledReason?: string | null;
}

function ItemCard({ item, value, onChange }: { item: Item; value: string; onChange(value: string): void }) {
  return (
    <li data-type={item.type} className={`clarify-item clarify-${item.type}`}>
      <strong>{TYPE_LABEL[item.type]}</strong>
      <p>{item.text}</p>
      {item.type === 'assumption' ? (
        <span>
          <button
            type="button"
            aria-pressed={value === 'accepted'}
            aria-label={`Accept assumption: ${item.text}`}
            onClick={() => onChange('accepted')}
          >
            Accept
          </button>
          <button
            type="button"
            aria-pressed={value === 'rejected'}
            aria-label={`Reject assumption: ${item.text}`}
            onClick={() => onChange('rejected')}
          >
            Reject
          </button>
        </span>
      ) : item.type === 'alternative' && item.options.length > 0 ? (
        <fieldset>
          <legend className="visually-hidden">{item.text}</legend>
          {item.options.map((option) => (
            <label key={option}>
              <input type="radio" name={`alt-${item.id}`} checked={value === option} onChange={() => onChange(option)} />
              {option}
            </label>
          ))}
        </fieldset>
      ) : (
        <textarea aria-label={`Answer to: ${item.text}`} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </li>
  );
}

export function ClarificationPanel({ session, projectId, path, onChanged, aiDisabledReason = null }: ClarificationPanelProps) {
  const [record, setRecord] = useState<Clarification | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [review, setReview] = useState<SpecReview | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    const loaded = await session.client().query('clarify.current', { projectId, path });
    setRecord(loaded);
    setAnswers(Object.fromEntries((loaded?.items ?? []).filter((i) => i.answer !== null).map((i) => [i.id, i.answer!])));
  }, [session, projectId, path]);

  useEffect(() => {
    void load().catch(fail);
    const client = session.client();
    const offs = [
      client.subscribe('clarify.updated', (e) => {
        if (e.projectId === projectId) void load().catch(fail);
      }),
      client.subscribe('spec.reviewReady', (e) => {
        const expected = proposal ?? record?.proposalRunId;
        if (e.projectId !== projectId || !expected || e.runId !== expected) return;
        void client.query('specs.review', { runId: e.runId }).then(setReview, fail);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [session, projectId, load, record?.proposalRunId, proposal]);

  const decision = (result: { ok: true } | { ok: false; reason: string }) => (result.ok ? setError(null) : setError(result.reason));

  const start = () =>
    void session
      .client()
      .command('clarify.start', { projectId, path })
      .then((r) => (r.ok ? load() : setError(r.reason)))
      .catch(fail);

  const decide = (command: 'specs.keep' | 'specs.discard') => async () => {
    const result = await session.client().command(command, { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    setReview(null);
    onChanged();
  };

  if (record === undefined) return <p>Loading…</p>;
  const id = record?.id;
  // Answers typed since the last submit are saved before finishing.
  const unsaved = (record?.items ?? []).some((i) => (answers[i.id] ?? null) !== i.answer && (answers[i.id] ?? '') !== '');
  const editable = record && ['awaiting_answers', 'complete', 'cancelled', 'failed'].includes(record.state);
  return (
    <section className="clarification" aria-label="Clarify the intent">
      <h2>Clarify with AI</h2>
      {error && <p role="alert">{error}</p>}
      {(!record || record.state === 'finished' || record.state === 'failed') && (
        <button type="button" disabled={aiDisabledReason !== null} title={aiDisabledReason ?? undefined} onClick={start}>
          Analyse intent
        </button>
      )}
      {record?.state === 'running' && <p role="status">The agent is analysing…</p>}
      {record?.state === 'failed' && <p role="status">The last round failed: {record.reason}</p>}
      {record?.state === 'cancelled' && <p role="status">Cancelled — your answers are kept as a draft.</p>}
      {record?.state === 'complete' && <p role="status">No further questions. Finish to propose the clarified decisions for the intent.</p>}
      {record?.state === 'finished' && <p role="status">The clarified decisions were proposed for the intent.</p>}
      {record && record.items.length > 0 && (
        <ul aria-label="Clarification items">
          {record.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              value={answers[item.id] ?? ''}
              onChange={(value) => setAnswers((a) => ({ ...a, [item.id]: value }))}
            />
          ))}
        </ul>
      )}
      {editable && id && (
        <footer>
          <button
            type="button"
            disabled={aiDisabledReason !== null}
            onClick={() => void session.client().command('clarify.answer', { clarificationId: id, answers }).then(decision).catch(fail)}
          >
            Submit answers
          </button>
          {record.state === 'cancelled' && (
            <button
              type="button"
              onClick={() =>
                void session.client().command('clarify.saveDraft', { clarificationId: id, answers }).then(decision).catch(fail)
              }
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              void (unsaved ? session.client().command('clarify.saveDraft', { clarificationId: id, answers }) : Promise.resolve())
                .then(() => session.client().command('clarify.finish', { clarificationId: id }))
                .then((r) => {
                  if (!r.ok) return setError(r.reason);
                  setProposal(r.runId);
                  return load();
                })
                .catch(fail)
            }
          >
            Finish and propose Clarified decisions
          </button>
        </footer>
      )}
      {record && (record.state === 'running' || record.state === 'awaiting_answers') && (
        <button
          type="button"
          onClick={() => void session.client().command('clarify.cancel', { clarificationId: record.id }).then(decision).catch(fail)}
        >
          Cancel dialogue
        </button>
      )}
      {review && (
        <ReviewChangesDialog
          review={review}
          onKeep={decide('specs.keep')}
          onDiscard={decide('specs.discard')}
          onFix={async () => {
            const result = await session.client().command('specs.fix', { runId: review.runId });
            if (!result.ok) throw new Error(result.reason);
            setReview(null);
          }}
          onClose={() => setReview(null)}
        />
      )}
    </section>
  );
}
