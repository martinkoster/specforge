// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { builtInDenial, type PermissionContext } from '../src/index.js';

const ctx = (overrides: Partial<PermissionContext>): PermissionContext => ({
  runKind: 'implement',
  toolName: 'Edit',
  input: {},
  writes: [],
  nonGit: false,
  implementationActive: false,
  ...overrides,
});

describe('US-052 AC-1: built-in denies come before rules (ADR-013)', () => {
  it('denies writes to spec/** and .specforge/** in implementation and correction runs (FR-116a)', () => {
    expect(builtInDenial(ctx({ writes: ['spec/04_user_stories/US-001.md'] }))).toMatch(/may not change specifications/);
    expect(builtInDenial(ctx({ runKind: 'correct', toolName: 'Write', writes: ['.specforge/project.yaml'] }))).toMatch(
      /may not change specifications/,
    );
    expect(builtInDenial(ctx({ writes: ['src/spec/helper.ts', 'specs.md'] }))).toBeUndefined();
  });

  it('denies agent story status changes, also in specification runs', () => {
    const status = { content: '---\nid: US-001\nstatus: done\n---\n' };
    expect(
      builtInDenial(ctx({ runKind: 'generate', toolName: 'Write', input: status, writes: ['spec/04_user_stories/US-001.md'] })),
    ).toMatch(/cannot change story status/);
    expect(
      builtInDenial(
        ctx({
          runKind: 'refine',
          toolName: 'MultiEdit',
          input: { edits: [{ new_string: 'status: ready' }] },
          writes: ['spec/04_user_stories/US-002.md'],
        }),
      ),
    ).toMatch(/cannot change story status/);
    expect(
      builtInDenial(
        ctx({ runKind: 'generate', toolName: 'Edit', input: { new_string: 'More text' }, writes: ['spec/04_user_stories/US-001.md'] }),
      ),
    ).toBeUndefined();
  });

  it('non-git mode: denies chat/spec writes while an implementation run is active (FR-116b)', () => {
    const write = { runKind: 'generate', toolName: 'Write', writes: ['spec/02_requirements/fr.md'], nonGit: true };
    expect(builtInDenial(ctx({ ...write, implementationActive: true }))).toMatch(/shared workspace/);
    expect(builtInDenial(ctx({ ...write, toolName: 'Bash', writes: [], implementationActive: true }))).toMatch(/shared workspace/);
    expect(builtInDenial(ctx({ ...write, implementationActive: false }))).toBeUndefined();
    expect(builtInDenial(ctx({ ...write, nonGit: false, implementationActive: true }))).toBeUndefined();
    expect(builtInDenial(ctx({ runKind: 'generate', toolName: 'Read', nonGit: true, implementationActive: true }))).toBeUndefined();
  });
});

describe('US-052 AC-4: chat runs are read-only in Release 1 (FR-089)', () => {
  it('denies file edits and shell commands with an explanation; reads are not built-in denied', () => {
    for (const toolName of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']) {
      expect(builtInDenial(ctx({ runKind: 'chat', toolName }))).toMatch(/chat is read-only/);
    }
    expect(builtInDenial(ctx({ runKind: 'chat', toolName: 'Read' }))).toBeUndefined();
    expect(builtInDenial(ctx({ runKind: 'chat', toolName: 'Grep' }))).toBeUndefined();
  });
});

describe('US-027 AC-1: specification runs write only into their target spec folder (ADR-014)', () => {
  const spec = { runKind: 'generate', writeScope: 'spec/02_requirements' };

  it('allows file writes inside the target folder to be decided by rules', () => {
    expect(builtInDenial(ctx({ ...spec, toolName: 'Write', writes: ['spec/02_requirements/fr.md'] }))).toBeUndefined();
    expect(builtInDenial(ctx({ ...spec, toolName: 'Edit', writes: ['spec/02_requirements/sub/nfr.md'] }))).toBeUndefined();
    expect(builtInDenial(ctx({ ...spec, toolName: 'Read', writes: [] }))).toBeUndefined();
  });

  it('denies writes outside the target folder and shell commands', () => {
    expect(builtInDenial(ctx({ ...spec, toolName: 'Write', writes: ['spec/03_design/x.md'] }))).toMatch(
      /only change files in spec\/02_requirements/,
    );
    expect(builtInDenial(ctx({ ...spec, toolName: 'Write', writes: ['spec/02_requirements_old/x.md'] }))).toMatch(/only change files/);
    expect(builtInDenial(ctx({ ...spec, toolName: 'Write', writes: ['src/a.ts'] }))).toMatch(/only change files/);
    expect(builtInDenial(ctx({ ...spec, toolName: 'Bash', writes: [] }))).toMatch(/shell commands are denied/);
  });
});

describe('US-029/US-028: read-only runs (quality check, clarification questions)', () => {
  it('denies every write and shell command; reads are decided by rules', () => {
    for (const toolName of ['Write', 'Edit', 'Bash', 'PowerShell']) {
      expect(builtInDenial(ctx({ runKind: 'quality_check', toolName, readOnly: true, writes: ['spec/02_requirements/fr.md'] }))).toMatch(
        /read-only/,
      );
    }
    expect(builtInDenial(ctx({ runKind: 'quality_check', toolName: 'Read', readOnly: true }))).toBeUndefined();
  });
});

describe('US-036: story generation may create new stories in Backlog', () => {
  const create = { runKind: 'generate', toolName: 'Write', writes: ['spec/04_user_stories/US-010-login.md'] };

  it('allows writing a new story file with status backlog', () => {
    expect(
      builtInDenial(
        ctx({
          ...create,
          input: { content: '---\nid: US-010\nstatus: backlog\n---\n' },
          newFiles: ['spec/04_user_stories/US-010-login.md'],
        }),
      ),
    ).toBeUndefined();
  });

  it('still denies other initial statuses and any status change of an existing story', () => {
    expect(
      builtInDenial(
        ctx({ ...create, input: { content: '---\nstatus: ready\n---\n' }, newFiles: ['spec/04_user_stories/US-010-login.md'] }),
      ),
    ).toMatch(/cannot change story status/);
    expect(builtInDenial(ctx({ ...create, input: { content: '---\nstatus: backlog\n---\n' }, newFiles: [] }))).toMatch(
      /cannot change story status/,
    );
    expect(builtInDenial(ctx({ ...create, input: { content: '---\nstatus: backlog\n---\n' } }))).toMatch(/cannot change story status/);
  });
});
