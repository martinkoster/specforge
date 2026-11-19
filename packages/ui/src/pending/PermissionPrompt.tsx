// SPDX-License-Identifier: Apache-2.0
// Permission prompt (US-053 AC-1, FR-032, UF-05): story, run, tool, arguments, working directory, outside-workspace flag;
// Allow / Deny (with message) / Always allow for this project (never for outside-workspace actions).
import { Callout } from '../components/index.js';
import { useState } from 'react';
import type { CommandInput, CommandOutput, QueryOutput } from '@specforge/ipc-contract';

type PendingItem = QueryOutput<'pending.list'>[number]['items'][number];
export type PendingPermissionView = Extract<PendingItem, { kind: 'permission' }>['permission'];
export type PermissionDecision = Omit<CommandInput<'permission.decide'>, 'id'>;

export interface PermissionPromptProps {
  storyId: string | null;
  permission: PendingPermissionView;
  onDecide(decision: PermissionDecision): Promise<CommandOutput<'permission.decide'>>;
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function argumentsOf(p: PendingPermissionView): string {
  if (SHELL_TOOLS.has(p.toolName) && typeof p.input.command === 'string') return p.input.command;
  return JSON.stringify(p.input, null, 2);
}

export function PermissionPrompt({ storyId, permission, onDecide }: PermissionPromptProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const who = storyId ?? 'A specification run';

  const decide = async (decision: PermissionDecision): Promise<void> => {
    setBusy(true);
    try {
      const result = await onDecide(decision);
      setError(result.ok ? undefined : result.reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label={`${who} asks to use ${permission.toolName}`} className="permission-prompt">
      <p className="permission-head">
        <strong>{who}</strong> <span className="hint">· Run {permission.runId.slice(0, 8)} ·</span>{' '}
        <strong className="mono">{permission.toolName}</strong>
      </p>
      {permission.outsideWorkspace && (
        <Callout tone="warning" role="note" title="Outside the workspace">
          This touches files outside the project. It is never approved automatically.
        </Callout>
      )}
      <pre className="permission-args">{argumentsOf(permission)}</pre>
      <p className="hint">Working directory: {permission.cwd}</p>
      <label className="field">
        <span className="field-label">Message to the agent (optional)</span>
        <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="permission-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void decide({ decision: 'allow' })}>
          Allow
        </button>
        <button
          className="btn btn-danger"
          type="button"
          disabled={busy}
          onClick={() => void decide(message.trim() ? { decision: 'deny', message: message.trim() } : { decision: 'deny' })}
        >
          Deny
        </button>
        {!permission.outsideWorkspace && (
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy}
            onClick={() => void decide({ decision: 'allow', alwaysAllow: true })}
          >
            Always allow for this project
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
