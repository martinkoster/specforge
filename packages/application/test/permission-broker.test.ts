// SPDX-License-Identifier: Apache-2.0
import type { EffectiveRule } from '@specforge/domain';
import { describe, expect, it } from 'vitest';
import { PermissionBroker, type PermissionRecord, type PermissionRunContext, type PermissionStore } from '../src/index.js';

const allowRead: EffectiveRule = {
  rule: { id: 'r-read', scope: 'global', effect: 'allow', toolName: 'Read', appliesTo: 'all', createdFrom: 'setup' },
  origin: 'global',
  disabled: false,
};
const denyPublish: EffectiveRule = {
  rule: {
    id: 'r-pub',
    scope: 'project',
    projectId: 'p1',
    effect: 'deny',
    toolName: 'Bash',
    pattern: 'npm publish',
    appliesTo: 'all',
    createdFrom: 'settings',
  },
  origin: 'project',
  disabled: false,
};

function setup(rules: EffectiveRule[] = [allowRead, denyPublish]) {
  const records = new Map<string, PermissionRecord>();
  const store: PermissionStore = {
    insert: (r) => void records.set(r.id, { ...r }),
    decide: (id, d) => {
      const r = records.get(id)!;
      if (r.decision !== null) throw new Error('immutable');
      records.set(id, { ...r, ...d });
    },
  };
  const statuses: string[] = [];
  const events: string[] = [];
  let n = 0;
  const broker = new PermissionBroker({
    store,
    rules: () => rules,
    runs: { setAwaitingPermission: (runId, waiting) => statuses.push(`${runId}:${waiting ? 'awaiting' : 'running'}`) },
    now: () => '2026-10-15T12:00:00.000Z',
    newId: () => `req-${++n}`,
    onRequested: (p) => events.push(`requested ${p.id}`),
    onDecided: (id, decision) => events.push(`decided ${id} ${decision}`),
  });
  return { broker, records, statuses, events };
}

const run = (overrides: Partial<PermissionRunContext> = {}): PermissionRunContext => ({
  runId: 'run-1',
  projectId: 'p1',
  runKind: 'implement',
  workspaceRoot: '/wt/US-001',
  nonGit: false,
  implementationActive: () => false,
  ...overrides,
});

const ask = (toolName: string, input: Record<string, unknown>, cwd = '/wt/US-001') => ({ toolUseId: 't1', toolName, input, cwd });

describe('US-052 AC-1: decision order', () => {
  it('built-in denies win over allow rules', async () => {
    const { broker, records } = setup([
      {
        rule: { id: 'r-all', scope: 'global', effect: 'allow', toolName: 'Edit', appliesTo: 'all', createdFrom: 'setup' },
        origin: 'global',
        disabled: false,
      },
    ]);

    const answer = await broker.ask(run(), ask('Edit', { file_path: '/wt/US-001/spec/02_requirements/fr.md', new_string: 'x' }));

    expect(answer).toEqual({ behavior: 'deny', message: expect.stringMatching(/may not change specifications/) });
    expect([...records.values()][0]).toMatchObject({ decision: 'deny', decidedBy: 'built_in', outsideWorkspace: false });
  });

  it('actions outside the workspace are relayed even if a rule would allow them', async () => {
    const { broker, records } = setup();

    void broker.ask(run(), ask('Read', { file_path: '/etc/passwd' }));
    await Promise.resolve();

    expect(broker.pending()).toMatchObject([{ toolName: 'Read', outsideWorkspace: true, runId: 'run-1' }]);
    expect([...records.values()][0]).toMatchObject({ decision: null, outsideWorkspace: true });
  });

  it('relative paths are resolved against the cwd; ../ escaping the workspace counts as outside', async () => {
    const { broker } = setup();
    await expect(broker.ask(run(), ask('Read', { file_path: 'src/index.ts' }))).resolves.toEqual({ behavior: 'allow' });
    void broker.ask(run(), ask('Read', { file_path: '../other/secret.txt' }));
    await Promise.resolve();
    expect(broker.pending()).toHaveLength(1);
  });

  it('then applies effective rules by run kind and logs the deciding rule', async () => {
    const { broker, records } = setup();

    await expect(broker.ask(run(), ask('Read', { file_path: '/wt/US-001/src/a.ts' }))).resolves.toEqual({ behavior: 'allow' });
    await expect(broker.ask(run(), ask('Bash', { command: 'npm publish --tag next' }))).resolves.toEqual({
      behavior: 'deny',
      message: expect.stringMatching(/Denied by a project rule/),
    });

    expect([...records.values()].map((r) => r.decidedBy)).toEqual(['rule:r-read', 'rule:r-pub']);
  });

  it('connection tests deny every tool', async () => {
    const { broker } = setup();
    await expect(broker.ask(run({ runKind: 'connection_test' }), ask('Read', { file_path: 'a' }))).resolves.toMatchObject({
      behavior: 'deny',
    });
  });
});

