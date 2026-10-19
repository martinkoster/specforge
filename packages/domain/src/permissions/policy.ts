// SPDX-License-Identifier: Apache-2.0
// Permission policy (ADR-013, ADR-019, FR-051, NFR-007, NFR-008): pure decision logic, no I/O.

export type RuleEffect = 'allow' | 'deny';
export type RuleScope = 'global' | 'project';
export type AppliesTo = 'implementation' | 'chat' | 'spec' | 'all';
export type RuleOrigin = 'global' | 'project';

export interface PermissionRule {
  id: string;
  scope: RuleScope;
  projectId?: string;
  effect: RuleEffect;
  /** Tool name as reported by the agent (`Bash`, `PowerShell`, `Edit`, …) or `*`. */
  toolName: string;
  /** Command prefix (shell tools) or path glob (file tools); undefined matches any input. */
  pattern?: string;
  appliesTo: AppliesTo;
  createdFrom: 'setup' | 'settings' | 'prompt' | 'suggestion';
}

export interface EffectiveRule {
  rule: PermissionRule;
  origin: RuleOrigin;
  disabled: boolean;
}

export interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
  runKind: string;
  outsideWorkspace: boolean;
}

export type PermissionDecision =
  | { decision: 'allow' | 'deny'; ruleId: string; origin: RuleOrigin }
  | { decision: 'deny'; reason: string }
  | { decision: 'relay'; reason: string };

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
/** Shell tools whose rules match by command prefix. */
export const SHELL_TOOL_NAMES: ReadonlySet<string> = SHELL_TOOLS;
const PATH_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep']);
/** Shell control operators: an allow rule never covers a compound command. */
const SHELL_OPERATORS = /&&|\|\||[;|&`<>\n]|\$\(/;

/** True if a shell command chains or redirects (an allow rule never covers such a command). */
export function hasShellOperators(command: string): boolean {
  return SHELL_OPERATORS.test(command);
}
const SPEC_KINDS = new Set(['clarify', 'generate', 'refine', 'quality_check', 'decision_options', 'analyze', 'feature_review', 'impact']);

export function runKindBucket(runKind: string): Exclude<AppliesTo, 'all'> | 'none' {
  if (runKind === 'implement' || runKind === 'correct') return 'implementation';
  if (runKind === 'chat') return 'chat';
  if (SPEC_KINDS.has(runKind)) return 'spec';
  return 'none';
}

export function effectiveRules(
  global: readonly PermissionRule[],
  project: readonly PermissionRule[],
  disabledGlobalIds: readonly string[],
): EffectiveRule[] {
  const disabled = new Set(disabledGlobalIds);
  return [
    ...global.map((rule) => ({ rule, origin: 'global' as const, disabled: disabled.has(rule.id) })),
    ...project.map((rule) => ({ rule, origin: 'project' as const, disabled: false })),
  ];
}

function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

const startsWithCommand = (command: string, prefix: string) => command === prefix || command.startsWith(`${prefix} `);

function matches(rule: PermissionRule, request: PermissionRequest): boolean {
  if (rule.toolName !== '*' && rule.toolName !== request.toolName) return false;
  if (rule.pattern === undefined) return true;
  if (SHELL_TOOLS.has(request.toolName)) {
    const command = String(request.input.command ?? '').trim();
    if (rule.effect === 'allow') return !SHELL_OPERATORS.test(command) && startsWithCommand(command, rule.pattern);
    return command.split(SHELL_OPERATORS).some((segment) => startsWithCommand(segment.trim(), rule.pattern!));
  }
  if (PATH_TOOLS.has(request.toolName) || rule.toolName === '*') {
    const raw = request.input.file_path ?? request.input.path ?? request.input.notebook_path;
    if (typeof raw !== 'string') return false;
    return globToRegExp(rule.pattern).test(raw.replace(/\\/g, '/').replace(/^\.\//, ''));
  }
  return false;
}

/** Outside workspace → relay; connection tests → deny; deny rules beat allow rules; no match → relay. */
export function decidePermission(request: PermissionRequest, rules: readonly EffectiveRule[]): PermissionDecision {
  if (request.outsideWorkspace) return { decision: 'relay', reason: 'Actions outside the workspace always need your decision.' };
  const bucket = runKindBucket(request.runKind);
  if (bucket === 'none') return { decision: 'deny', reason: 'Connection tests may not use tools.' };
  const applicable = rules.filter(
    (r) => !r.disabled && (r.rule.appliesTo === 'all' || r.rule.appliesTo === bucket) && matches(r.rule, request),
  );
  const winner = applicable.find((r) => r.rule.effect === 'deny') ?? applicable.find((r) => r.rule.effect === 'allow');
  return winner
    ? { decision: winner.rule.effect, ruleId: winner.rule.id, origin: winner.origin }
    : { decision: 'relay', reason: 'No rule matches.' };
}
