// SPDX-License-Identifier: Apache-2.0
// AI actions on the selected artifact: *Refine with AI* (US-030, UC-008) and *Quality check* with findings
// (US-029, UC-032); proposals are reviewed with the Review-changes dialog (US-027).
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { ReviewChangesDialog, type SpecReview } from './ReviewChangesDialog.js';

type Finding = QueryOutput<'quality.findings'>[number];

const SEVERITY_ORDER: Record<Finding['severity'], number> = { critical: 0, major: 1, minor: 2, info: 3 };
const STATE_ORDER: Record<Finding['state'], number> = { open: 0, applied: 1, dismissed: 2 };
const HEADING = /^#{1,6}\s+((?:FR|NFR|CON|UC|BP|UF|ADR|EP|US|FI|TC)-\d{1,4}:\s*.+?)\s*$/;

/** Element headings of an artifact ("FR-001: Login"), the sections that can be refined. */
export function sectionsOf(content: string): string[] {
  return content.split('\n').flatMap((line) => {
    const m = HEADING.exec(line);
    return m ? [m[1]!] : [];
  });
}

/** 1-based line of an element's heading, or null. */
export function headingLine(content: string, elementId: string): number | null {
  const index = content.split('\n').findIndex((line) => HEADING.exec(line)?.[1]?.startsWith(`${elementId}:`));
  return index < 0 ? null : index + 1;
}

export interface ArtifactAiPanelProps {
  session: CoreSession;
  projectId: string;
  path: string;
  content: string;
  /** Jump to an element's heading in the editor (US-029 AC-2). */
  onJump(elementId: string): void;
  /** Kept or discarded proposals changed the artifact. */
  onChanged(): void;
  aiDisabledReason?: string | null;
  /** Open findings changed (header badge of the editor, US-029 AC-4). */
  onOpenCount?(count: number): void;
}

function FindingItem({
  finding,
  onJump,
  onFix,
  onDismiss,
}: {
  finding: Finding;
  onJump(id: string): void;
  onFix(): void;
  onDismiss(reason: string): void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li data-severity={finding.severity} className={`finding finding-${finding.severity} finding-${finding.state}`}>
      <strong>{finding.severity}</strong> · {finding.category}{' '}
      {finding.elementId && (
        <button type="button" className="link" aria-label={`Go to ${finding.elementId}`} onClick={() => onJump(finding.elementId!)}>
          {finding.elementId}
        </button>
      )}
      <p>{finding.explanation}</p>
      {finding.suggestedFix && <p className="hint">Suggested fix: {finding.suggestedFix}</p>}
      {finding.state === 'dismissed' && <p className="hint">Dismissed: {finding.dismissReason}</p>}
      {finding.state === 'applied' && <p className="hint">Fix applied.</p>}
      {finding.state === 'open' && !dismissing && (
        <>
          <button type="button" onClick={onFix}>
            Apply fix
          </button>
          <button type="button" onClick={() => setDismissing(true)}>
            Dismiss
          </button>
        </>
      )}
      {dismissing && (
        <span>
          <input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" disabled={!reason.trim()} onClick={() => onDismiss(reason)}>
            Confirm dismiss
          </button>
          <button type="button" onClick={() => setDismissing(false)}>
            Cancel
          </button>
        </span>
      )}
    </li>
  );
}

export function ArtifactAiPanel({
  session,
  projectId,
  path,
  content,
  onJump,
  onChanged,
  aiDisabledReason = null,
  onOpenCount,
}: ArtifactAiPanelProps) {
  const [section, setSection] = useState('');
  const [instruction, setInstruction] = useState('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [review, setReview] = useState<SpecReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const loadFindings = useCallback(async () => {
    const loaded = await session.client().query('quality.findings', { projectId, path });
    setFindings(
      [...loaded].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    );
  }, [session, projectId, path]);

  useEffect(() => {
    void loadFindings().catch(() => setFindings([]));
    const client = session.client();
    const offs = [
      client.subscribe('quality.checked', (e) => {
        if (e.projectId !== projectId || e.path !== path) return;
        setChecking(null);
        void loadFindings().catch(() => undefined);
      }),
      client.subscribe('spec.reviewReady', (e) => {
        if (e.projectId !== projectId || e.runId !== proposal) return;
        void client.query('specs.review', { runId: e.runId }).then(setReview).catch(fail);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [session, projectId, path, proposal, loadFindings]);

  const started = (result: { ok: true; runId: string } | { ok: false; reason: string }) => {
    if (!result.ok) return setError(result.reason);
    setError(null);
    setProposal(result.runId);
  };

  const closeReview = () => {
    setReview(null);
    setProposal(null);
    onChanged();
    void loadFindings().catch(() => undefined);
  };

  const decide = (command: 'specs.keep' | 'specs.discard') => async () => {
    const result = await session.client().command(command, { runId: review!.runId });
    if (!result.ok) throw new Error(result.reason);
    closeReview();
  };

  const open = findings.filter((f) => f.state === 'open').length;
  useEffect(() => onOpenCount?.(open), [open, onOpenCount]);
  const disabled = aiDisabledReason !== null;
  return (
    <section className="artifact-ai" aria-label="AI actions">
      {error && <p role="alert">{error}</p>}
      <h3>
        Quality{' '}
        <span className={open > 0 ? 'badge badge-warning' : 'badge'}>{open === 1 ? '1 open finding' : `${open} open findings`}</span>
      </h3>
      <button
        type="button"
        disabled={disabled || checking !== null}
        title={aiDisabledReason ?? undefined}
        onClick={() =>
          void session
            .client()
            .command('quality.check', { projectId, path })
            .then((r) => (r.ok ? setChecking(r.runId) : setError(r.reason)))
            .catch(fail)
        }
      >
        Quality check
      </button>
      {checking && <p role="status">Quality check running…</p>}
      {findings.length > 0 && (
        <ul aria-label="Findings">
          {findings.map((f) => (
            <FindingItem
              key={f.id}
              finding={f}
              onJump={onJump}
              onFix={() => void session.client().command('quality.applyFix', { findingId: f.id }).then(started).catch(fail)}
              onDismiss={(reason) =>
                void session
                  .client()
                  .command('quality.dismiss', { findingId: f.id, reason })
                  .then((r) => (r.ok ? loadFindings() : setError(r.reason)))
                  .catch(fail)
              }
            />
          ))}
        </ul>
      )}
      <h3>Refine with AI</h3>
      <label>
        Section
        <select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">Whole artifact</option>
          {sectionsOf(content).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Instruction
        <textarea aria-label="Refine instruction" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={disabled || instruction.trim() === '' || proposal !== null}
        title={aiDisabledReason ?? undefined}
        onClick={() =>
          void session
            .client()
            .command('specs.refine', { projectId, path, instruction, ...(section ? { section } : {}) })
            .then(started)
            .catch(fail)
        }
      >
        Refine with AI
      </button>
      {proposal && !review && <p role="status">The agent is working on a proposal…</p>}
      {review && (
        <ReviewChangesDialog
          review={review}
          onKeep={decide('specs.keep')}
          onDiscard={decide('specs.discard')}
          onFix={async () => {
            const result = await session.client().command('specs.fix', { runId: review.runId });
            if (!result.ok) throw new Error(result.reason);
            setReview(null);
            setProposal(result.runId);
          }}
          onClose={() => setReview(null)}
        />
      )}
    </section>
  );
}
