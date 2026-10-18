// SPDX-License-Identifier: Apache-2.0
// Trace panel (US-034, UC-009, FR-016/FR-055): upstream and downstream links of an element, story, run or changed file;
// links navigate; changed files open as diff or in the default editor; unknown IDs are listed as issues.
import { useEffect, useState } from 'react';
import type { QueryInput, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { DiffView } from '../review/DiffView.js';

type Trace = QueryOutput<'trace.get'>;
export type TraceNode = Trace['node'];
type Target = QueryInput<'trace.get'>['target'];

const ID = /^(?:#{1,6}\s+((?:FR|NFR|CON|UC|BP|UF|ADR|EP|US|FI|TC)-\d{1,4}):|id:\s*((?:US|EP)-\d{1,4})\s*$)/;

/** Element IDs of an artifact: its element headings and the story/epic ID of the front-matter. */
export function elementIdsOf(content: string): string[] {
  return content.split('\n').flatMap((line) => {
    const m = ID.exec(line.trim());
    return m ? [m[1] ?? m[2]!] : [];
  });
}

export interface TracePanelProps {
  session: CoreSession;
  projectId: string;
  /** Elements of the current artifact to trace. */
  elements: string[];
  /** Open an element's or story's artifact. */
  onNavigate(node: TraceNode): void;
  /** Trace this story, run or file instead of the artifact's elements (board drawer, executions view). */
  root?: Target;
}

export function TracePanel({ session, projectId, elements, onNavigate, root }: TracePanelProps) {
  const [element, setElement] = useState(elements[0] ?? '');
  const [stack, setStack] = useState<Target[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [diff, setDiff] = useState<{ path: string; before: string; after: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target: Target | null = stack.at(-1) ?? root ?? (element ? { kind: 'element', id: element } : null);

  useEffect(() => {
    if (!elements.includes(element)) setElement(elements[0] ?? '');
  }, [elements, element]);

  useEffect(() => {
    if (!target) return setTrace(null);
    setDiff(null);
    void session
      .client()
      .query('trace.get', { projectId, target })
      .then(setTrace, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // The target is derived from `stack` and `element`.
  }, [session, projectId, target?.kind, target?.id]);

  const follow = (node: TraceNode) => {
    if (node.kind === 'run') setStack((s) => [...s, { kind: 'run', id: node.id }]);
    else if (node.kind === 'element' || node.kind === 'story') onNavigate(node);
  };

  const showDiff = (node: TraceNode) =>
    void session
      .client()
      .query('review.fileVersions', { projectId, runId: node.runId!, path: node.id })
      .then((v) => setDiff({ path: node.id, before: v.before ?? '', after: v.after ?? '' }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  const list = (label: string, nodes: TraceNode[]) => (
    <ul aria-label={label}>
      {nodes.map((n) => (
        <li key={`${n.kind}:${n.id}`}>
          {n.kind === 'file' ? (
            <>
              <span>{n.label}</span>{' '}
              {n.runId && (
                <>
                  <button type="button" aria-label={`Diff of ${n.id}`} onClick={() => showDiff(n)}>
                    Diff
                  </button>
                  <button
                    type="button"
                    aria-label={`Open ${n.id} in editor`}
                    onClick={() =>
                      void session
                        .client()
                        .command('review.openFile', { projectId, runId: n.runId!, path: n.id })
                        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                    }
                  >
                    Open in editor
                  </button>
                </>
              )}
            </>
          ) : (
            <button type="button" className="link" disabled={!n.exists} onClick={() => follow(n)}>
              {n.exists ? n.label : `${n.label} (unknown)`}
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Trace" className="trace-panel">
      <h3>Trace</h3>
      {error && <p role="alert">{error}</p>}
      {stack.length > 0 ? (
        <button type="button" onClick={() => setStack((s) => s.slice(0, -1))}>
          Back
        </button>
      ) : (
        elements.length > 1 && (
          <select aria-label="Element" value={element} onChange={(e) => setElement(e.target.value)}>
            {elements.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )
      )}
      {!target && <p>This artifact has no element IDs to trace.</p>}
      {trace && (
        <>
          <p>
            <strong>{trace.node.label}</strong>
          </p>
          <h4>Upstream</h4>
          {trace.upstream.length === 0 ? <p className="hint">None</p> : list('Upstream', trace.upstream)}
          <h4>Downstream</h4>
          {trace.downstream.length === 0 ? <p className="hint">None</p> : list('Downstream', trace.downstream)}
          {trace.issues.length > 0 && (
            <ul aria-label="Issues" className="banner banner-warning">
              {trace.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {diff && <DiffView before={diff.before} after={diff.after} mode="unified" label={diff.path} />}
    </section>
  );
}
