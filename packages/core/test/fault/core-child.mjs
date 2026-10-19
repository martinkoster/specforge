// SPDX-License-Identifier: Apache-2.0
// US-064 fault-injection child: the real core (createCore) saves artifacts over IPC while an agent run streams output
// that the core persists in batches, until the process is killed. Completed saves and emitted events go to stdout.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { MessageChannel } from 'node:worker_threads';
import { MockAdapter } from '@specforge/agent-mock';
import { createCore } from '@specforge/core';
import { connectClient, serveContract } from '@specforge/ipc-contract';

const [, , appDataDir, workspaceParent, cycle] = process.argv;
const log = (line) => appendFileSync(1, `${line}\n`);
const wrap = (port) => ({ postMessage: (m) => port.postMessage(m), onMessage: (l) => port.on('message', l) });
/** An artifact version: a header, ~200 KB of filler and a trailer that must match the header (detects partial writes). */
const version = (n) => `---\nkind: requirements\nversion: ${n}\n---\n${'x'.repeat(200_000)}\nEND ${n}\n`;

// An endless answer: one output line every 2 ms.
const streaming = Array.from({ length: 200_000 }, (_, i) => [
  { type: 'output', text: `line ${i}` },
  { type: 'delay', ms: 2 },
]).flat();
const core = await createCore({
  appDataDir,
  platform: process.platform,
  pid: process.pid,
  testMode: false,
  exit: () => undefined,
  watch: false,
  agentAdapter: new MockAdapter({ script: () => streaming }),
});
const { port1, port2 } = new MessageChannel();
const server = serveContract(wrap(port2), core.handlers);
core.setEmitter((name, payload) => {
  if (name === 'run.output') log(`event ${payload.runId} ${payload.seq} ${Date.now()}`);
  server.emit(name, payload);
});
const client = await connectClient(wrap(port1));

// One project for all cycles (non-git: saves go straight to the workspace).
const idFile = join(appDataDir, 'fault-project-id');
let projectId;
if (existsSync(idFile)) {
  projectId = readFileSync(idFile, 'utf8');
} else {
  const project = await client.command('projects.create', { name: 'Crash', parentDir: workspaceParent, folderName: 'crash', initGit: false });
  projectId = project.id;
  // The artifacts the harness saves; indexed when the project is opened.
  for (let i = 0; i < 5; i++) writeFileSync(join(project.path, 'spec', '02_requirements', `file-${i}.md`), version('initial'));
  writeFileSync(idFile, projectId);
}
await client.command('projects.openById', { projectId });

const thread = await client.command('chat.createThread', { projectId, title: `Cycle ${cycle}` });
const started = await client.command('chat.send', { threadId: thread.id, text: 'Explain the project.' });
if (!started.ok) throw new Error(started.reason);
log(`ready ${started.runId}`);

for (let op = 1; ; op++) {
  const path = `spec/02_requirements/file-${op % 5}.md`;
  const current = await client.query('artifact.read', { projectId, path });
  const saved = await client.command('artifact.save', { projectId, path, content: version(`${cycle}-${op}`), expectedHash: current.hash });
  if (saved.ok) log(`saved ${path}`);
  await sleep(5);
}
