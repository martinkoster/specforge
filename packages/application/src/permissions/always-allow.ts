// SPDX-License-Identifier: Apache-2.0
// "Always allow for this project" from a permission prompt (US-053 AC-1, FR-051): a project rule for the tool
// (shell tools: the command) and the run kind's bucket; never for outside-workspace actions (ADR-013).
import { SHELL_TOOL_NAMES, hasShellOperators, runKindBucket, type PermissionRule } from '@specforge/domain';
import type { PendingPermission } from './permission-broker.js';

export type AlwaysAllowResult = { ok: true; rule: Omit<PermissionRule, 'id'> } | { ok: false; reason: string };

export function alwaysAllowRule(pending: PendingPermission): AlwaysAllowResult {
  if (pending.outsideWorkspace) return { ok: false, reason: 'Actions outside the workspace always ask.' };
  const bucket = runKindBucket(pending.runKind);
  if (bucket === 'none') return { ok: false, reason: 'Connection tests may not use tools.' };
  const rule: Omit<PermissionRule, 'id'> = {
    scope: 'project',
    projectId: pending.projectId,
    effect: 'allow',
    toolName: pending.toolName,
    appliesTo: bucket,
    createdFrom: 'prompt',
  };
  if (SHELL_TOOL_NAMES.has(pending.toolName)) {
    const command = typeof pending.input.command === 'string' ? pending.input.command.trim() : '';
    if (command === '' || hasShellOperators(command))
      return { ok: false, reason: 'Commands with shell operators cannot be allowed by a rule.' };
    return { ok: true, rule: { ...rule, pattern: command } };
  }
  return { ok: true, rule };
}
