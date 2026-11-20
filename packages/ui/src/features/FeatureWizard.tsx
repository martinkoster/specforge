// SPDX-License-Identifier: Apache-2.0
// Feature wizard sheet (US-082, UC-043, UF-17): Describe · AI review · Clarify · Save. The draft is stored after every
// step and on close (ADR-025) and resumes at the same step; *Review with AI* / clarification (US-083); *Save* previews
// and writes FI-xxx-<slug>.md.
import { useCallback, useEffect, useState } from 'react';
import type { CommandInput, QueryOutput } from '@specforge/ipc-contract';
import { Drawer } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';
import { FeatureReviewPanel } from './FeatureReviewPanel.js';

type Wizard = NonNullable<QueryOutput<'features.wizard.get'>>;
/** The draft as the core returns it (incl. the AI review, US-083). */
type Draft = Wizard['draft'];
type DraftInput = CommandInput<'features.wizard.create'>['draft'];
type Step = CommandInput<'features.wizard.update'>['step'];
type Preview = QueryOutput<'features.wizard.preview'>;

const STEPS: readonly { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'review', label: 'AI review' },
  { id: 'clarify', label: 'Clarify' },
  { id: 'save', label: 'Save' },
];

const FEATURE_STEPS = ['Feature intent ✓', 'Impact', 'Requirements', 'Design', 'Epic & stories', 'Kanban', 'Epic review'] as const;

