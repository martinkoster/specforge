// SPDX-License-Identifier: Apache-2.0
// Executions: run list, live streams (tile up to three), cancel, context, result and trace per run (US-054, UC-019, UF-05,
// US-034).
import { useCallback, useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { RunLog } from './RunLog.js';
import { TracePanel } from '../specs/TracePanel.js';

export type RunRow = QueryOutput<'runs.overview'>[number];

const ACTIVE = new Set(['preparing', 'running', 'awaiting_approval']);
const MAX_TILES = 3;
const REFRESH_MS = 1000;

const STATUS_LABEL: Record<string, string> = {
  preparing: 'Preparing',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  queued: 'Queued',
  blocked_conflict: 'Blocked (conflict)',
  completed: 'Completed',
  completed_no_result: 'Completed (no result)',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};

/** Elapsed time as m:ss or h:mm:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function elapsed(row: RunRow, now: number): string {
  if (!row.startedAt) return '—';
  const end = row.endedAt ? Date.parse(row.endedAt) : now;
  return formatElapsed(end - Date.parse(row.startedAt));
}

export interface ExecutionsAreaProps {
  session: CoreSession;
  projectId: string;
  now?: () => number;
  /** Opens an artifact from the trace of a run (US-034). */
  onOpenArtifact?(path: string): void;
}

