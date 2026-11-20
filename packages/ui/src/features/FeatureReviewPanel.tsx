// SPDX-License-Identifier: Apache-2.0
// AI review and clarification steps of the feature wizard (US-083, UF-17): live progress, the enhanced draft with
// Keep / Remove / Edit of AI-added parts, findings, "already covered" and the clarification question cards.
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { Callout } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

type Wizard = NonNullable<QueryOutput<'features.wizard.get'>>;
export type FeatureReviewView = NonNullable<Wizard['draft']['review']>;
type Part = FeatureReviewView['parts'][number];

const SECTIONS: readonly [Part['section'], string][] = [
  ['problem', 'Problem'],
  ['goal', 'Goal'],
  ['in_scope', 'In scope'],
  ['out_of_scope', 'Out of scope'],
  ['success', 'Success criteria'],
  ['constraints', 'Constraints'],
  ['assumptions', 'Assumptions'],
];

export interface FeatureReviewPanelProps {
  session: CoreSession;
  wizardId: string;
  step: 'review' | 'clarify';
  review: FeatureReviewView;
  aiDisabledReason: string | null;
  /** The wizard row changed (the panel calls the core directly). */
  onChanged(wizard: Wizard): void;
  onRetry(): void;
  onContinue(): void;
  onClarify(): void;
  onSave(): void;
  onWithdraw(): void;
  onMerged(path: string): void;
  onView?(ref: string): void;
  onUseEpic(epicId: string): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PartItem({ part, onEdit }: { part: Part; onEdit(change: { removed?: boolean; text?: string }): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(part.text);
  const fixed = part.id === 'problem-0';
  return (
    <li aria-label={part.text} className={part.removed ? 'draft-part draft-part-removed' : 'draft-part'}>
      {editing ? (
        <>
          <textarea className="textarea" aria-label="Edit part" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary btn-sm" type="button" onClick={() => void onEdit({ text }).then(() => setEditing(false))}>
            Save part
          </button>
        </>
      ) : (
        <span>{part.text}</span>
      )}{' '}
      {part.origin === 'ai' && <span className="badge badge-info">AI</span>}
      {!fixed && !editing && (
        <span className="draft-part-actions">
          {part.removed ? (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void onEdit({ removed: false })}>
              Keep
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void onEdit({ removed: true })}>
              Remove
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setText(part.text);
              setEditing(true);
            }}
          >
            Edit
          </button>
        </span>
      )}
    </li>
  );
}

