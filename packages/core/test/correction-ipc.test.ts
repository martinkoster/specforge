// SPDX-License-Identifier: Apache-2.0
// US-059 integration: request corrections → the story re-enters In Progress; the agent resumes its session in the same
// worktree and the story returns to Review with the updated diff; without a resumable session a fresh run on the same
// branch gets the feedback and the previous summary.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { AgentCapabilities, RunRequest } from '@specforge/application';
import { connectClient, serveContract, type ContractClient, type PortLike } from '@specforge/ipc-contract';
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

const result = (summary: string) => `Done.\n\`\`\`specforge-result\n${JSON.stringify({ outcome: 'success', summary })}\n\`\`\`\n`;

/** First run writes v1; a correction run writes v2. */
function script(requests: RunRequest[]) {
  return (request: RunRequest): MockStep[] => {
    requests.push(request);
    const version = request.kind === 'correct' ? 'v2' : 'v1';
    return [
      { type: 'tool', toolName: 'Write', input: { file_path: 'src/app.ts', content: `${version}\n` } },
      { type: 'result', text: result(version === 'v1' ? 'First version of the app.' : 'Sender fixed.') },
    ];
  };
}

class NoResumeAdapter extends MockAdapter {
  override capabilities(): AgentCapabilities {
    return { ...super.capabilities(), resume: false };
  }
}

async function boot(adapter: (requests: RunRequest[]) => MockAdapter) {
  const requests: RunRequest[] = [];
  const core = await createCore({
    appDataDir: mkdtempSync(join(tmpdir(), 'sf-correct-app-')),
    platform: process.platform,
    pid: process.pid,
    testMode: false,
    exit: () => undefined,
    watch: false,
    agentAdapter: adapter(requests),
  });
  open.push(core);
  const { port1, port2 } = new MessageChannel();
  const server = serveContract(wrap(port2), core.handlers);
  core.setEmitter((name, payload) => server.emit(name, payload as never));
  const client: ContractClient = await connectClient(wrap(port1));
  client.subscribe(
    'permission.requested',
    (e) => void client.command('permission.decide', { id: e.id, decision: 'allow' }).catch(() => undefined),
  );
  const project = await client.command('projects.create', {
    name: 'C',
    parentDir: mkdtempSync(join(tmpdir(), 'sf-correct-ws-')),
    folderName: 'c',
    initGit: true,
  });
  writeFileSync(
    join(project.path, 'spec', '04_user_stories', 'US-001.md'),
    '---\nkind: story\nid: US-001\ntitle: Welcome mail\napproval: approved\nstatus: ready\n---\n',
  );
  await client.command('projects.openById', { projectId: project.id });
  const projectId = project.id;
  await client.command('board.move', { projectId, storyId: 'US-001', to: 'in_progress', beforeStoryId: null });
  await inReview(client, projectId, 1);
  return { client, projectId, requests };
}

async function inReview(client: ContractClient, projectId: string, runs: number) {
  await vi.waitFor(
    async () => {
      const card = (await client.query('board.get', { projectId })).columns.flatMap((c) => c.cards).find((c) => c.storyId === 'US-001');
      expect(card?.status).toBe('review');
      expect((await client.query('runs.list', { projectId })).filter((r) => r.status === 'completed')).toHaveLength(runs);
    },
    { timeout: 60_000 },
  );
}

async function changedApp(client: ContractClient, projectId: string): Promise<string | null> {
  const [last] = (await client.query('runs.list', { projectId })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (await client.query('review.fileVersions', { projectId, runId: last!.id, path: 'src/app.ts' })).after;
}

describe('US-059 over IPC', () => {
  it('AC-1/AC-2: corrections resume the agent session in the same worktree; the story returns to Review with the updated diff', async () => {
    const { client, projectId, requests } = await boot((requests) => new MockAdapter({ script: script(requests) }));
    expect(await client.query('review.correctionOptions', { projectId, storyId: 'US-001' })).toEqual({ resumable: true, reason: null });

    await expect(
      client.command('review.requestCorrections', { projectId, storyId: 'US-001', feedback: 'The sender is wrong.' }),
    ).resolves.toEqual({ ok: true });
    await inReview(client, projectId, 2);

    const [first, correction] = requests;
    expect(correction).toMatchObject({ kind: 'correct', cwd: first!.cwd, resumeSessionId: expect.any(String) });
    expect(correction!.prompt).toContain('## Review feedback\nThe sender is wrong.');
    expect(await changedApp(client, projectId)).toBe('v2\n');
  });

  it('AC-3: without a resumable session a fresh run on the same branch is offered, with feedback and previous summary', async () => {
    const { client, projectId, requests } = await boot((requests) => new NoResumeAdapter({ script: script(requests) }));
    expect(await client.query('review.correctionOptions', { projectId, storyId: 'US-001' })).toEqual({
      resumable: false,
      reason: 'The agent cannot resume sessions.',
    });
    await expect(client.command('review.requestCorrections', { projectId, storyId: 'US-001', feedback: 'Fix it.' })).resolves.toEqual({
      ok: false,
      reason: 'The agent session cannot be resumed (The agent cannot resume sessions.). Start a fresh run on the same branch instead.',
    });

    await expect(
      client.command('review.requestCorrections', { projectId, storyId: 'US-001', feedback: 'Fix it.', fresh: true }),
    ).resolves.toEqual({ ok: true });
    await inReview(client, projectId, 2);

    const [first, correction] = requests;
    expect(correction).toMatchObject({ kind: 'correct', cwd: first!.cwd });
    expect(correction!.resumeSessionId).toBeUndefined();
    expect(correction!.prompt).toContain('## Review feedback\nFix it.');
    expect(correction!.prompt).toContain('## Summary of the previous run\nFirst version of the app.');
    expect(await changedApp(client, projectId)).toBe('v2\n');
  });

  it('refuses corrections for stories that are not in Review and empty feedback', async () => {
    const { client, projectId } = await boot((requests) => new MockAdapter({ script: script(requests) }));
    await client.command('review.approve', { projectId, storyId: 'US-001' });
    expect(await client.command('review.requestCorrections', { projectId, storyId: 'US-001', feedback: 'Late.' })).toMatchObject({
      ok: false,
    });
    await expect(client.command('review.requestCorrections', { projectId, storyId: 'US-001', feedback: ' ' })).rejects.toThrow();
  });
});
