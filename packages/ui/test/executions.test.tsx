// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { ExecutionsArea, formatElapsed, type RunRow } from '../src/executions/ExecutionsArea.js';
import { formatEvent, mergeLines } from '../src/executions/RunLog.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const NOW = Date.parse('2026-10-16T10:05:30.000Z');

const row = (over: Partial<RunRow>): RunRow => ({
  runId: 'r1',
  storyId: 'US-001',
  title: 'Login',
  kind: 'implement',
  status: 'running',
  queuedAt: null,
  startedAt: '2026-10-16T10:00:00.000Z',
  endedAt: null,
  touchedFiles: 0,
  pendingPrompts: 0,
  ...over,
});

const ROWS: RunRow[] = [
  row({ runId: 'r1', storyId: 'US-001', title: 'Login', status: 'running', touchedFiles: 3, pendingPrompts: 2 }),
  row({ runId: 'r2', storyId: 'US-002', title: 'Logout', status: 'awaiting_approval' }),
  row({ runId: null, storyId: 'US-003', title: 'Profile', status: 'queued', startedAt: null }),
  row({ runId: 'r0', storyId: 'US-000', title: 'Setup', status: 'completed', endedAt: '2026-10-16T10:01:05.000Z', touchedFiles: 5 }),
];

async function renderArea(handlers: ContractHandlers = {}) {
  const core = await fakeCoreWithEvents({
    'runs.overview': async () => ROWS,
    'runs.events': async () => [],
    ...handlers,
  });
  render(<ExecutionsArea session={core.session} projectId="p1" now={() => NOW} />);
  await screen.findByRole('table', { name: 'Runs' });
  return core;
}

