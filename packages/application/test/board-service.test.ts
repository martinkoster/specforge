// SPDX-License-Identifier: Apache-2.0
import type { BoardStatus, ExecSubState, StoryCommand, StoryDependency } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { BoardService, type BoardIndex, type BoardStoryRow } from '../src/index.js';

function setup(rows: BoardStoryRow[], dependencies: StoryDependency[] = [], aiDisabledReason: () => string | null = () => null) {
  const stories = new Map(rows.map((r) => [r.storyId, { ...r }]));
  const files = new Map(
    rows.map((r) => [`spec/04_user_stories/${r.storyId}.md`, `---\nid: ${r.storyId}\nstatus: ${r.status}\n# keep\n---\nBody\n`]),
  );
  const index: BoardIndex = {
    stories: () => [...stories.values()],
    storyPath: (_p, id) => (stories.has(id) ? `spec/04_user_stories/${id}.md` : undefined),
    setSubState: (_p, id, sub) => void (stories.get(id)!.subState = sub),
    setOrder: (_p, id, order) => void (stories.get(id)!.order = order),
    setAuthorisedAt: (_p, id, at) => void (stories.get(id)!.authorisedAt = at),
    dependencies: () => dependencies,
  };
  const transitions: Array<[string, StoryCommand]> = [];
  const service = new BoardService({
    index,
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h-${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content) => {
        files.set(path, content);
        return 'new-hash';
      },
    }),
    reindex: async (_p, path) => {
      const id = /US-\d+/.exec(path)![0];
      stories.get(id)!.status = /status: (\w+)/.exec(files.get(path)!)![1] as BoardStatus;
    },
    now: () => '2026-10-15T12:00:00.000Z',
    queueOrder: () => ['US-002'],
    slots: () => ({ active: 1, limit: 3 }),
    onTransition: (_p, storyId, command) => void transitions.push([storyId, command]),
    aiDisabledReason,
  });
  return { service, stories, files, transitions };
}

const story = (storyId: string, status: BoardStatus, overrides: Partial<BoardStoryRow> = {}): BoardStoryRow => ({
  storyId,
  title: `Story ${storyId}`,
  size: 'M',
  approval: 'approved',
  status,
  subState: (status === 'in_progress' ? 'queued' : 'none') as ExecSubState,
  order: null,
  queueReason: null,
  waitingFor: [],
  statusNotice: null,
  authorisedAt: null,
  ...overrides,
});

describe('US-038 AC-1: five columns with cards', () => {
  it('groups cards into Backlog, Ready, In Progress, Review, Done with their indicators', () => {
    const { service } = setup([
      story('US-001', 'done'),
      story('US-002', 'in_progress', { subState: 'queued', queueReason: 'dependency', waitingFor: ['US-001'] }),
      story('US-003', 'backlog', { approval: 'draft', size: null }),
    ]);

    const board = service.board('p1');

    expect(board.columns.map((c) => c.status)).toEqual(['backlog', 'ready', 'in_progress', 'review', 'done']);
    expect(board.columns[2]!.cards).toEqual([
      {
        storyId: 'US-002',
        title: 'Story US-002',
        size: 'M',
        approval: 'approved',
        status: 'in_progress',
        subState: 'queued',
        queueReason: 'dependency',
        waitingFor: ['US-001'],
        statusNotice: null,
        epicId: null,
        dependsOn: [],
        related: [],
      },
    ]);
    expect(board.columns[0]!.cards[0]).toMatchObject({ storyId: 'US-003', approval: 'draft', size: null });
  });
});

