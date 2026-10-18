// SPDX-License-Identifier: Apache-2.0
// Orphan cleanup with identity check (FR-041): a recorded pid is only killed if start time and command line still match,
// so a pid reused by an unrelated process after a crash is never touched.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { killTree } from './kill-tree.js';

export interface ProcessRecord {
  pid: number;
  startTime: string;
  commandLine: string;
}

export type OrphanOutcome = 'killed' | 'identity-mismatch' | 'not-running';

function run(command: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => resolve(error ? undefined : stdout));
  });
}

async function identifyWindows(pid: number): Promise<ProcessRecord | undefined> {
  const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { @{ start = $p.CreationDate.ToUniversalTime().ToString('o'); cmd = $p.CommandLine } | ConvertTo-Json -Compress }`;
  const out = await run('powershell.exe', ['-NoProfile', '-Command', script]);
  if (!out?.trim()) return undefined;
  const parsed = JSON.parse(out) as { start: string; cmd: string | null };
  return { pid, startTime: parsed.start, commandLine: parsed.cmd ?? '' };
}

/** Parses /proc/<pid>/stat + boot id + cmdline into an identity (start ticks are only unique per boot). */
export function parseLinuxProc(pid: number, stat: string, bootId: string, cmdline: string): ProcessRecord {
  // field 22 (starttime, clock ticks since boot) follows the ")" that closes the command name
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const commandLine = cmdline.split('\0').filter(Boolean).join(' ');
  return { pid, startTime: `${bootId.trim()}:${fields[19]}`, commandLine };
}

function identifyLinux(pid: number): ProcessRecord | undefined {
  try {
    return parseLinuxProc(
      pid,
      readFileSync(`/proc/${pid}/stat`, 'utf8'),
      readFileSync('/proc/sys/kernel/random/boot_id', 'utf8'),
      readFileSync(`/proc/${pid}/cmdline`, 'utf8'),
    );
  } catch {
    return undefined;
  }
}

/** Parses `ps -o lstart= -o command=` output; lstart has a fixed width of 24 characters. */
export function parseMacPs(pid: number, out: string): ProcessRecord | undefined {
  const line = out.trim();
  if (!line) return undefined;
  return { pid, startTime: line.slice(0, 24), commandLine: line.slice(24).trim() };
}

async function identifyMac(pid: number): Promise<ProcessRecord | undefined> {
  return parseMacPs(pid, (await run('ps', ['-o', 'lstart=', '-o', 'command=', '-p', String(pid)])) ?? '');
}

/** Captures the identity of a running process, or undefined if it does not exist. */
export async function identify(pid: number): Promise<ProcessRecord | undefined> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid pid: ${pid}`);
  if (process.platform === 'win32') return identifyWindows(pid);
  if (process.platform === 'linux') return identifyLinux(pid);
  return identifyMac(pid);
}

/** Kills a recorded agent process tree after a crash, but only if the pid still belongs to the same process. */
export async function killOrphan(record: ProcessRecord): Promise<OrphanOutcome> {
  const current = await identify(record.pid);
  if (!current) return 'not-running';
  if (current.startTime !== record.startTime || current.commandLine !== record.commandLine) return 'identity-mismatch';
  await killTree(record.pid);
  return 'killed';
}
