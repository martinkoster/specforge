// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';

/** Runs a probe command and returns its stdout and own pid (so the probe can be excluded from results). */
function probe(cmd: string, args: string[]): Promise<{ stdout: string; pid: number | undefined }> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve({ stdout, pid: child.pid }),
    );
  });
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
}

export function parseWindowsProcessJson(json: string): ProcessInfo[] {
  const parsed = JSON.parse(json) as unknown;
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{ ProcessId: number; ParentProcessId: number; Name: string }>;
  return rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name }));
}

export function parsePosixPs(output: string): ProcessInfo[] {
  return output
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3]!.trim() }));
}

export function descendantsOf(pid: number, table: ProcessInfo[]): ProcessInfo[] {
  const result: ProcessInfo[] = [];
  const queue = [pid];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const p of table) {
      if (p.ppid === parent && p.pid !== pid && !result.includes(p)) {
        result.push(p);
        queue.push(p.pid);
      }
    }
  }
  return result;
}

async function processTable(): Promise<{ table: ProcessInfo[]; probePid: number | undefined }> {
  if (process.platform === 'win32') {
    const { stdout, pid } = await probe('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress',
    ]);
    return { table: parseWindowsProcessJson(stdout), probePid: pid };
  }
  const { stdout, pid } = await probe('ps', ['-A', '-o', 'pid=,ppid=,comm=']);
  return { table: parsePosixPs(stdout), probePid: pid };
}

/** Lists all live descendants of `pid`, excluding the probing command and its console host. */
export async function listDescendants(pid: number): Promise<ProcessInfo[]> {
  const { table, probePid } = await processTable();
  const probeTree = new Set(probePid === undefined ? [] : [probePid, ...descendantsOf(probePid, table).map((p) => p.pid)]);
  return descendantsOf(pid, table).filter((p) => !probeTree.has(p.pid));
}
