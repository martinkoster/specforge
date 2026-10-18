// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_SETTINGS,
  branchNameFor,
  effectiveConcurrency,
  validateProjectSettings,
  type ProjectSettings,
} from '../src/index.js';

const settings = (overrides: Partial<ProjectSettings> = {}): ProjectSettings => ({
  ...DEFAULT_PROJECT_SETTINGS,
  baseBranch: 'main',
  worktreeRoot: 'C:/Users/u/AppData/Roaming/SpecForge/wt/abc12345',
  ...overrides,
});

const ctx = { workspacePath: 'C:/work/app', vcsMode: 'git' as const };

describe('US-016 AC-3: parallel runs', () => {
  it('defaults to 3; non-git mode is fixed at 1', () => {
    expect(DEFAULT_PROJECT_SETTINGS.concurrencyLimit).toBe(3);
    expect(effectiveConcurrency(5, 'git')).toBe(5);
    expect(effectiveConcurrency(5, 'none')).toBe(1);
  });

  it('accepts 1–10 parallel runs', () => {
    expect(validateProjectSettings(settings({ concurrencyLimit: 10 }), ctx)).toEqual([]);
    expect(validateProjectSettings(settings({ concurrencyLimit: 0 }), ctx)).toEqual(['Parallel runs must be a whole number from 1 to 10.']);
    expect(validateProjectSettings(settings({ concurrencyLimit: 2.5 }), ctx)).toEqual([
      'Parallel runs must be a whole number from 1 to 10.',
    ]);
  });
});

describe('US-016 AC-2: Git and workspace settings are validated', () => {
  it('requires {storyId} in the branch pattern and a valid Git branch name', () => {
    expect(branchNameFor('specforge/{storyId}', 'US-007')).toBe('specforge/US-007');
    expect(validateProjectSettings(settings({ branchPattern: 'feature/{storyId}-impl' }), ctx)).toEqual([]);
    expect(validateProjectSettings(settings({ branchPattern: 'specforge/story' }), ctx)).toEqual([
      'The branch pattern must contain {storyId}.',
    ]);
    expect(validateProjectSettings(settings({ branchPattern: 'bad name/{storyId}' }), ctx)).toEqual([
      '"bad name/US-001" is not a valid Git branch name.',
    ]);
    expect(validateProjectSettings(settings({ branchPattern: 'a..b/{storyId}' }), ctx)).toEqual([
      '"a..b/US-001" is not a valid Git branch name.',
    ]);
  });

  it('requires an absolute worktree root outside the workspace', () => {
    expect(validateProjectSettings(settings({ worktreeRoot: 'wt' }), ctx)).toEqual(['The worktree folder must be an absolute path.']);
    expect(validateProjectSettings(settings({ worktreeRoot: 'C:/work/app/.wt' }), ctx)).toEqual([
      'The worktree folder must be outside the workspace (run worktrees must not be indexed).',
    ]);
    expect(validateProjectSettings(settings({ worktreeRoot: 'c:\\WORK\\app' }), ctx)).toHaveLength(1);
    expect(validateProjectSettings(settings({ worktreeRoot: '/home/u/wt' }), { workspacePath: '/home/u/app', vcsMode: 'git' })).toEqual([]);
  });

  it('requires relative snapshot exclusion globs and a base branch in git mode', () => {
    expect(validateProjectSettings(settings({ snapshotExclusions: ['node_modules/**', 'build/'] }), ctx)).toEqual([]);
    expect(validateProjectSettings(settings({ snapshotExclusions: ['/etc/**', ' '] }), ctx)).toEqual([
      'Snapshot exclusion "/etc/**" must be a path pattern relative to the workspace.',
      'Snapshot exclusions must not be empty.',
    ]);
    expect(validateProjectSettings(settings({ baseBranch: '' }), ctx)).toEqual(['Choose a base branch.']);
    expect(validateProjectSettings(settings({ baseBranch: '' }), { ...ctx, vcsMode: 'none' })).toEqual([]);
  });
});