export function ExecutionsArea({ session, projectId, now = Date.now, onOpenArtifact }: ExecutionsAreaProps) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [tile, setTile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(now());

  const refresh = useCallback(async () => {
    setRows(await session.client().query('runs.overview', { projectId }));
    setClock(now());
  }, [session, projectId, now]);

  useEffect(() => {
    void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    const client = session.client();
    const offs = [
      client.subscribe('run.finished', () => void refresh().catch(() => undefined)),
      client.subscribe('pending.changed', () => void refresh().catch(() => undefined)),
    ];
    const timer = setInterval(() => void refresh().catch(() => undefined), REFRESH_MS);
    return () => {
      offs.forEach((off) => off());
      clearInterval(timer);
    };
  }, [session, refresh]);

  const select = (runId: string) => {
    setSelected((prev) => {
      if (!tile) return [runId];
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      return [...prev, runId].slice(-MAX_TILES);
    });
  };

  const cancel = async (runId: string) => {
    setError(null);
    const result = await session.client().command('runs.cancel', { runId });
    if (!result.ok) setError(result.reason);
    await refresh();
  };

  const shown = selected.map((id) => rows.find((r) => r.runId === id)).filter((r): r is RunRow => r !== undefined);

  return (
    <div className="executions-area">
      <h1>Executions</h1>
      {error && <p role="alert">{error}</p>}
      <label>
        <input
          type="checkbox"
          checked={tile}
          onChange={(e) => {
            setTile(e.target.checked);
            if (!e.target.checked) setSelected((prev) => prev.slice(-1));
          }}
        />{' '}
        Tile (up to {MAX_TILES} streams)
      </label>
      {rows.length === 0 ? (
        <p>No runs yet. Move a story to In Progress to start one.</p>
      ) : (
        <table className="run-list" aria-label="Runs">
          <thead>
            <tr>
              <th scope="col">Story</th>
              <th scope="col">Status</th>
              <th scope="col">Elapsed</th>
              <th scope="col">Files touched</th>
              <th scope="col">Pending prompts</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const active = ACTIVE.has(row.status);
              const key = row.runId ?? `queued-${row.storyId}`;
              return (
                <tr key={key} aria-selected={row.runId !== null && selected.includes(row.runId)}>
                  <td>
                    {row.runId ? (
                      <button type="button" className="link" onClick={() => select(row.runId!)}>
                        {row.storyId ? `${row.storyId} — ${row.title}` : row.title}
                      </button>
                    ) : (
                      `${row.storyId} — ${row.title}`
                    )}
                  </td>
                  <td>
                    <span className={`chip chip-${row.status}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
                  </td>
                  <td>{elapsed(row, clock)}</td>
                  <td>{row.touchedFiles}</td>
                  <td>{row.pendingPrompts > 0 ? <strong>{row.pendingPrompts}</strong> : 0}</td>
                  <td>
                    {active && row.runId && (
                      <button type="button" onClick={() => void cancel(row.runId!).catch((e: unknown) => setError(String(e)))}>
                        Cancel {row.storyId ?? 'run'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className={shown.length > 1 ? 'run-tiles run-tiles-tiled' : 'run-tiles'}>
        {shown.map((row) => (
          <RunPanel key={row.runId} session={session} projectId={projectId} row={row} onOpenArtifact={onOpenArtifact} />
        ))}
      </div>
    </div>
  );
}

type Tab = 'log' | 'context' | 'result' | 'trace';
const TAB_LABELS: Record<Tab, string> = { log: 'Log', context: 'Context', result: 'Result', trace: 'Trace' };

interface RunPanelProps {
  session: CoreSession;
  projectId: string;
  row: RunRow;
  onOpenArtifact: ((path: string) => void) | undefined;
}

function RunPanel({ session, projectId, row, onOpenArtifact }: RunPanelProps) {
  const [tab, setTab] = useState<Tab>('log');
  const runId = row.runId!;
  return (
    <article className="run-panel" aria-label={`Run ${row.storyId ?? runId}`}>
      <header>
        <h2>
          {row.storyId ?? row.kind} <span className={`chip chip-${row.status}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
        </h2>
        <div role="tablist">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </header>
      {tab === 'log' && <RunLog session={session} runId={runId} live={ACTIVE.has(row.status)} />}
      {tab === 'context' && <RunContext session={session} runId={runId} />}
      {tab === 'result' && <RunResult session={session} runId={runId} />}
      {tab === 'trace' && (
        <TracePanel
          session={session}
          projectId={projectId}
          elements={[]}
          root={{ kind: 'run', id: runId }}
          onNavigate={(node) => node.path && onOpenArtifact?.(node.path)}
        />
      )}
    </article>
  );
}

export function RunContext({ session, runId }: { session: CoreSession; runId: string }) {
  const [context, setContext] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void session
      .client()
      .query('runs.context', { runId })
      .then((r) => setContext(r.context))
      .catch(() => setContext(null));
  }, [session, runId]);
  if (context === undefined) return <p>Loading…</p>;
  if (context === null) return <p>No context was recorded for this run.</p>;
  return <pre className="run-context">{context}</pre>;
}

function RunResult({ session, runId }: { session: CoreSession; runId: string }) {
  const [result, setResult] = useState<QueryOutput<'runs.result'> | undefined>(undefined);
  useEffect(() => {
    void session
      .client()
      .query('runs.result', { runId })
      .then(setResult)
      .catch(() => setResult(null));
  }, [session, runId]);
  if (result === undefined) return <p>Loading…</p>;
  if (result === null) return <p>The run has not produced a result yet.</p>;
  return (
    <div className="run-result">
      {result.result ? (
        <>
          <p>
            <strong>Outcome:</strong> {result.result.outcome}
          </p>
          <p>{result.result.summary}</p>
          {result.result.tests && (
            <p>
              Tests: {result.result.tests.passed}/{result.result.tests.run} passed, {result.result.tests.failed} failed
            </p>
          )}
          {result.result.coverage !== undefined && <p>Coverage: {result.result.coverage} %</p>}
          {result.result.openIssues.length > 0 && (
            <>
              <h3>Open issues</h3>
              <ul>
                {result.result.openIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p role="status">Result unavailable: {result.unavailableReason}</p>
      )}
      <h3>Changed files</h3>
      {result.computedFiles.length === 0 ? (
        <p>No file changes.</p>
      ) : (
        <ul>
          {result.computedFiles.map((f) => (
            <li key={f.path}>
              {f.change} {f.path} (+{f.additions} −{f.deletions})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