describe('US-038 AC-2: moves go through the state machine and write the front-matter', () => {
  it('moving Backlog → Ready writes status, keeps comments and body, and re-indexes', async () => {
    const { service, files, stories, transitions } = setup([story('US-001', 'backlog')]);

    await expect(service.move('p1', 'US-001', 'ready')).resolves.toEqual({ ok: true });

    const written = files.get('spec/04_user_stories/US-001.md')!;
    expect(written).toMatch(/^---\nid: US-001\nstatus: ready\n/);
    expect(written).toContain('# keep');
    expect(written.endsWith('---\nBody\n')).toBe(true);
    expect(stories.get('US-001')!.status).toBe('ready');
    expect(transitions).toEqual([['US-001', 'approveForReady']]);
  });

  it('Ready → In Progress records the authorisation and the queued sub-state before notifying the scheduler', async () => {
    const { service, stories, transitions } = setup([story('US-001', 'ready')]);

    await service.move('p1', 'US-001', 'in_progress');

    expect(stories.get('US-001')).toMatchObject({ status: 'in_progress', subState: 'queued', authorisedAt: '2026-10-15T12:00:00.000Z' });
    expect(transitions).toEqual([['US-001', 'startImplementation']]);
  });

  it('removing a queued story from In Progress returns it to Ready', async () => {
    const { service, stories, transitions } = setup([story('US-001', 'in_progress')]);
    await service.move('p1', 'US-001', 'ready');
    expect(stories.get('US-001')).toMatchObject({ status: 'ready', subState: 'none' });
    expect(transitions).toEqual([['US-001', 'removeFromQueue']]);
  });
});

describe('US-038 AC-4: rejected moves explain why', () => {
  it('an unapproved story cannot move to Ready', async () => {
    const { service, files } = setup([story('US-001', 'backlog', { approval: 'draft' })]);
    const before = files.get('spec/04_user_stories/US-001.md');

    await expect(service.move('p1', 'US-001', 'ready')).resolves.toEqual({
      ok: false,
      reason: 'Approve this story before moving it to Ready.',
    });
    expect(files.get('spec/04_user_stories/US-001.md')).toBe(before);
  });

  it('illegal jumps are refused with a hint; unknown stories are refused', async () => {
    const { service } = setup([story('US-001', 'backlog')]);
    await expect(service.move('p1', 'US-001', 'done')).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Only stories in Review/),
    });
    await expect(service.move('p1', 'US-404', 'ready')).resolves.toEqual({ ok: false, reason: 'Unknown story US-404.' });
  });

  it('moving within the same column is a reorder, not a transition', async () => {
    const { service, transitions } = setup([story('US-001', 'ready'), story('US-002', 'ready')]);
    await expect(service.move('p1', 'US-002', 'ready', 'US-001')).resolves.toEqual({ ok: true });
    expect(transitions).toEqual([]);
    expect(service.board('p1').columns[1]!.cards.map((c) => c.storyId)).toEqual(['US-002', 'US-001']);
  });
});

describe('US-038 AC-3: card order within a column', () => {
  it('orders by stored position, unordered cards last by id; inserting before a card gets a position between neighbours', async () => {
    const { service, stories } = setup([
      story('US-001', 'ready'),
      story('US-002', 'ready'),
      story('US-003', 'ready'),
      story('US-004', 'backlog'),
    ]);

    await service.move('p1', 'US-003', 'ready', 'US-001');
    expect(service.board('p1').columns[1]!.cards.map((c) => c.storyId)).toEqual(['US-003', 'US-001', 'US-002']);

    await service.move('p1', 'US-002', 'ready', 'US-001');
    expect(service.board('p1').columns[1]!.cards.map((c) => c.storyId)).toEqual(['US-003', 'US-002', 'US-001']);

    await service.move('p1', 'US-004', 'ready', 'US-002');
    expect(service.board('p1').columns[1]!.cards.map((c) => c.storyId)).toEqual(['US-003', 'US-004', 'US-002', 'US-001']);

    await service.move('p1', 'US-003', 'ready', null);
    expect(service.board('p1').columns[1]!.cards.map((c) => c.storyId)).toEqual(['US-004', 'US-002', 'US-001', 'US-003']);
    expect(stories.get('US-003')!.order).toEqual(expect.any(Number));
  });
});

