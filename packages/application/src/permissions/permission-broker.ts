// SPDX-License-Identifier: Apache-2.0
// Single decision point for agent permission requests (US-052, ADR-013): built-in denies → outside workspace →
// effective rules → relay to the user. Relayed requests pause only their run and wait without timeout.
import { builtInDenial, decidePermission, type EffectiveRule } from '@specforge/domain';
import type { PermissionAnswer, PermissionAsk, RunKind } from '../ports/agent-adapter.js';

export type DecidedBy = 'user' | 'built_in' | 'default_deny' | `rule:${string}`;

export interface PermissionRecord {
  id: string;
  runId: string;
  toolName: string;
  /** Already redacted by the caller (SecretRedactor). */
  input: Record<string, unknown>;
  cwd: string;
  outsideWorkspace: boolean;
  requestedAt: string;
  decision: 'allow' | 'deny' | null;
  decidedBy: DecidedBy | null;
  decidedAt: string | null;
  message: string | null;
}

/** Append-only store: a decided request is never changed again. */
export interface PermissionStore {
  insert(record: PermissionRecord): void;
  decide(id: string, decision: Pick<PermissionRecord, 'decision' | 'decidedBy' | 'decidedAt' | 'message'>): void;
}

export interface PermissionRunContext {
  runId: string;
  projectId: string;
  runKind: RunKind;
  /** Root of the run's execution space (worktree, or the main workspace for spec/chat runs and non-git mode). */
  workspaceRoot: string;
  nonGit: boolean;
  implementationActive(): boolean;
  /** Specification runs: the only folder the run may write (ADR-014). */
  writeScope?: string;
  /** Read-only runs (quality check, clarification questions). */
  readOnly?: boolean;
}

export interface PendingPermission {
  id: string;
  runId: string;
  projectId: string;
  runKind: RunKind;
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  outsideWorkspace: boolean;
  requestedAt: string;
}

export interface PermissionBrokerDeps {
  store: PermissionStore;
  rules(projectId: string): readonly EffectiveRule[];
  runs: { setAwaitingPermission(runId: string, waiting: boolean): void };
  now(): string;
  newId(): string;
  onRequested?(pending: PendingPermission): void;
  onDecided?(id: string, decision: 'allow' | 'deny'): void;
  /** Whether an absolute path exists (new story files may be created in Backlog, US-036). */
  fileExists?(path: string): boolean;
}

const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;

/** Normalises a path to forward slashes without trailing slash; resolves `.`/`..` segments. */
function normalise(path: string): string {
  const absolute = /^([a-zA-Z]:)?[\\/]/.test(path);
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const joined = parts.join('/');
  return absolute && !/^[a-zA-Z]:/.test(joined) ? `/${joined}` : joined;
}

const isAbsolute = (path: string): boolean => /^([a-zA-Z]:)?[\\/]/.test(path);

/** Workspace-relative path, or undefined if `target` is outside `root`. Case-insensitive on Windows drive paths. */
function relativeTo(root: string, cwd: string, target: string): string | undefined {
  const full = normalise(isAbsolute(target) ? target : `${cwd}/${target}`);
  const base = normalise(root);
  const windows = /^[a-zA-Z]:/.test(base);
  const [f, b] = windows ? [full.toLowerCase(), base.toLowerCase()] : [full, base];
  if (f === b) return '';
  return f.startsWith(`${b}/`) ? full.slice(base.length + 1) : undefined;
}

interface Waiting {
  pending: PendingPermission;
  resolve(answer: PermissionAnswer): void;
}

export class PermissionBroker {
  private readonly waiting = new Map<string, Waiting>();

  constructor(private readonly deps: PermissionBrokerDeps) {}