export function FeatureReviewPanel(props: FeatureReviewPanelProps) {
  const { session, wizardId, step, review, aiDisabledReason } = props;
  const [output, setOutput] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOutput([]);
    return session.client().subscribe('run.output', (e) => {
      if (e.runId === review.runId) setOutput((lines) => [...lines.slice(-49), e.text]);
    });
  }, [session, review.runId]);

  const call = (fn: () => Promise<void>) => () => {
    setError(null);
    void fn().catch((e: unknown) => setError(message(e)));
  };
  const edit = (partId: string) => async (change: { removed?: boolean; text?: string }) => {
    try {
      props.onChanged(await session.client().command('features.wizard.editPart', { wizardId, partId, ...change }));
    } catch (e) {
      setError(message(e));
    }
  };

  const open = review.questions.filter((q) => q.answer === null && !q.deferred);
  const given = Object.fromEntries(Object.entries(answers).filter(([id, a]) => a.trim() !== '' && open.some((q) => q.id === id)));

  if (review.state === 'running') {
    return (
      <section aria-label="AI review" className="wizard-review">
        <p role="status">
          {step === 'clarify' ? 'The agent is updating the draft with your answers…' : 'The agent is reviewing your idea…'}
        </p>
        {output.length > 0 && (
          <pre className="wizard-output" aria-label="Agent output">
            {output.join('\n')}
          </pre>
        )}
      </section>
    );
  }
  if (review.state === 'failed') {
    return (
      <section aria-label="AI review" className="wizard-review">
        <p role="alert">The AI review failed: {review.reason}</p>
        <div className="dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={props.onSave}>
            Save without AI
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={aiDisabledReason !== null}
            title={aiDisabledReason ?? undefined}
            onClick={props.onRetry}
          >
            Review with AI
          </button>
        </div>
      </section>
    );
  }

  const covered = review.covered && !review.covered.dismissed ? review.covered : null;
  return (
    <section aria-label="AI review" className="wizard-review">
      {error && <p role="alert">{error}</p>}
      {covered && (
        <Callout tone="warning" role="region" label="Already covered" title={`Already covered by ${covered.ref}`}>
          <p>{covered.text}</p>
          <div className="callout-actions">
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={call(async () => {
                await session.client().command('features.wizard.withdraw', { wizardId });
                props.onWithdraw();
              })}
            >
              Withdraw
            </button>
            {covered.ref.startsWith('FI-') && (
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={call(async () => {
                  const merged = await session.client().command('features.wizard.merge', { wizardId, featureId: covered.ref });
                  props.onMerged(merged.path);
                })}
              >
                Merge into {covered.ref}
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={call(async () => props.onChanged(await session.client().command('features.wizard.dismissCovered', { wizardId })))}
            >
              Continue
            </button>
          </div>
        </Callout>
      )}
      {step === 'review' ? (
        <div className="wizard-review-columns">
          <section aria-label="Enhanced draft" className="enhanced-draft">
            {SECTIONS.map(([section, label]) => {
              const parts = review.parts.filter((p) => p.section === section);
              return parts.length === 0 ? null : (
                <div key={section}>
                  <h3>{label}</h3>
                  <ul>
                    {parts.map((p) => (
                      <PartItem key={`${p.id}:${p.text}`} part={p} onEdit={edit(p.id)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
          <section aria-label="Findings" className="review-findings">
            <h3>Findings</h3>
            <ul>
              {review.overlaps.map((o) => (
                <li key={`o:${o.ref}`}>
                  Overlaps with {o.ref}: {o.text}{' '}
                  {props.onView && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      aria-label={`View ${o.ref}`}
                      onClick={() => props.onView?.(o.ref)}
                    >
                      View
                    </button>
                  )}
                </li>
              ))}
              {review.conflicts.map((c) => (
                <li key={`c:${c.ref}`}>
                  Conflicts with {c.ref}: {c.text}
                </li>
              ))}
              {review.suggestedEpic && (
                <li>
                  Fits epic {review.suggestedEpic.id}: {review.suggestedEpic.reason}{' '}
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => props.onUseEpic(review.suggestedEpic!.id)}>
                    Use this epic
                  </button>
                </li>
              )}
              {review.overlaps.length + review.conflicts.length === 0 && !review.suggestedEpic && <li>No overlaps or conflicts found.</li>}
            </ul>
          </section>
        </div>
      ) : (
        <section aria-label="Questions" className="review-questions">
          {review.questions.map((q) => (
            <fieldset key={q.id} className="question-card">
              <legend>{q.text}</legend>
              {q.why && <p className="field-hint">{q.why}</p>}
              {q.answer !== null ? (
                <p>Answer: {q.answer}</p>
              ) : q.deferred ? (
                <p>Answer later</p>
              ) : (
                <>
                  <div className="question-options">
                    {q.options.map((o) => (
                      <button
                        key={o}
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  <label>
                    Answer
                    <input
                      className="input"
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  </label>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={call(async () =>
                      props.onChanged(await session.client().command('features.wizard.deferQuestion', { wizardId, questionId: q.id })),
                    )}
                  >
                    Answer later
                  </button>
                </>
              )}
            </fieldset>
          ))}
          {review.questions.length === 0 && <p>The agent has no questions.</p>}
        </section>
      )}
      <div className="dialog-footer">
        {step === 'review' ? (
          <button className="btn btn-primary" type="button" onClick={open.length > 0 ? props.onClarify : props.onSave}>
            Continue
          </button>
        ) : (
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={Object.keys(given).length === 0 || aiDisabledReason !== null}
              title={aiDisabledReason ?? undefined}
              onClick={call(async () => {
                const sent = await session.client().command('features.wizard.answer', { wizardId, answers: given });
                if (!sent.ok) throw new Error(sent.reason);
                setAnswers({});
                const w = await session.client().query('features.wizard.get', { wizardId });
                if (w) props.onChanged(w);
              })}
            >
              Send answers
            </button>
            <button className="btn btn-primary" type="button" onClick={props.onSave}>
              Done clarifying
            </button>
          </>
        )}
      </div>
    </section>
  );
}