describe('US-048 AC-4: system transitions after a run', () => {
  it('completeRun moves a running story to Review, writes the status and clears the sub-state', async () => {
    const { service, stories, files } = setup([story('US-001', 'in_progress', { subState: 'running' })]);

    await expect(service.system('p1', 'US-001', 'completeRun')).resolves.toEqual({ ok: true });

    expect(stories.get('US-001')).toMatchObject({ status: 'review', subState: 'none' });
    expect(files.get('spec/04_user_stories/US-001.md')).toContain('status: review');
  });

  it('refuses system transitions that are not allowed from the current state', async () => {
    const { service } = setup([story('US-001', 'backlog')]);
    await expect(service.system('p1', 'US-001', 'completeRun')).resolves.toMatchObject({ ok: false });
    await expect(service.system('p1', 'US-404', 'completeRun')).resolves.toEqual({ ok: false, reason: 'Unknown story US-404.' });
  });
});

describe('US-041 / US-043: dependency and queue data on the board', () => {
  it('cards carry blocking predecessors and related stories (both directions); the board reports queue order and slots', () => {
    const { service } = setup(
      [story('US-001', 'done'), story('US-002', 'in_progress'), story('US-003', 'backlog')],
      [
        { from: 'US-002', to: 'US-001', type: 'blocking' },
        { from: 'US-003', to: 'US-002', type: 'blocking' },
        { from: 'US-003', to: 'US-001', type: 'related' },
      ],
    );

    const board = service.board('p1');
    const card = (id: string) => board.columns.flatMap((c) => c.cards).find((c) => c.storyId === id)!;

    expect(card('US-002')).toMatchObject({ dependsOn: ['US-001'], related: [] });
    expect(card('US-003')).toMatchObject({ dependsOn: ['US-002'], related: ['US-001'] });
    expect(card('US-001')).toMatchObject({ dependsOn: [], related: ['US-003'] });
    expect(board.queue).toEqual(['US-002']);
    expect(board.slots).toEqual({ active: 1, limit: 3 });
  });
});

describe('US-043 AC-4: Re-check of a blocked (conflict) story', () => {
  it('moves it back to queued and notifies the scheduler', async () => {
    const { service, stories, transitions } = setup([story('US-001', 'in_progress', { subState: 'blocked_conflict' })]);

    await expect(service.recheck('p1', 'US-001')).resolves.toEqual({ ok: true });

    expect(stories.get('US-001')).toMatchObject({ status: 'in_progress', subState: 'queued' });
    expect(transitions).toEqual([['US-001', 'recheckConflict']]);
  });

  it('is refused when the story is not blocked', async () => {
    const { service } = setup([story('US-001', 'ready')]);
    await expect(service.recheck('p1', 'US-001')).resolves.toMatchObject({ ok: false });
  });
});

describe('US-013 AC-2/AC-4: moving to In Progress needs the AI capability', () => {
  it('refuses the move with the reason while AI functions are disabled; other moves still work', async () => {
    let reason: string | null = 'AI functions are disabled: No AI provider is configured. Complete the setup to enable them.';
    const { service, stories, transitions } = setup([story('US-001', 'ready'), story('US-002', 'backlog')], [], () => reason);

    await expect(service.move('p1', 'US-001', 'in_progress')).resolves.toEqual({ ok: false, reason });
    expect(stories.get('US-001')!.status).toBe('ready');
    expect(transitions).toEqual([]);
    await expect(service.move('p1', 'US-002', 'ready')).resolves.toEqual({ ok: true });

    reason = null;
    await expect(service.move('p1', 'US-001', 'in_progress')).resolves.toEqual({ ok: true });
  });
});

