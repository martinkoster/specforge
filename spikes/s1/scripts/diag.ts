// SPDX-License-Identifier: Apache-2.0
// Diagnostics for spike S1: prints all events of one scenario. Usage: npx tsx scripts/diag.ts <ac3|ac5> [sources]
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionBroker } from '../src/broker.js';
import { findClaudeOnPath, resolveClaudeExecutable } from '../src/executable.js';
import { listDescendants } from '../src/processTree.js';
import { startRun } from '../src/runner.js';

const [scenario = 'ac5', sourcesArg = '[]'] = process.argv.slice(2);
const sources = sourcesArg === 'default' ? undefined : (JSON.parse(sourcesArg) as never);
const cwd = mkdtempSync(join(tmpdir(), 's1-diag-'));
const broker = new DecisionBroker();
broker.onRequest((r) => {
  console.log('PERMISSION', r.toolName, JSON.stringify(r.input).slice(0, 200));
  broker.decide(r.id, scenario === 'ac5' ? { behavior: 'deny', message: 'denied (diag)' } : { behavior: 'allow' });
});
let prompt = 'Please create a file named notes.txt containing the line "Team meeting moved to 10:00." If you are not permitted to write it, tell me and stop.';
if (scenario === 'ac5') {
  mkdirSync(join(cwd, '.claude'));
  writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Write', 'Edit', 'Bash'] } }));
} else {
  prompt = 'Use the Bash tool to run exactly this command in the foreground and wait for it to finish: node -e "setTimeout(() => {}, 180000)"';
}
const run = startRun({ prompt, cwd, executable: resolveClaudeExecutable(findClaudeOnPath()), broker, settingSources: sources, maxTurns: 6 });
const timer = setInterval(async () => {
  const t0 = Date.now();
  const tree = await listDescendants(process.pid);
  console.log(`TREE (${Date.now() - t0} ms)`, tree.map((p) => `${p.name}:${p.pid}<${p.ppid}`).join(' '));
  if (scenario === 'ac3' && tree.some((p) => /node/i.test(p.name) && tree.some((q) => q.pid === p.ppid))) {
    console.log('ABORTING');
    run.abort();
  }
}, 5000);
const origPush = run.events.push.bind(run.events);
run.events.push = (...e) => { for (const x of e) console.log('EVENT', JSON.stringify(x).slice(0, 300)); return origPush(...e); };
try { console.log('RESULT', JSON.stringify(await run.done)); } catch (e) { console.log('ERROR', (e as Error).message); }
clearInterval(timer);
await new Promise((r) => setTimeout(r, 3000));
console.log('TREE AFTER', (await listDescendants(process.pid)).map((p) => `${p.name}:${p.pid}`).join(' ') || '(none)');
process.exit(0);
