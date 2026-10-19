// SPDX-License-Identifier: Apache-2.0
// US-036 integration: story generation for an epic writes new Backlog stories (status: backlog is allowed for new story
// files only), validated dependencies, and the stories appear in Backlog in their epic.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { RunRequest } from '@specforge/application';
import { connectClient, serveContract, type PortLike } from '@specforge/ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/index.js';

vi.setConfig({ testTimeout: 120_000 });

const open: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  for (const o of open.splice(0).reverse()) await o.close();
});

const wrap = (port: MessagePort): PortLike => {
  open.push(port);
  return { postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) };
};

describe('US-036 over IPC', () => {
  it('AC-1..AC-3: new Backlog stories in the epic; an existing story status cannot be changed', async () => {
    const prompts: string[] = [];
    const script = (request: RunRequest): MockStep[] => {
      prompts.push(request.prompt);
      return [
        {
          type: 'tool',
          toolName: 'Write',
          input: {
            file_path: 'spec/04_user_stories/US-002-logout.md',
            content:
              '---\nkind: story\nid: US-002\ntitle: Logout\nstatus: backlog\napproval: draft\nepic: EP-001\nrequirements: [FR-001]\ndepends_on:\n  - id: US-001\n    rationale: Logout needs a logged-in user.\n---\n## Description\nAs a user I want to log out.\n## Acceptance criteria\n- [ ] Logout ends the session.\n',
          },
        },
        // Changing the status of the existing story is denied (agents only recommend transitions).
        {
          type: 'tool',
          toolName: 'Write',
          input: {
            file_path: 'spec/04_user_stories/US-001.md',
            content: '---\nkind: story\nid: US-001\ntitle: Login\nstatus: done\n---\n',
          },
        },
        { type: 'result', text: 'Generated.' },
      ];
    };
    const core = await createCore({
      appDataDir: mkdtempSync(join(tmpdir(), 'sf-storygen-app-')),
      platform: process.platform,
      pid: process.pid,
      testMode: false,
      exit: () => undefined,
      watch: false,
      agentAdapter: new MockAdapter({ script }),
    });
    open.push(core);
    const { port1, port2 } = new MessageChannel();
    const server = serveContract(wrap(port2), core.handlers);
    core.setEmitter((name, payload) => server.emit(name, payload as never));
    const client = await connectClient(wrap(port1));
    client.subscribe(
      'permission.requested',
      (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
    );

    const project = await client.command('projects.create', {
      name: 'S',
      parentDir: mkdtempSync(join(tmpdir(), 'sf-storygen-ws-')),
      folderName: 's',
      initGit: false,
    });
    const ws = project.path;
    writeFileSync(join(ws, 'spec', '02_requirements', 'fr.md'), '---\nkind: requirements\n---\n### FR-001: Login\n');
    mkdirSync(join(ws, 'spec', '04_user_stories', 'epics'), { recursive: true });
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'epics', 'EP-001-auth.md'),
      // A Done epic (review confirmed): new stories return it to In progress (US-039 AC-4, FR-095).
      '---\nkind: epic\nid: EP-001\ntitle: Auth\napproval: approved\nrequirements: [FR-001]\nepic_review:\n  outcome: confirmed\n---\n',
    );
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'US-001.md'),
      '---\nkind: story\nid: US-001\ntitle: Login\napproval: approved\nstatus: ready\nepic: EP-001\n---\n',
    );
    writeFileSync(
      join(ws, 'spec', '04_user_stories', 'epics', 'EP-002-profile.md'),
      '---\nkind: epic\nid: EP-002\ntitle: Profile\napproval: draft\nrequirements: [FR-001]\n---\n',
    );
    await client.command('projects.openById', { projectId: project.id });

    // AC-1: stories are generated for approved epics only.
    expect(
      await client.command('specs.generate', { projectId: project.id, target: 'stories', instruction: 'Go.', epicIds: ['EP-002'] }),
    ).toEqual({ ok: false, reason: 'Stories are generated for approved epics only: EP-002.' });

    const started = (await client.command('specs.generate', {
      projectId: project.id,
      target: 'stories',
      instruction: 'Generate user stories.',
      epicIds: ['EP-001'],
    })) as {
      runId: string;
    };
    expect(prompts[0]).toContain('Generate stories only for the epics EP-001.');
    const review = await vi.waitFor(
      async () => {
        const r = await client.query('specs.review', { runId: started.runId });
        expect(r?.state).toBe('open');
        return r!;
      },
      { timeout: 30_000 },
    );
    expect(review.files.map((f) => [f.path, f.change])).toEqual([['spec/04_user_stories/US-002-logout.md', 'A']]);
    expect(review.issues).toEqual([]);
    await client.command('specs.keep', { runId: started.runId });

    const backlog = (await client.query('board.get', { projectId: project.id })).columns.find((c) => c.status === 'backlog')!;
    expect(backlog.cards.map((c) => c.storyId)).toEqual(['US-002']);
    expect((await client.query('epics.list', { projectId: project.id })).epics[0]!.stories).toEqual(['US-001', 'US-002']);
    // AC-3: the new story is in the Backlog of its epic lane.
    const board = await client.query('board.get', { projectId: project.id });
    expect(board.lanes?.map((l) => l.epicId)).toEqual(['EP-001', 'EP-002', null]);
    expect(backlog.cards.find((c) => c.storyId === 'US-002')?.epicId).toBe('EP-001');
    await vi.waitFor(() =>
      expect(readFileSync(join(ws, 'spec', '04_user_stories', 'epics', 'EP-001-auth.md'), 'utf8')).not.toContain('epic_review'),
    );
  });
});