export interface FeatureWizardProps {
  session: CoreSession;
  projectId: string;
  /** A stored draft to resume (AC-4), or null for a new feature. */
  resumeId: string | null;
  onClose(): void;
  onSaved?(saved: { featureId: string; path: string }): void;
  /** *Continue to impact analysis* with the saved feature. */
  onContinue(featureId: string): void;
  /** Limited mode: only *Save without AI* (US-083). */
  aiDisabledReason?: string | null;
  /** *View* an overlapping element. */
  onView?(ref: string): void;
  /** The idea was merged into an existing feature intent. */
  onMerged?(path: string): void;
  /** *Turn into feature* of an inbox idea (US-095 AC-3): pre-fills the description and links the draft to the idea. */
  idea?: { id: string; text: string; note: string | null };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Only the filled-in fields are stored; the review belongs to the core. */
function compact(draft: Draft): DraftInput {
  const out: DraftInput = { text: draft.text };
  if (draft.motivation?.trim()) out.motivation = draft.motivation;
  if (draft.targetUsers?.trim()) out.targetUsers = draft.targetUsers;
  if (draft.priority) out.priority = draft.priority;
  if (draft.epicId) out.epicId = draft.epicId;
  if (draft.title?.trim()) out.title = draft.title;
  return out;
}

export function FeatureWizard({
  session,
  projectId,
  resumeId,
  onClose,
  onSaved,
  onContinue,
  aiDisabledReason = null,
  onView,
  onMerged,
  idea,
}: FeatureWizardProps) {
  const [wizardId, setWizardId] = useState<string | null>(resumeId);
  const [step, setStep] = useState<Step>('describe');
  const [draft, setDraft] = useState<Draft>(idea ? { text: idea.text, ...(idea.note ? { motivation: idea.note } : {}) } : { text: '' });
  const [loading, setLoading] = useState(resumeId !== null);
  const [epics, setEpics] = useState<{ id: string; title: string }[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<{ featureId: string; path: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void session
      .client()
      .query('epics.list', { projectId })
      .then((list) => setEpics(list.epics.map((e) => ({ id: e.id, title: e.title }))))
      .catch(() => setEpics([]));
  }, [session, projectId]);

  const loadPreview = useCallback(
    async (id: string, nextTitle?: string) => {
      const p = await session
        .client()
        .query('features.wizard.preview', { wizardId: id, ...(nextTitle !== undefined ? { title: nextTitle } : {}) });
      setPreview(p);
      return p;
    },
    [session],
  );

  // AC-4: a stored draft resumes at its step.
  useEffect(() => {
    if (resumeId === null) return;
    let current = true;
    void session
      .client()
      .query('features.wizard.get', { wizardId: resumeId })
      .then(async (w) => {
        if (!current || !w) return;
        setDraft(w.draft);
        setStep(w.step);
        if (w.step === 'save') setTitle((await loadPreview(w.id, w.draft.title)).title);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [session, resumeId, loadPreview]);

  // US-083: the core updates the draft when an AI round finishes.
  useEffect(() => {
    if (wizardId === null) return;
    return session.client().subscribe('features.wizardUpdated', (e) => {
      if (e.wizardId !== wizardId) return;
      void session
        .client()
        .query('features.wizard.get', { wizardId })
        .then((w) => w && setDraft(w.draft))
        .catch(() => undefined);
    });
  }, [session, wizardId]);

  // US-095 AC-3: a draft turned from an idea is stored right away, linked to the idea.
  const ideaId = idea?.id;
  useEffect(() => {
    if (!ideaId || resumeId !== null) return;
    void persist('describe').catch((e: unknown) => setError(message(e)));
    // Only once for the idea the wizard was opened with (persist is recreated on every render).
  }, [ideaId]);

  /** Stores the draft at `next` (AC-4); returns the wizard id. */
  const persist = async (next: Step, value: Draft = draft): Promise<string> => {
    const client = session.client();
    let id = wizardId;
    if (id === null) {
      id = (await client.command('features.wizard.create', { projectId, draft: compact(value), ...(idea ? { sourceIdea: idea.id } : {}) }))
        .id;
      setWizardId(id);
      if (next === 'describe') return id;
    }
    await client.command('features.wizard.update', { wizardId: id, step: next, draft: compact(value) });
    return id;
  };

  const close = async (): Promise<void> => {
    try {
      if (saved) {
        // Nothing to keep.
      } else if (draft.text.trim() !== '') await persist(step);
      else if (wizardId !== null) await session.client().command('features.wizard.discard', { wizardId });
    } catch {
      // Closing never fails; the draft keeps its last stored step.
    }
    onClose();
  };

  const act = (fn: () => Promise<void>) => () => {
    setBusy(true);
    setError(null);
    void fn()
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setBusy(false));
  };

  /** *Review with AI* (US-083 AC-1). */
  const startReview = act(async () => {
    const id = await persist('review');
    const started = await session.client().command('features.wizard.review', { wizardId: id });
    if (!started.ok) throw new Error(started.reason);
    const w = await session.client().query('features.wizard.get', { wizardId: id });
    if (w) setDraft(w.draft);
    setStep('review');
  });

  const toClarify = act(async () => {
    await persist('clarify');
    setStep('clarify');
  });

  const toSave = act(async () => {
    const id = await persist('save');
    const p = await loadPreview(id, draft.title);
    setTitle(p.title);
    setStep('save');
  });

  const back = act(async () => {
    await persist('describe', { ...draft, title });
    setDraft((d) => ({ ...d, title }));
    setStep('describe');
  });

  const save = (approve: boolean) =>
    act(async () => {
      const result = await session.client().command('features.wizard.save', { wizardId: wizardId!, title, approve });
      setSaved(result);
      onSaved?.(result);
    });

  const changeTitle = (value: string): void => {
    setTitle(value);
    if (wizardId !== null && value.trim() !== '') void loadPreview(wizardId, value).catch(() => undefined);
  };

  const field = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Drawer title="Add feature" onClose={() => void close()} className="feature-wizard">
      <ol aria-label="Wizard steps" className="wizard-steps">
        {STEPS.map((s) => (
          <li
            key={s.id}
            aria-current={!saved && s.id === step ? 'step' : undefined}
            className={s.id === step ? 'wizard-step-current' : undefined}
          >
            {s.label}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading the draft…</p>
      ) : saved ? (
        <section aria-label="Feature saved" className="wizard-saved">
          <h2>{saved.featureId} saved</h2>
          <ol aria-label="Feature steps" className="feature-steps">
            {FEATURE_STEPS.map((s, i) => (
              <li key={s} className={i === 0 ? 'feature-step-done' : undefined}>
                {s}
              </li>
            ))}
          </ol>
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Back to dashboard
            </button>
            <button className="btn btn-primary" type="button" onClick={() => onContinue(saved.featureId)}>
              Continue to impact analysis
            </button>
          </div>
        </section>
      ) : (step === 'review' || step === 'clarify') && draft.review && wizardId !== null ? (
        <FeatureReviewPanel
          session={session}
          wizardId={wizardId}
          step={step}
          review={draft.review}
          aiDisabledReason={aiDisabledReason}
          onChanged={(w) => setDraft(w.draft)}
          onRetry={startReview}
          onClarify={toClarify}
          onContinue={toSave}
          onSave={toSave}
          onWithdraw={onClose}
          onMerged={(path) => {
            onMerged?.(path);
            onClose();
          }}
          {...(onView ? { onView } : {})}
          onUseEpic={(epicId) => setDraft((d) => ({ ...d, epicId }))}
        />
      ) : step === 'save' ? (
        <section aria-label="Save" className="wizard-save">
          <label>
            Title
            <input className="input" value={title} onChange={(e) => changeTitle(e.target.value)} />
          </label>
          {preview && (
            <pre className="wizard-preview" aria-label={`Preview of ${preview.path}`}>
              {preview.content}
            </pre>
          )}
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={back}>
              Back
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy || title.trim() === ''} onClick={save(false)}>
              Save as draft
            </button>
            <button className="btn btn-primary" type="button" disabled={busy || title.trim() === ''} onClick={save(true)}>
              Save &amp; approve
            </button>
          </div>
        </section>
      ) : (
        <section aria-label="Describe" className="wizard-describe">
          <label>
            What would you like to add or change?
            <textarea
              className="textarea"
              rows={6}
              value={draft.text}
              placeholder="Users can comment on tasks and mention teammates"
              onChange={(e) => field('text', e.target.value)}
              autoFocus
            />
          </label>
          <details>
            <summary>More details</summary>
            <label>
              Motivation
              <textarea
                className="textarea"
                rows={2}
                value={draft.motivation ?? ''}
                onChange={(e) => field('motivation', e.target.value)}
              />
            </label>
            <label>
              Target users
              <input className="input" value={draft.targetUsers ?? ''} onChange={(e) => field('targetUsers', e.target.value)} />
            </label>
            <label>
              Priority
              <select
                className="select"
                value={draft.priority ?? ''}
                onChange={(e) => field('priority', e.target.value === '' ? undefined : (e.target.value as Draft['priority']))}
              >
                <option value="">Not set</option>
                <option value="must">Must</option>
                <option value="should">Should</option>
                <option value="could">Could</option>
              </select>
            </label>
            <label>
              Related epic
              <select
                className="select"
                value={draft.epicId ?? ''}
                onChange={(e) => field('epicId', e.target.value === '' ? undefined : e.target.value)}
              >
                <option value="">None</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} {e.title}
                  </option>
                ))}
              </select>
            </label>
          </details>
          <div className="dialog-footer">
            <button className="btn btn-secondary" type="button" disabled={busy || draft.text.trim() === ''} onClick={toSave}>
              Save without AI
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || draft.text.trim() === '' || aiDisabledReason !== null}
              title={aiDisabledReason ?? undefined}
              onClick={startReview}
            >
              Review with AI
            </button>
          </div>
        </section>
      )}
    </Drawer>
  );
}