describe('US-054 AC-1: run list', () => {
  it('shows story, status chip, elapsed time, files touched and pending prompts in the core order (running first)', async () => {
    await renderArea();

    const rows = within(screen.getByRole('table', { name: 'Runs' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      'US-001 — Login',
      'US-002 — Logout',
      'US-003 — Profile',
      'US-000 — Setup',
    ]);
    expect(
      within(rows[0]!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['US-001 — Login', 'Running', '5:30', '3', '2', 'Cancel US-001']);
    expect(within(rows[2]!).getAllByRole('cell')[1]!.textContent).toBe('Queued');
    expect(within(rows[2]!).getAllByRole('cell')[2]!.textContent).toBe('—');
    expect(within(rows[3]!).getAllByRole('cell')[2]!.textContent).toBe('1:05');
  });

  it('formats elapsed times', () => {
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('shows an empty state without runs', async () => {
    const core = await fakeCoreWithEvents({ 'runs.overview': async () => [] });
    render(<ExecutionsArea session={core.session} projectId="p1" />);
    expect(await screen.findByText(/No runs yet/)).toBeInTheDocument();
  });
});

describe('US-054 AC-2: live stream and tiles', () => {
  it('selecting a run shows its stored events, then live output as it is emitted', async () => {
    const { server } = await renderArea({
      'runs.events': async ({ runId, afterSeq }) =>
        runId === 'r1' && (afterSeq ?? 0) === 0
          ? [
              { seq: 1, ts: 't', type: 'output', payload: { type: 'output', text: 'Reading spec' } },
              { seq: 2, ts: 't', type: 'tool_use', payload: { type: 'tool_use', toolName: 'Bash', input: { command: 'npm test' } } },
            ]
          : [],
    });

    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));
    const log = await screen.findByRole('log');
    expect(await within(log).findByText('Reading spec')).toBeInTheDocument();
    expect(within(log).getByText('▶ Bash {"command":"npm test"}')).toBeInTheDocument();

    act(() => server.emit('run.output', { runId: 'r1', seq: 3, text: 'Tests passed' }));
    act(() => server.emit('run.output', { runId: 'r2', seq: 3, text: 'other run' }));
    expect(await within(log).findByText('Tests passed')).toBeInTheDocument();
    expect(within(log).queryByText('other run')).not.toBeInTheDocument();
  });

  it('Tile shows up to three streams side by side', async () => {
    const rows = [1, 2, 3, 4].map((n) => row({ runId: `r${n}`, storyId: `US-00${n}`, title: `Story ${n}` }));
    await renderArea({ 'runs.overview': async () => rows });

    await userEvent.click(screen.getByRole('checkbox', { name: /Tile/ }));
    for (const n of [1, 2, 3, 4]) await userEvent.click(screen.getByRole('button', { name: `US-00${n} — Story ${n}` }));

    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Run US-002', 'Run US-003', 'Run US-004']);
    // Clicking a tiled run again removes it; leaving tile mode keeps the last one.
    await userEvent.click(screen.getByRole('button', { name: 'US-003 — Story 3' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    await userEvent.click(screen.getByRole('checkbox', { name: /Tile/ }));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Run US-004']);
  });

  it('shows the assembled context and the structured result of a run', async () => {
    await renderArea({
      'runs.context': async () => ({ context: '# Story US-001\nLogin' }),
      'runs.result': async () => ({
        result: {
          outcome: 'success',
          summary: 'Implemented login',
          tests: { run: 4, passed: 4, failed: 0 },
          coverage: 91,
          changedFiles: ['src/login.ts'],
          openIssues: ['Rate limiting'],
          recommendations: [],
        },
        unavailableReason: null,
        computedFiles: [{ path: 'src/login.ts', change: 'A', additions: 10, deletions: 0 }],
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Context' }));
    expect(await screen.findByText(/# Story US-001/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Result' }));
    expect(await screen.findByText('Implemented login')).toBeInTheDocument();
    expect(screen.getByText('Tests: 4/4 passed, 0 failed')).toBeInTheDocument();
    expect(screen.getByText('Coverage: 91 %')).toBeInTheDocument();
    expect(screen.getByText('Rate limiting')).toBeInTheDocument();
    expect(screen.getByText('A src/login.ts (+10 −0)')).toBeInTheDocument();
  });

  it('explains a missing context or result', async () => {
    await renderArea({
      'runs.context': async () => ({ context: null }),
      'runs.result': async () => ({ result: null, unavailableReason: 'No result block.', computedFiles: [] }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Context' }));
    expect(await screen.findByText('No context was recorded for this run.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Result' }));
    expect(await screen.findByText('Result unavailable: No result block.')).toBeInTheDocument();
    expect(screen.getByText('No file changes.')).toBeInTheDocument();
  });
});

describe('US-054 AC-3: virtualised log with search', () => {
  const many = Array.from({ length: 10_000 }, (_, i) => ({
    seq: i + 1,
    ts: 't',
    type: 'output',
    payload: { type: 'output', text: i + 1 === 9_500 ? 'needle here' : `line ${i + 1}` },
  }));

  it('renders only the visible rows of a large log, pages through it and jumps to search matches', async () => {
    const search = vi.fn(async () => ({ seqs: [20, 9_500], total: 10_000 }));
    const pages: number[] = [];
    await renderArea({
      'runs.overview': async () => [row({ status: 'completed', endedAt: '2026-10-16T10:01:00.000Z' })],
      'runs.events': async ({ afterSeq, limit }) => {
        pages.push(afterSeq ?? 0);
        return many.filter((e) => e.seq > (afterSeq ?? 0)).slice(0, limit ?? many.length);
      },
      'runs.search': search,
    });
    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));
    const log = await screen.findByRole('log');
    await vi.waitFor(() => expect(log.querySelector('[data-seq="10000"]')).not.toBeNull());

    expect(pages).toEqual([0, 2000, 4000, 6000, 8000, 10_000]);
    expect(log.querySelectorAll('.run-log-line').length).toBeLessThan(100);

    await userEvent.type(screen.getByRole('textbox', { name: 'Search log' }), 'needle');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1', query: 'needle' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(log.querySelector('[data-seq="20"]')?.getAttribute('aria-current')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(within(log).getByText('needle here')).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('reports no matches and clears the search for an empty query', async () => {
    await renderArea({ 'runs.search': async () => ({ seqs: [], total: 0 }) });
    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search log' }), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search log' }));
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.queryByText('No matches')).not.toBeInTheDocument();
  });

  it('merges live output and stored events by sequence number without duplicates', () => {
    const a = [{ seq: 1, kind: 'output', text: 'a' }];
    expect(mergeLines(a, [])).toBe(a);
    expect(mergeLines(a, [{ seq: 2, kind: 'output', text: 'b' }]).map((l) => l.seq)).toEqual([1, 2]);
    const live = [...a, { seq: 4, kind: 'output', text: 'd' }];
    expect(
      mergeLines(live, [
        { seq: 3, kind: 'tool_use', text: 'c' },
        { seq: 4, kind: 'output', text: 'd' },
      ]).map((l) => l.seq),
    ).toEqual([1, 3, 4]);
  });

  it('formats every event type as one line', () => {
    expect(formatEvent('tool_result', { isError: true })).toBe('✗ tool failed');
    expect(formatEvent('tool_result', { isError: false })).toBe('✓ tool finished');
    expect(formatEvent('error', { message: 'boom' })).toBe('Error: boom');
    expect(formatEvent('session', { sessionId: 's1' })).toBe('Session s1');
    expect(formatEvent('usage', { usage: { inputTokens: 1 } })).toBe('Usage {"inputTokens":1}');
    expect(formatEvent('other', null)).toBe('other');
  });
});

describe('US-054 AC-4: cancel per run', () => {
  it('cancels an individual active run; finished and queued rows have no cancel action', async () => {
    const cancel = vi.fn(async () => ({ ok: true as const }));
    await renderArea({ 'runs.cancel': cancel });

    expect(screen.getAllByRole('button', { name: /^Cancel/ }).map((b) => b.textContent)).toEqual(['Cancel US-001', 'Cancel US-002']);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel US-002' }));
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r2' }));
  });

  it('shows why a cancel was refused', async () => {
    await renderArea({ 'runs.cancel': async () => ({ ok: false as const, reason: 'Run r1 is not active.' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel US-001' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Run r1 is not active.');
  });
});

describe('US-034 AC-1: trace of a run in the executions view', () => {
  it('the Trace tab shows the run with its story and changed files', async () => {
    await renderArea({
      'trace.get': async ({ target }) => ({
        node: { kind: 'run', id: target.id, label: 'Run r1', exists: true },
        upstream: [{ kind: 'story', id: 'US-001', label: 'US-001: Login', path: 'spec/04_user_stories/US-001.md', exists: true }],
        downstream: [{ kind: 'file', id: 'src/login.ts', label: 'src/login.ts', runId: 'r1', exists: true }],
        issues: [],
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'US-001 — Login' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Trace' }));
    const trace = await screen.findByRole('region', { name: 'Trace' });
    expect(await within(trace).findByRole('button', { name: 'US-001: Login' })).toBeInTheDocument();
    expect(within(trace).getByText('src/login.ts')).toBeInTheDocument();
  });
});
