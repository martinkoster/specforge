// SPDX-License-Identifier: Apache-2.0
// Run start rule for non-git workspaces (FR-039, D6): runs are not isolated, so the user must confirm.

export type VcsMode = 'git' | 'none';

/** Shown when a project is opened in non-git mode (FR-004, D12). */
export const NON_GIT_PROJECT_WARNING =
  'No Git repository — runs are not isolated: agents change files directly in your workspace, one run at a time, ' +
  'with a snapshot before each run. Initialise Git to enable isolated, parallel runs.';

export const NON_GIT_ISOLATION_WARNING =
  'This project has no Git repository, so the agent will change files directly in your workspace. ' +
  'A snapshot is taken before the run so you can review and restore the changes. Continue?';

export type RunStartCheck = { ok: true; snapshot: boolean } | { ok: false; requiresConfirmation: true; warning: string };

export function runStartCheck({ vcsMode, confirmed }: { vcsMode: VcsMode; confirmed: boolean }): RunStartCheck {
  if (vcsMode === 'git') return { ok: true, snapshot: false };
  return confirmed ? { ok: true, snapshot: true } : { ok: false, requiresConfirmation: true, warning: NON_GIT_ISOLATION_WARNING };
}
