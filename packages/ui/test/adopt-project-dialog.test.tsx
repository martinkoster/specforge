// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupChecked } from './styled-controls.js';
import { AdoptProjectDialog, type AdoptFolder } from '../src/projects/AdoptProjectDialog.js';

afterEach(cleanupChecked);

function renderDialog(
  options: {
    folder?: Partial<AdoptFolder>;
    gitAvailable?: boolean;
    checkSpecRoot?: (path: string, specRoot: string) => Promise<string | null>;
    onAdopt?: () => Promise<void>;
    onChangeFolder?: () => Promise<AdoptFolder | null>;
  } = {},
) {
  const folder: AdoptFolder = { path: 'C:\\code\\rails-app', git: 'none', suggestedSpecRoot: 'spec', ...options.folder };
  const onAdopt = vi.fn(options.onAdopt ?? (async () => undefined));
  const checkSpecRoot = vi.fn(options.checkSpecRoot ?? (async () => null));
  const onChangeFolder = vi.fn(options.onChangeFolder ?? (async () => null));
  const onCancel = vi.fn();
  render(
    <AdoptProjectDialog
      folder={folder}
      gitAvailable={options.gitAvailable ?? true}
      checkSpecRoot={checkSpecRoot}
      onChangeFolder={onChangeFolder}
      onAdopt={onAdopt}
      onCancel={onCancel}
    />,
  );
  return { onAdopt, checkSpecRoot, onChangeFolder, onCancel };
}

describe('US-079 AC-3: adopt dialog', () => {
  it('shows folder, name from the folder name, the suggested specification folder and "Initialise Git" without a repository', async () => {
    const { onAdopt } = renderDialog({ folder: { suggestedSpecRoot: 'docs/spec' } });

    expect(screen.getByRole('dialog', { name: 'Adopt existing code' })).toBeInTheDocument();
    expect(screen.getByText('C:\\code\\rails-app')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('rails-app');
    expect(screen.getByRole('textbox', { name: 'Specification folder' })).toHaveValue('docs/spec');
    expect(screen.getByText(/spec\/ already exists and is left untouched/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Initialise Git repository/ })).toBeChecked();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Adopt' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onAdopt.mock.calls[0]?.[0]).toEqual({ name: 'rails-app', path: 'C:\\code\\rails-app', specRoot: 'docs/spec', initGit: true });
  });

  it('hides "Initialise Git" in an existing repository and adopts without it', async () => {
    const { onAdopt } = renderDialog({ folder: { git: 'root' } });

    expect(screen.queryByRole('checkbox', { name: /Initialise Git repository/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adopt' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onAdopt.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ specRoot: 'spec', initGit: false }));
  });

  it('validates the specification folder at the field and keeps Adopt disabled', async () => {
    const { checkSpecRoot } = renderDialog({
      checkSpecRoot: async (_path, root) =>
        root === 'spec' ? null : 'tests/ already exists and is not empty — choose another specification folder.',
    });
    const field = screen.getByRole('textbox', { name: 'Specification folder' });

    await userEvent.clear(field);
    await userEvent.type(field, '../x');
    expect(await screen.findByText(/\.\./)).toHaveAttribute('id', 'adopt-spec-root-problem');
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, '.specforge/spec');
    expect(await screen.findByText(/\.specforge/, { selector: '#adopt-spec-root-problem' })).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, 'tests');
    expect(await screen.findByText(/tests\/ already exists and is not empty/)).toBeInTheDocument();
    expect(checkSpecRoot).toHaveBeenLastCalledWith(expect.stringContaining('rails-app'), 'tests');
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeDisabled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('AC-5: a subfolder of a repository says "Choose the repository root" and cannot be adopted', async () => {
    renderDialog({ folder: { git: 'subfolder' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Choose the repository root');
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeDisabled();
  });

  it('changes the folder and shows a rejected adoption', async () => {
    const { onAdopt } = renderDialog({
      onChangeFolder: async () => ({ path: '/home/me/shop', git: 'root', suggestedSpecRoot: 'docs/spec' }),
      onAdopt: async () => Promise.reject(new Error('Choose the repository root (or a folder without version control).')),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));
    expect(screen.getByText('/home/me/shop')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('shop');
    expect(screen.getByRole('textbox', { name: 'Specification folder' })).toHaveValue('docs/spec');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adopt' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onAdopt).toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the repository root');
  });

  it('Git not installed: no Git checkbox, adoption without Git', async () => {
    const { onAdopt, onCancel } = renderDialog({ gitAvailable: false });
    expect(screen.queryByRole('checkbox', { name: /Initialise Git repository/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adopt' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onAdopt.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initGit: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