  async ask(run: PermissionRunContext, ask: PermissionAsk): Promise<PermissionAnswer> {
    const paths = PATH_KEYS.map((k) => ask.input[k]).filter((p): p is string => typeof p === 'string' && p !== '');
    const relative = paths.map((p) => relativeTo(run.workspaceRoot, ask.cwd, p));
    const outsideWorkspace = relative.some((r) => r === undefined) || relativeTo(run.workspaceRoot, ask.cwd, '.') === undefined;
    const record: PermissionRecord = {
      id: this.deps.newId(),
      runId: run.runId,
      toolName: ask.toolName,
      input: ask.input,
      cwd: ask.cwd,
      outsideWorkspace,
      requestedAt: this.deps.now(),
      decision: null,
      decidedBy: null,
      decidedAt: null,
      message: null,
    };
    this.deps.store.insert(record);

    const denial = builtInDenial({
      runKind: run.runKind,
      toolName: ask.toolName,
      input: ask.input,
      writes: relative.filter((r): r is string => r !== undefined),
      nonGit: run.nonGit,
      implementationActive: run.nonGit && run.implementationActive(),
      ...(run.writeScope !== undefined ? { writeScope: run.writeScope } : {}),
      ...(run.readOnly ? { readOnly: true } : {}),
      newFiles: paths
        .map((p, i) => ({ absolute: isAbsolute(p) ? p : `${ask.cwd}/${p}`, relative: relative[i] }))
        .filter(
          (f): f is { absolute: string; relative: string } => f.relative !== undefined && this.deps.fileExists?.(f.absolute) === false,
        )
        .map((f) => f.relative),
    });
    if (denial) return this.finish(record.id, 'deny', 'built_in', denial);

    const decision = decidePermission(
      { toolName: ask.toolName, input: ask.input, runKind: run.runKind, outsideWorkspace },
      this.deps.rules(run.projectId),
    );
    if (decision.decision === 'allow') return this.finish(record.id, 'allow', `rule:${decision.ruleId}`, null);
    if (decision.decision === 'deny') {
      const by = 'ruleId' in decision ? (`rule:${decision.ruleId}` as const) : ('built_in' as const);
      const reason = 'ruleId' in decision ? `Denied by a ${decision.origin} rule.` : decision.reason;
      return this.finish(record.id, 'deny', by, reason);
    }
    return this.relay(run, record);
  }

  pending(): PendingPermission[] {
    return [...this.waiting.values()].map((w) => w.pending);
  }

  decide(id: string, decision: 'allow' | 'deny', message?: string): void {
    const waiting = this.waiting.get(id);
    if (!waiting) throw new Error(`No pending permission request ${id}.`);
    this.settle(waiting, decision, 'user', decision === 'deny' ? (message ?? 'Denied by the user.') : null);
  }

  /** The user closed the prompt without deciding. */
  dismiss(id: string): void {
    const waiting = this.waiting.get(id);
    if (waiting) this.settle(waiting, 'deny', 'default_deny', 'The request was dismissed.');
  }

  /** The run was aborted: its pending requests are denied. */
  cancelRun(runId: string): void {
    for (const waiting of [...this.waiting.values()]) {
      if (waiting.pending.runId === runId) this.settle(waiting, 'deny', 'default_deny', 'The run was cancelled.');
    }
  }

  /** SpecForge is closing: every pending request is denied. */
  shutdown(): void {
    for (const waiting of [...this.waiting.values()]) this.settle(waiting, 'deny', 'default_deny', 'SpecForge was closed.');
  }

  private relay(run: PermissionRunContext, record: PermissionRecord): Promise<PermissionAnswer> {
    const pending: PendingPermission = {
      id: record.id,
      runId: run.runId,
      projectId: run.projectId,
      runKind: run.runKind,
      toolName: record.toolName,
      input: record.input,
      cwd: record.cwd,
      outsideWorkspace: record.outsideWorkspace,
      requestedAt: record.requestedAt,
    };
    return new Promise((resolve) => {
      this.waiting.set(record.id, { pending, resolve });
      this.deps.runs.setAwaitingPermission(run.runId, true);
      this.deps.onRequested?.(pending);
    });
  }

  private settle(waiting: Waiting, decision: 'allow' | 'deny', by: DecidedBy, message: string | null): void {
    const { pending } = waiting;
    this.waiting.delete(pending.id);
    const answer = this.finish(pending.id, decision, by, message);
    if (![...this.waiting.values()].some((w) => w.pending.runId === pending.runId)) {
      this.deps.runs.setAwaitingPermission(pending.runId, false);
    }
    waiting.resolve(answer);
  }

  private finish(id: string, decision: 'allow' | 'deny', by: DecidedBy, message: string | null): PermissionAnswer {
    this.deps.store.decide(id, { decision, decidedBy: by, decidedAt: this.deps.now(), message });
    this.deps.onDecided?.(id, decision);
    return decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: message ?? 'Denied.' };
  }
}
