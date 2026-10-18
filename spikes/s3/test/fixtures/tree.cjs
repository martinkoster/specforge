// SPDX-License-Identifier: Apache-2.0
// Fixture: builds a process tree parent -> (node child -> node grandchild, shell child) and writes all pids to argv[2].
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const out = process.argv[2];
const role = process.argv[3] || 'parent';
const forever = () => setInterval(() => {}, 1000);
if (process.argv.includes('--ignore-sigterm')) process.on('SIGTERM', () => {});
if (role === 'grandchild') { forever(); }
else if (role === 'child') {
  const g = spawn(process.execPath, [__filename, out + '.g', 'grandchild', ...process.argv.slice(4)], { stdio: 'ignore' });
  writeFileSync(out + '.c', JSON.stringify({ child: process.pid, grandchild: g.pid }));
  forever();
} else {
  const c = spawn(process.execPath, [__filename, out, 'child', ...process.argv.slice(4)], { stdio: 'ignore' });
  const shell = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'ping -n 120 127.0.0.1 > NUL'], { stdio: 'ignore' })
    : spawn('sh', ['-c', 'sleep 120'], { stdio: 'ignore' });
  writeFileSync(out, JSON.stringify({ parent: process.pid, child: c.pid, shell: shell.pid }));
  forever();
}
