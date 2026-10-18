// SPDX-License-Identifier: Apache-2.0
// Intent area (US-028, UC-004/UC-005): template for new projects, Markdown editor with approval, AI quality check and
// refinement, and the clarification dialogue.
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';
import { ArtifactAiPanel, headingLine } from '../specs/ArtifactAiPanel.js';
import { ArtifactEditor } from '../specs/ArtifactEditor.js';
import { ClarificationPanel } from './ClarificationPanel.js';

export const INTENT_PATH = 'spec/01_intent/intent.md';

export interface IntentAreaProps {
  session: CoreSession;
  projectId: string;
  aiDisabledReason?: string | null;
}

export function IntentArea({ session, projectId, aiDisabledReason = null }: IntentAreaProps) {
  const [doc, setDoc] = useState<{ content: string; hash: string } | null | undefined>(undefined);
  const [approval, setApproval] = useState<'draft' | 'approved'>('draft');
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState<{ line: number; seq: number } | null>(null);
  const [openFindings, setOpenFindings] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = session.client();
    const file = await client.query('artifact.read', { projectId, path: INTENT_PATH }).catch(() => null);
    setDoc(file);
    setContent(file?.content ?? '');
    const groups = await client.query('artifacts.list', { projectId }).catch(() => []);
    setApproval(groups.flatMap((g) => g.artifacts).find((a) => a.path === INTENT_PATH)?.approval ?? 'draft');
  }, [session, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (doc === undefined) return <p>Loading the intent…</p>;
  return (
    <div className="intent-area">
      <h1>Intent</h1>
      {error && <p role="alert">{error}</p>}
      {doc === null ? (
        <section aria-label="No intent yet">
          <p>This project has no intent yet. Describe what should be built and why.</p>
          <button
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
