// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { alwaysAllowRule, type PendingPermission } from '../src/index.js';

const pending = (overrides: Partial<PendingPermission> = {}): PendingPermission => ({
  id: 'q1',
  runId: 'run-1',
  projectId: 'p1',
  runKind: 'implement',
  toolName: 'Bash',
  input: { command: 'npm test -- --run' },
  cwd: '/wt/US-001',
  outsideWorkspace: false,
  requestedAt: 't',
  ...overrides,
});

describe('US-053 AC-1: "Always allow for this project"', () => {
  it('creates a project rule for the command (shell tools) and the run kind', () => {
    expect(alwaysAllowRule(pending())).toEqual({
      ok: true,
      rule: {
        scope: 'project',
        projectId: 'p1',
        effect: 'allow',
        toolName: 'Bash',
        pattern: 'npm test -- --run',
        appliesTo: 'implementation',
        createdFrom: 'prompt',
      },
    });
  });

  it('allows a file tool for this project and run kind', () => {
    expect(alwaysAllowRule(pending({ toolName: 'Edit', input: { file_path: 'src/a.ts' }, runKind: 'generate' }))).toEqual({
      ok: true,
      rule: { scope: 'project', projectId: 'p1', effect: 'allow', toolName: 'Edit', appliesTo: 'spec', createdFrom: 'prompt' },
    });
  });

  it('is not offered for actions outside the workspace or compound shell commands', () => {
    expect(alwaysAllowRule(pending({ outsideWorkspace: true }))).toEqual({
      ok: false,
      reason: 'Actions outside the workspace always ask.',
    });
    expect(alwaysAllowRule(pending({ input: { command: 'npm test && rm -rf /' } }))).toEqual({
      ok: false,
      reason: 'Commands with shell operators cannot be allowed by a rule.',
    });
  });
});