describe('US-052 AC-2: relay pauses only its run, without timeout', () => {
  it('marks the run awaiting permission and resumes it when the user decides', async () => {
    const { broker, statuses, events, records } = setup();

    const answer = broker.ask(run(), ask('Bash', { command: 'npm test' }));
    await Promise.resolve();
    expect(statuses).toEqual(['run-1:awaiting']);
    const [pending] = broker.pending();

    broker.decide(pending!.id, 'allow');

    await expect(answer).resolves.toEqual({ behavior: 'allow' });
    expect(statuses).toEqual(['run-1:awaiting', 'run-1:running']);
    expect(events).toEqual(['requested req-1', 'decided req-1 allow']);
    expect(records.get('req-1')).toMatchObject({ decision: 'allow', decidedBy: 'user', decidedAt: '2026-10-15T12:00:00.000Z' });
  });

  it('a user denial carries the message back to the agent', async () => {
    const { broker } = setup();
    const answer = broker.ask(run(), ask('Bash', { command: 'rm -rf build' }));
    await Promise.resolve();

    broker.decide(broker.pending()[0]!.id, 'deny', 'Not now');

    await expect(answer).resolves.toEqual({ behavior: 'deny', message: 'Not now' });
  });

  it('other runs keep running while one waits', async () => {
    const { broker, statuses } = setup();
    void broker.ask(run(), ask('Bash', { command: 'npm test' }));
    await Promise.resolve();

    await expect(
      broker.ask(run({ runId: 'run-2', workspaceRoot: '/wt/US-002' }), ask('Read', { file_path: 'x.ts' }, '/wt/US-002')),
    ).resolves.toEqual({ behavior: 'allow' });
    expect(statuses).toEqual(['run-1:awaiting']);
  });

  it('dismissal, run cancellation and shutdown deny pending requests (default_deny)', async () => {
    const { broker, records } = setup();
    const a = broker.ask(run(), ask('Bash', { command: 'a' }));
    const b = broker.ask(run({ runId: 'run-2' }), ask('Bash', { command: 'b' }, '/wt/US-001'));
    const c = broker.ask(run({ runId: 'run-3' }), ask('Bash', { command: 'c' }, '/wt/US-001'));
    await Promise.resolve();

    broker.dismiss(broker.pending()[0]!.id);
    broker.cancelRun('run-2');
    broker.shutdown();

    await expect(a).resolves.toMatchObject({ behavior: 'deny' });
    await expect(b).resolves.toMatchObject({ behavior: 'deny' });
    await expect(c).resolves.toMatchObject({ behavior: 'deny' });
    expect([...records.values()].map((r) => r.decidedBy)).toEqual(['default_deny', 'default_deny', 'default_deny']);
    expect(broker.pending()).toEqual([]);
  });

  it('refuses to decide an unknown or already decided request', async () => {
    const { broker } = setup();
    expect(() => broker.decide('nope', 'allow')).toThrow(/No pending permission request/);
  });
});

describe('US-052 AC-3: every request and decision is stored', () => {
  it('records tool, redacted input, cwd and time for automatic and relayed decisions', async () => {
    const { broker, records } = setup();

    await broker.ask(run(), ask('Read', { file_path: 'a.ts' }));

    expect([...records.values()][0]).toEqual({
      id: 'req-1',
      runId: 'run-1',
      toolName: 'Read',
      input: { file_path: 'a.ts' },
      cwd: '/wt/US-001',
      outsideWorkspace: false,
      requestedAt: '2026-10-15T12:00:00.000Z',
      decision: 'allow',
      decidedBy: 'rule:r-read',
      decidedAt: '2026-10-15T12:00:00.000Z',
      message: null,
    });
  });
});

describe('US-052 AC-4: chat runs', () => {
  it('denies writes in chat runs with an explanation', async () => {
    const { broker } = setup();
    await expect(
      broker.ask(run({ runKind: 'chat', workspaceRoot: '/ws' }), ask('Write', { file_path: '/ws/a.md', content: 'x' }, '/ws')),
    ).resolves.toEqual({
      behavior: 'deny',
      message: expect.stringMatching(/chat is read-only/),
    });
  });
});

describe('FR-116b: non-git workspace writers', () => {
  it('denies spec-run writes while an implementation run is active in the shared workspace', async () => {
    const { broker } = setup();
    const spec = run({ runKind: 'generate', workspaceRoot: '/ws', nonGit: true, implementationActive: () => true });

    await expect(
      broker.ask(spec, ask('Write', { file_path: '/ws/spec/02_requirements/fr.md', content: 'x' }, '/ws')),
    ).resolves.toMatchObject({
      behavior: 'deny',
      message: expect.stringMatching(/shared workspace/),
    });
  });
});