describe('US-055 AC-1/AC-3: retry, resume and discard of failed or interrupted runs', () => {
  it('retry and resume put the story back into the queue; discard returns it to Ready', async () => {
    const { service, stories, transitions } = setup([
      story('US-001', 'in_progress', { subState: 'failed' }),
      story('US-002', 'in_progress', { subState: 'interrupted' }),
      story('US-003', 'in_progress', { subState: 'failed' }),
    ]);

    await expect(service.runAction('p1', 'US-001', 'retry')).resolves.toEqual({ ok: true });
    await expect(service.runAction('p1', 'US-002', 'resume')).resolves.toEqual({ ok: true });
    await expect(service.runAction('p1', 'US-003', 'discard')).resolves.toEqual({ ok: true });

    expect(stories.get('US-001')).toMatchObject({ status: 'in_progress', subState: 'queued' });
    expect(stories.get('US-002')).toMatchObject({ status: 'in_progress', subState: 'queued' });
    expect(stories.get('US-003')).toMatchObject({ status: 'ready', subState: 'none' });
    expect(transitions).toEqual([
      ['US-001', 'retryRun'],
      ['US-002', 'resumeRun'],
      ['US-003', 'discardRun'],
    ]);
  });

  it('is refused for stories without a stopped run, and retry/resume need the AI capability', async () => {
    const { service } = setup(
      [story('US-001', 'ready'), story('US-002', 'in_progress', { subState: 'failed' })],
      [],
      () => 'AI functions are disabled.',
    );
    await expect(service.runAction('p1', 'US-001', 'retry')).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not allowed/),
    });
    await expect(service.runAction('p1', 'US-404', 'retry')).resolves.toEqual({ ok: false, reason: 'Unknown story US-404.' });
    await expect(service.runAction('p1', 'US-002', 'retry')).resolves.toEqual({ ok: false, reason: 'AI functions are disabled.' });
    await expect(service.runAction('p1', 'US-002', 'discard')).resolves.toEqual({ ok: true });
  });
});

describe('US-039 AC-1/AC-4: epic lanes', () => {
  it('builds one lane per epic in lane order plus No epic, with derived status, progress and colour; cards carry their epic', () => {
    const rows = [
      story('US-001', 'done', { epicId: 'EP-001', size: 'S' }),
      story('US-002', 'in_progress', { epicId: 'EP-001', size: 'L', subState: 'running' }),
      story('US-003', 'backlog', { epicId: 'EP-002' }),
      story('US-004', 'ready', { epicId: null }),
    ];
    const { service } = setup(rows);
    const withEpics = new BoardService({
      ...(service as unknown as { deps: ConstructorParameters<typeof BoardService>[0] }).deps,
      epics: () => [
        { id: 'EP-002', title: 'Profile', laneOrder: 0, reviewOutcome: null },
        { id: 'EP-001', title: 'Login', laneOrder: 1, reviewOutcome: null },
      ],
      merged: () => false,
    });

    const board = withEpics.board('p1');
    expect(board.lanes).toEqual([
      {
        epicId: 'EP-002',
        title: 'Profile',
        status: 'not_started',
        progress: { done: 0, total: 1, doneWeight: 0, totalWeight: 3 },
        colour: 1,
      },
      {
        epicId: 'EP-001',
        title: 'Login',
        status: 'in_progress',
        progress: { done: 1, total: 2, doneWeight: 2, totalWeight: 7 },
        colour: 0,
      },
      {
        epicId: null,
        title: 'No epic',
        status: 'not_started',
        progress: { done: 0, total: 1, doneWeight: 0, totalWeight: 3 },
        colour: null,
      },
    ]);
    expect(board.columns.flatMap((c) => c.cards).map((c) => [c.storyId, c.epicId])).toEqual([
      ['US-003', 'EP-002'],
      ['US-004', null],
      ['US-002', 'EP-001'],
      ['US-001', 'EP-001'],
    ]);
  });

  it('has no lanes without epics', () => {
    expect(setup([story('US-001', 'ready')]).service.board('p1').lanes).toEqual([]);
  });
});

describe('US-065 AC-3 / US-038: moves of one project are serialised', () => {
  it('a repeated move that arrives while the first is being written starts the story only once', async () => {
    const { service, stories, transitions } = setup([story('US-001', 'ready')]);
    const [first, second] = await Promise.all([service.move('p1', 'US-001', 'in_progress'), service.move('p1', 'US-001', 'in_progress')]);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(transitions).toEqual([['US-001', 'startImplementation']]);
    expect(stories.get('US-001')).toMatchObject({ status: 'in_progress', subState: 'queued' });
  });
});
