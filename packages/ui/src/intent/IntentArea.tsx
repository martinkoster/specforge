// SPDX-License-Identifier: Apache-2.0
// Intent area (US-028, UC-004/UC-005): template for new projects, Markdown editor with approval, AI quality check and
// refinement, the clarification dialogue and the codebase analysis of adopted projects (US-080).
import { useBaselines } from '../specs/use-baselines.js';
import { PageHeader, Skeleton } from '../components/index.js';
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';
import { ArtifactAiPanel, headingLine } from '../specs/ArtifactAiPanel.js';
import { ArtifactEditor } from '../specs/ArtifactEditor.js';
import { useSpecLayout } from '../specs/spec-layout-context.js';
import { AnalyzePanel } from './AnalyzePanel.js';
import { ClarificationPanel } from './ClarificationPanel.js';

export interface IntentAreaProps {
  session: CoreSession;
  projectId: string;
  aiDisabledReason?: string | null;
  /** US-082 AC-1: opens the feature wizard once the main intent is approved. */
  onAddFeature?(): void;
}

export function IntentArea({ session, projectId, aiDisabledReason = null, onAddFeature }: IntentAreaProps) {
  // US-078: the intent lives below the project's specification root.
  const INTENT_PATH = useSpecLayout().intentPath;
  const [doc, setDoc] = useState<{ content: string; hash: string } | null | undefined>(undefined);
  const [approval, setApproval] = useState<'draft' | 'approved'>('draft');
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState<{ line: number; seq: number } | null>(null);
  const [openFindings, setOpenFindings] = useState(0);
  const baselines = useBaselines(session, projectId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = session.client();
    const file = await client.query('artifact.read', { projectId, path: INTENT_PATH }).catch(() => null);
    setDoc(file);
    setContent(file?.content ?? '');
    const groups = await client.query('artifacts.list', { projectId }).catch(() => []);
    setApproval(groups.flatMap((g) => g.artifacts).find((a) => a.path === INTENT_PATH)?.approval ?? 'draft');
  }, [session, projectId, INTENT_PATH]);

  useEffect(() => {
    void load();
  }, [load]);

  if (doc === undefined) return <Skeleton label="Loading the intent" lines={6} />;
  return (
    <div className="intent-area">
      <PageHeader
        title="Intent"
        description="What to build and why — the source of every specification."
        {...(approval === 'approved' && onAddFeature
          ? {
              actions: (
                <button className="btn btn-primary" type="button" onClick={onAddFeature}>
                  ＋ Add feature
                </button>
              ),
            }
          : {})}
      />
      {error && <p role="alert">{error}</p>}
      {approval !== 'approved' && (
        <AnalyzePanel session={session} projectId={projectId} aiDisabledReason={aiDisabledReason} onChanged={() => void load()} />
      )}
      {doc === null ? (
        <section aria-label="No intent yet">
          <p>This project has no intent yet. Describe what should be built and why.</p>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              void session
                .client()
                .command('intent.create', { projectId })
                .then(load)
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            }
          >
            Start from the template
          </button>
        </section>
      ) : (
        <div className="intent-layout">
          <ArtifactEditor
            key={doc.hash}
            path={INTENT_PATH}
            initial={doc}
            baselines={baselines.tags}
            onCompare={baselines.compare(INTENT_PATH)}
            approval={approval}
            focusLine={focus}
            openFindings={openFindings}
            onContentChange={setContent}
            onApprove={async () => {
              await session.client().command('artifact.approve', { projectId, path: INTENT_PATH });
              await load();
            }}
            onSave={async (next, expectedHash) => {
              const result = await session.client().command('artifact.save', { projectId, path: INTENT_PATH, content: next, expectedHash });
              if (result.ok) setApproval('draft');
              return result;
            }}
          />
          <div className="intent-side">
            <ClarificationPanel
              session={session}
              projectId={projectId}
              path={INTENT_PATH}
              aiDisabledReason={aiDisabledReason}
              onChanged={() => void load()}
            />
            <ArtifactAiPanel
              session={session}
              projectId={projectId}
              path={INTENT_PATH}
              content={content}
              aiDisabledReason={aiDisabledReason}
              onOpenCount={setOpenFindings}
              onJump={(elementId) => {
                const line = headingLine(content, elementId);
                if (line !== null) setFocus((f) => ({ line, seq: (f?.seq ?? 0) + 1 }));
              }}
              onChanged={() => void load()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
