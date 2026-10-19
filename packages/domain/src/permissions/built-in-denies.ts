// SPDX-License-Identifier: Apache-2.0
// Built-in permission denies, evaluated before any rule (ADR-013, FR-089, FR-116).

export interface PermissionContext {
  runKind: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Workspace-relative POSIX paths the tool writes (file tools); empty for other tools. */
  writes: readonly string[];
  /** Non-git mode: all runs share the main working copy. */
  nonGit: boolean;
  /** An implementation run is active in the shared working copy (non-git mode). */
  implementationActive: boolean;
  /** Specification runs: the only workspace folder (POSIX, relative) the run may write (ADR-014). */
  writeScope?: string;
  /** Read-only runs (quality checks, clarification questions): no writes and no shell commands. */
  readOnly?: boolean;
  /** Written paths that do not exist yet (new story files may start in Backlog, US-036). */
  newFiles?: readonly string[];
}

export const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
export const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell']);
const IMPLEMENTATION_KINDS = new Set(['implement', 'correct']);
const STORY_FILE = /^spec\/04_user_stories\/(.+\/)?[^/]+\.md$/;
const STATUS_LINE = /^\s*status\s*:/m;
const STATUS_VALUES = /^\s*status\s*:\s*['"]?([\w-]+)/gm;

const isSpecPath = (path: string): boolean =>
  path === 'spec' || path.startsWith('spec/') || path === '.specforge' || path.startsWith('.specforge/');

/** Text a file tool would write (Write content, Edit/MultiEdit new strings). */
function writtenText(input: Record<string, unknown>): string {
  const parts: unknown[] = [input.content, input.new_string, input.new_source];
  if (Array.isArray(input.edits)) for (const edit of input.edits) parts.push((edit as { new_string?: unknown } | null)?.new_string);
  return parts.filter((p): p is string => typeof p === 'string').join('\n');
}

/** Returns the reason a request is denied regardless of rules, or undefined if rules decide. */
export function builtInDenial(ctx: PermissionContext): string | undefined {
  const fileWrite = FILE_WRITE_TOOLS.has(ctx.toolName);
  const mayWrite = fileWrite || SHELL_TOOLS.has(ctx.toolName);

  if (ctx.runKind === 'chat' && mayWrite) {
    return 'The project chat is read-only in this release; write requests and shell commands are denied.';
  }
  if (IMPLEMENTATION_KINDS.has(ctx.runKind) && ctx.writes.some(isSpecPath)) {
    return 'Implementation runs may not change specifications (spec/**, .specforge/**); report missing changes in the result instead.';
  }
  if (ctx.readOnly && mayWrite) {
    return 'This run is read-only: file changes and shell commands are denied. Report your results in the structured result instead.';
  }
  if (ctx.writeScope !== undefined && mayWrite) {
    const scope = ctx.writeScope;
    if (!fileWrite) return `Specification runs may only change files in ${scope}; shell commands are denied.`;
    if (ctx.writes.some((p) => p !== scope && !p.startsWith(`${scope}/`))) {
      return `This specification run may only change files in ${scope}.`;
    }
  }
  const storyWrites = ctx.writes.filter((p) => STORY_FILE.test(p));
  const newStories = storyWrites.length > 0 && storyWrites.every((p) => ctx.newFiles?.includes(p));
  const text = writtenText(ctx.input);
  const backlogOnly = [...text.matchAll(STATUS_VALUES)].every((m) => m[1] === 'backlog');
  if (fileWrite && storyWrites.length > 0 && STATUS_LINE.test(text) && !(newStories && backlogOnly)) {
    return 'Agents cannot change story status; they may only recommend transitions.';
  }
  if (ctx.nonGit && ctx.implementationActive && !IMPLEMENTATION_KINDS.has(ctx.runKind) && mayWrite) {
    return 'An implementation run is changing the shared workspace (no Git); writes are denied until it finishes.';
  }
  return undefined;
}
