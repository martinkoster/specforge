// SPDX-License-Identifier: Apache-2.0
// Live, virtualised run log with full-text search (US-054 AC-2, AC-3; NFR-002, NFR-005).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';

export interface LogLine {
  seq: number;
  kind: string;
  text: string;
}

export const ROW_HEIGHT = 18;
const VIEWPORT_ROWS = 30;
const OVERSCAN = 10;
const PAGE = 2000;
const POLL_MS = 1000;

/** One display line per recorded event. */
export function formatEvent(type: string, payload: unknown): string {
  const e = (payload ?? {}) as {
    text?: string;
    toolName?: string;
    input?: unknown;
    isError?: boolean;
    message?: string;
    sessionId?: string;
    usage?: unknown;
  };
  switch (type) {
    case 'output':
      return e.text ?? '';
    case 'tool_use':
      return `▶ ${e.toolName ?? 'tool'} ${JSON.stringify(e.input ?? {})}`;
    case 'tool_result':
      return e.isError ? '✗ tool failed' : '✓ tool finished';
    case 'error':
      return `Error: ${e.message ?? ''}`;
    case 'session':
      return `Session ${e.sessionId ?? ''}`;
    case 'usage':
      return `Usage ${JSON.stringify(e.usage ?? {})}`;
    default:
      return type;
  }
}

/** Inserts lines by sequence number, ignoring duplicates (live output and stored events overlap). */
export function mergeLines(current: LogLine[], incoming: LogLine[]): LogLine[] {
  if (incoming.length === 0) return current;
  const last = current.at(-1)?.seq ?? 0;
  const fresh = incoming.filter((l) => l.seq > last);
  if (fresh.length === incoming.length && incoming.every((l, i) => i === 0 || l.seq > incoming[i - 1]!.seq)) return [...current, ...fresh];
  const bySeq = new Map(current.map((l) => [l.seq, l]));
  for (const l of incoming) if (!bySeq.has(l.seq)) bySeq.set(l.seq, l);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export interface RunLogProps {
  session: CoreSession;
  runId: string;
  /** Keep polling for stored events while the run is active. */
  live: boolean;
}

export function RunLog({ session, runId, live }: RunLogProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<number[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const lastSeq = useRef(0);

  const load = useCallback(async () => {
    // Pages through stored events after the last one seen.
    for (;;) {
      const page = await session.client().query('runs.events', { runId, afterSeq: lastSeq.current, limit: PAGE });
      if (page.length === 0) return;
      lastSeq.current = page.at(-1)!.seq;
      setLines((prev) =>
        mergeLines(
          prev,
          page.map((e) => ({ seq: e.seq, kind: e.type, text: formatEvent(e.type, e.payload) })),
        ),
      );
      if (page.length < PAGE) return;
    }
  }, [session, runId]);

  useEffect(() => {
    setLines([]);
    lastSeq.current = 0;
    setMatches(null);
    void load().catch(() => undefined);
    // Output appears as soon as the core emits it (< 1 s); other events arrive with the next poll.
    const off = session.client().subscribe('run.output', (e) => {
      if (e.runId === runId) setLines((prev) => mergeLines(prev, [{ seq: e.seq, kind: 'output', text: e.text }]));
    });
    const timer = live ? setInterval(() => void load().catch(() => undefined), POLL_MS) : undefined;
    return () => {
      off();
      if (timer) clearInterval(timer);
    };
  }, [session, runId, live, load]);

  const scrollToIndex = (index: number) => {
    const top = Math.max(0, index * ROW_HEIGHT - ROW_HEIGHT * 2);
    if (viewport.current) viewport.current.scrollTop = top;
    setScrollTop(top);
    setFollow(false);
  };

  useEffect(() => {
    if (!follow || !viewport.current) return;
    viewport.current.scrollTop = lines.length * ROW_HEIGHT;
    setScrollTop(Math.max(0, (lines.length - VIEWPORT_ROWS) * ROW_HEIGHT));
  }, [lines.length, follow]);

  const search = async () => {
    setSearchError(null);
    if (!query.trim()) {
      setMatches(null);
      return;
    }
    try {
      const { seqs } = await session.client().query('runs.search', { runId, query });
      setMatches(seqs);
      setCurrent(0);
      const index = seqs.length > 0 ? lines.findIndex((l) => l.seq === seqs[0]) : -1;
      if (index >= 0) scrollToIndex(index);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    }
  };

  const step = (delta: number) => {
    if (!matches || matches.length === 0) return;
    const next = (current + delta + matches.length) % matches.length;
    setCurrent(next);
    const index = lines.findIndex((l) => l.seq === matches[next]);
    if (index >= 0) scrollToIndex(index);
  };

  const matchSet = useMemo(() => new Set(matches ?? []), [matches]);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visible = lines.slice(first, first + VIEWPORT_ROWS + OVERSCAN * 2);

  return (
    <section className="run-log" aria-label={`Log of run ${runId}`}>
      <form
        className="run-log-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search log"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search log (e.g. error, install*)"
        />
        <button type="submit">Search</button>
        {matches && (
          <>
            <span role="status">{matches.length === 0 ? 'No matches' : `${current + 1} of ${matches.length}`}</span>
            <button type="button" onClick={() => step(-1)} disabled={matches.length === 0}>
              Previous match
            </button>
            <button type="button" onClick={() => step(1)} disabled={matches.length === 0}>
              Next match
            </button>
          </>
        )}
        <label>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
        {searchError && <span role="alert">{searchError}</span>}
      </form>
      <div
        ref={viewport}
        className="run-log-viewport"
        role="log"
        aria-live="off"
        style={{ height: VIEWPORT_ROWS * ROW_HEIGHT, overflowY: 'auto', position: 'relative' }}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          setScrollTop(top);
          const atEnd = top + e.currentTarget.clientHeight >= lines.length * ROW_HEIGHT - ROW_HEIGHT;
          if (!atEnd && follow) setFollow(false);
        }}
      >
        <div style={{ height: lines.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((line, i) => (
            <div
              key={line.seq}
              data-seq={line.seq}
              className={`run-log-line run-log-${line.kind}${matchSet.has(line.seq) ? ' run-log-match' : ''}`}
              aria-current={matches?.[current] === line.seq ? 'true' : undefined}
              style={{ position: 'absolute', top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0 }}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
