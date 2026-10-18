// SPDX-License-Identifier: Apache-2.0
// "Open in editor" (US-057 AC-3): the core resolves and validates the file (inside the run's worktree or the
// workspace) and asks main to open it; the renderer itself cannot open arbitrary paths.
import { isAbsolute } from 'node:path';

export async function handleOpenPath(message: unknown, open: (path: string) => Promise<string>): Promise<boolean> {
  const m = message as { type?: unknown; path?: unknown } | null;
  if (m?.type !== 'open-path' || typeof m.path !== 'string' || !isAbsolute(m.path)) return false;
  await open(m.path);
  return true;
}
