// SPDX-License-Identifier: Apache-2.0
// Specifications area: artifacts by type, the split-view editor for the selected one (US-025) and AI generation (US-027).
import { Callout, PageHeader } from '../components/index.js';
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';
import { ArtifactEditor } from './ArtifactEditor.js';
import { ArtifactList, type ArtifactGroups } from './ArtifactList.js';
import { ArtifactAiPanel, headingLine } from './ArtifactAiPanel.js';
import { EpicsPanel } from './EpicsPanel.js';
import { GeneratePanel } from './GeneratePanel.js';
import { TracePanel, elementIdsOf } from './TracePanel.js';
import { useSpecLayout } from './spec-layout-context.js';

export interface SpecificationsAreaProps {
  session: CoreSession;
  projectId: string;
  /** Why AI generation is disabled (US-013), or null. */
  aiDisabledReason?: string | null;
  /** Phase chosen in the stepper (US-033): only its artifacts are listed. */
  phase?: 'requirements' | 'design' | 'stories' | null;
  /** Artifact to open (from the dashboard, US-061). */
  initialPath?: string | null;
}

export function SpecificationsArea({
  session,
  projectId,
  aiDisabledReason = null,
  phase = null,
  initialPath = null,
}: SpecificationsAreaProps) {
  const layout = useSpecLayout();
  const [groups, setGroups] = useState<ArtifactGroups | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ path: string; content: string; hash: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  /** Current editor content (the AI panel offers its sections), jump target and open findings (US-029/US-030). */
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState<{ line: number; seq: number } | null>(null);
  const [openFindings, setOpenFindings] = useState(0);
  /** US-034: element to jump to once its artifact is open; links to unknown IDs in all artifacts. */
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [linkIssues, setLinkIssues] = useState<{ path: string; message: string }[]>([]);

  const loadList = useCallback(async () => {
    setGroups(await session.client().query('artifacts.list', { projectId }));
    setLinkIssues(
      await session
        .client()
        .query('trace.issues', { projectId })
        .catch(() => []),
    );
  }, [session, projectId]);

  useEffect(() => {
    if (!pendingJump || !doc) return;
    const line = headingLine(content, pendingJump);
    if (line !== null) setFocus((f) => ({ line, seq: (f?.seq ?? 0) + 1 }));
    setPendingJump(null);
  }, [pendingJump, doc, content]);

  useEffect(() => {
    loadList().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadList]);

  const select = (path: string): void => {
    setSelected(path);
    session
      .client()
      .query('artifact.read', { projectId, path })
      .then(
        (file) => {
          setDoc({ path, ...file });
          setContent(file.content);
          setFocus(null);
          setError(undefined);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(() => {
    if (initialPath) select(initialPath);
    // Opens the artifact once per requested path.
  }, [initialPath]);

  return (
    <div className="specifications">
      <PageHeader title="Specifications" description="Requirements, design and user stories derived from the intent." />
      {error && <p role="alert">{error}</p>}
      {linkIssues.length > 0 && (
        <Callout tone="warning" role="region" label="Link issues" title="Link issues">
          <ul>
            {linkIssues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      <GeneratePanel
        session={session}
        projectId={projectId}
        aiDisabledReason={aiDisabledReason}
        onChanged={() => void loadList().catch(() => undefined)}
      />
      {(phase === 'stories' || phase === null) && (
        <EpicsPanel
          session={session}
          projectId={projectId}
          refreshKey={groups}
          onOpen={select}
          onChanged={() => void loadList().catch(() => undefined)}
        />
      )}
      <div className="specifications-layout">
        {groups && (
          <ArtifactList
            groups={
              phase
                ? groups
                    .map((g) => ({ ...g, artifacts: g.artifacts.filter((a) => a.path.startsWith(`${layout.folders[phase]}/`)) }))
                    .filter((g) => g.artifacts.length > 0)
                : groups
            }
            selected={selected}
            onSelect={select}
          />
        )}
        {doc && (
          <ArtifactEditor
            key={`${doc.path}:${doc.hash}`}
            path={doc.path}
            initial={doc}
            focusLine={focus}
            openFindings={openFindings}
            onContentChange={setContent}
            approval={groups?.flatMap((g) => g.artifacts).find((a) => a.path === doc.path)?.approval ?? 'draft'}
            onApprove={async () => {
              await session.client().command('artifact.approve', { projectId, path: doc.path });
              await loadList();
              // The front-matter changed: reload the document (the editor has no unsaved changes when approving).
              setDoc({ path: doc.path, ...(await session.client().query('artifact.read', { projectId, path: doc.path })) });
            }}
            onSave={async (content, expectedHash) => {
              const result = await session.client().command('artifact.save', { projectId, path: doc.path, content, expectedHash });
              if (result.ok) await loadList();
              return result;
            }}
          />
        )}
        {doc && (
          <div className="artifact-side">
            {doc && (
              <ArtifactAiPanel
                key={doc.path}
                session={session}
                projectId={projectId}
                path={doc.path}
                content={content}
                aiDisabledReason={aiDisabledReason}
                onOpenCount={setOpenFindings}
                onJump={(elementId) => {
                  const line = headingLine(content, elementId);
                  if (line !== null) setFocus((f) => ({ line, seq: (f?.seq ?? 0) + 1 }));
                }}
                onChanged={() => {
                  void loadList().catch(() => undefined);
                  void session
                    .client()
                    .query('artifact.read', { projectId, path: doc.path })
                    .then((file) => {
                      setDoc({ path: doc.path, ...file });
                      setContent(file.content);
                    })
                    .catch(() => undefined);
                }}
              />
            )}
            {doc && (
              <TracePanel
                key={`trace:${doc.path}`}
                session={session}
                projectId={projectId}
                elements={elementIdsOf(content)}
                onNavigate={(node) => {
                  if (!node.path) return;
                  if (node.path !== doc.path) select(node.path);
                  setPendingJump(node.id);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
