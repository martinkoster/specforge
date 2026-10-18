# Spike S3 — Process-tree termination per OS

**Story:** US-003 · **Prepares:** FR-034 (cancel), FR-041 (close/crash recovery), ProcessRegistry (US-049) · **Date:** 2026-10-14
**Prototype:** `spikes/s3/` (throwaway) · **Environment:** Windows 11 and Ubuntu 26.04 on WSL2, Node 24

## Scope and method

A fixture builds a process tree: parent → node child → node grandchild, plus a shell child (`cmd /c ping …` on Windows, `sh -c 'sleep 120'` on POSIX). `killTree()` must leave no process alive. `identify()`/`killOrphan()` record pid, start time and command line, and kill a recorded orphan only if the identity still matches.

| AC | Scenario | Windows | Linux | macOS |
|---|---|---|---|---|
| AC-1 | Full tree (nested node children and shell child) terminated | ✓ `taskkill /PID <pid> /T /F` | ✓ process group SIGTERM | logic unit-tested; not run on a Mac |
| AC-1 | SIGTERM ignored → SIGKILL after grace period | n/a | ✓ (1 s grace in test, 5 s default) | logic unit-tested |
| AC-2 | Identity (start time + command line) recorded; reused pid with different start time is not killed; matching orphan is killed | ✓ CIM `CreationDate` / `CommandLine` | ✓ `/proc/<pid>/stat` start ticks scoped by `boot_id` + `/proc/<pid>/cmdline` | parser unit-tested (`ps -o lstart=,command=`) |

## Findings

1. **Windows:** `taskkill /T /F` reliably kills the whole tree, including `cmd.exe` and its children. No grace period is available; agents are killed immediately. That is acceptable, because SpecForge calls the agent SDK's abort first and only uses tree-kill as a fallback (S1 finding 5).
2. **POSIX:** agents must be spawned as **process-group leaders** (`detached: true`), so that `kill(-pgid)` reaches all children. Children that call `setsid()` leave the group, so SpecForge also snapshots descendants (`ps`) before signalling and signals them individually.
3. **Graceful then forceful:** on POSIX, SIGTERM to the group and the snapshot, and SIGKILL after the grace period (default 5 s, ADR-006 / FR-034's 10 s budget). Verified with a fixture that ignores SIGTERM.
4. **PID reuse:** pids alone are not safe after a crash. Identity = start time + command line. On Linux the start time is in clock ticks since boot, so it is combined with `boot_id`; Windows uses `CreationDate` (UTC). The registry stores these values with each run (`run.pid` plus identity fields).
5. **Probe cost on Windows:** each CIM query takes about 1–2 s (PowerShell start-up). Orphan checks at startup should batch all recorded pids into one query.
6. **macOS** was not available. The macOS code paths (`ps -o lstart=`, process groups) share the POSIX implementation and are unit-tested with injected system functions. A real run is part of the CI matrix (US-008).

## Recommendation

**Go** for the ProcessRegistry design (ADR-006, US-049):
- spawn agents as process-group leaders on POSIX;
- terminate with SDK abort first, then `taskkill /T /F` (Windows) or SIGTERM → SIGKILL to the group plus snapshot descendants (POSIX);
- record pid, start time and command line, and kill orphans at startup only on an identity match, batching identity queries on Windows.
