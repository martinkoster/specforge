// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsForm, type ProjectSettingsView } from '../src/settings/ProjectSettingsForm.js';

afterEach(cleanup);

const view = (overrides: Partial<ProjectSettingsView> = {}): ProjectSettingsView => ({
  settings: {
    baseBranch: 'main',
    branchPattern: 'specforge/{storyId}',
    worktreeRoot: 'C:\\Users\\u\\AppData\\Roaming\\SpecForge\\wt\\abc12345',
    snapshotExclusions: ['node_modules/**', 'dist/**'],
    concurrencyLimit: 3,
  },
  vcsMode: 'git',
  effectiveConcurrency: 3,
  concurrencyNote: null,
  instructions: { content: '# Conventions\n', hash: 'h1' },
  ...overrides,
});

function renderForm(
  v = view(),
  onSave = vi.fn(async () => ({ ok: true as const })),
  onSaveInstructions = vi.fn(async () => ({ ok: true as const, hash: 'h2' })),
) {
  render(<ProjectSettingsForm view={v} onSave={onSave} onSaveInstructions={onSaveInstructions} />);
  return { onSave, onSaveInstructions };
}

describe('US-016 AC-1: instructions & conventions', () => {
  it('edits and saves .specforge/instructions.md', async () => {
    const { onSaveInstructions } = renderForm();
    const editor = screen.getByRole('textbox', { name: 'Project instructions & conventions' });
    expect(editor).toHaveValue('# Conventions\n');

    await userEvent.type(editor, 'Use pnpm.');
    await userEvent.click(screen.getByRole('button', { name: 'Save instructions' }));

    expect(onSaveInstructions).toHaveBeenCalledWith('# Conventions\nUse pnpm.', 'h1');
    expect(await screen.findByText('Instructions saved')).toBeInTheDocument();
  });
});

describe('US-016 AC-2: Git and workspace settings', () => {
  it('edits base branch, branch pattern, worktree folder and snapshot exclusions (one per line)', async () => {
    const { onSave } = renderForm();

    const branch = screen.getByRole('textbox', { name: 'Base branch' });
    await userEvent.clear(branch);
    await userEvent.type(branch, 'develop');
    const pattern = screen.getByRole('textbox', { name: 'Branch pattern' });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, 'story/{{storyId}');
    const exclusions = screen.getByRole('textbox', { name: 'Snapshot exclusions (one per line)' });
    await userEvent.type(exclusions, '\nout/**');
    await userEvent.click(screen.getByRole('button', { name: 'Save project settings' }));

    expect(onSave).toHaveBeenCalledWith({
      baseBranch: 'develop',
      branchPattern: 'story/{storyId}',
      worktreeRoot: 'C:\\Users\\u\\AppData\\Roaming\\SpecForge\\wt\\abc12345',
      snapshotExclusions: ['node_modules/**', 'dist/**', 'out/**'],
      concurrencyLimit: 3,
    });
  });

  it('shows validation errors from the core', async () => {
    renderForm(
      view(),
      vi.fn(async () => ({ ok: false as const, errors: ['The branch pattern must contain {storyId}.'] })),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save project settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('must contain {storyId}');
  });
});

describe('US-016 AC-3: parallel runs', () => {
  it('is editable with Git', async () => {
    const { onSave } = renderForm();
    const limit = screen.getByRole('spinbutton', { name: 'Parallel runs' });
    await userEvent.clear(limit);
    await userEvent.type(limit, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save project settings' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ concurrencyLimit: 5 }));
  });

  it('is fixed at 1 without Git, with an explanation; Git-only fields are disabled', () => {
    renderForm(
      view({
        vcsMode: 'none',
        effectiveConcurrency: 1,
        concurrencyNote: 'Projects without Git share one working copy, so only one run can be active at a time.',
      }),
    );

    const limit = screen.getByRole('spinbutton', { name: 'Parallel runs' });
    expect(limit).toBeDisabled();
    expect(limit).toHaveValue(1);
    expect(screen.getByText(/share one working copy/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Base branch' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Branch pattern' })).toBeDisabled();
  });
});
