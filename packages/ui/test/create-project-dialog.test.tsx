// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupChecked } from './styled-controls.js';
import { CreateProjectDialog, folderBaseName } from '../src/projects/CreateProjectDialog.js';

afterEach(cleanupChecked);

function renderDialog(
  options: {
    folder?: string;
    gitAvailable?: boolean;
    onCreate?: () => Promise<void>;
    onChangeFolder?: () => Promise<string | null>;
  } = {},
) {
  const onCreate = vi.fn(options.onCreate ?? (async () => undefined));
  const onChangeFolder = vi.fn(options.onChangeFolder ?? (async () => 'C:\\work\\other'));
  const onCancel = vi.fn();
  render(
    <CreateProjectDialog
      folder={options.folder ?? 'C:\\work\\task-manager'}
      gitAvailable={options.gitAvailable ?? true}
      onChangeFolder={onChangeFolder}
      onCreate={onCreate}
      onCancel={onCancel}
    />,
  );
  return { onCreate, onChangeFolder, onCancel };
}

describe('US-068 AC-1: folder-first create-project dialog', () => {
  it('shows the picked folder, the name pre-filled from the folder name and "Initialise Git" checked; no location or folder-name fields', async () => {
    const { onCreate } = renderDialog();

    expect(screen.getByText('C:\\work\\task-manager')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('task-manager');
    expect(screen.getByRole('checkbox', { name: /Initialise Git repository/ })).toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose location…' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'task-manager', path: 'C:\\work\\task-manager', initGit: true });
  });

  it('accepts an edited name and an unticked Git checkbox', async () => {
    const { onCreate } = renderDialog();
    const name = screen.getByRole('textbox', { name: 'Project name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Task Manager');
    await userEvent.click(screen.getByRole('checkbox', { name: /Initialise Git repository/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith({ name: 'Task Manager', path: 'C:\\work\\task-manager', initGit: false });
  });

  it('requires a name', async () => {
    renderDialog();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Project name' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('"Change…" picks another folder and re-fills an untouched name', async () => {
    const { onChangeFolder, onCreate } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));

    expect(onChangeFolder).toHaveBeenCalled();
    expect(await screen.findByText('C:\\work\\other')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('other');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'other', path: 'C:\\work\\other', initGit: true });
  });

  it('"Change…" keeps an edited name, ignores a cancelled picker and shows a rejected folder', async () => {
    const answers: Array<() => Promise<string | null>> = [
      async () => null,
      async () => Promise.reject(new Error('Choose an empty folder — adopting existing code arrives in Release 2.')),
      async () => '/home/me/notes',
    ];
    renderDialog({ onChangeFolder: () => answers.shift()!() });
    const name = screen.getByRole('textbox', { name: 'Project name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Mine');

    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));
    expect(screen.getByText('C:\\work\\task-manager')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('adopting existing code arrives in Release 2');
    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));

    expect(await screen.findByText('/home/me/notes')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(name).toHaveValue('Mine');
  });

  it('shows why creation failed', async () => {
    renderDialog({ onCreate: async () => Promise.reject(new Error('The folder is not empty.')) });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The folder is not empty.');
  });

  it('Git not installed: disables the checkbox with an explanation (US-018 AC-3)', () => {
    renderDialog({ gitAvailable: false });
    const checkbox = screen.getByRole('checkbox', { name: /Initialise Git repository/ });

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/Git is not installed — the project is created without Git/)).toBeInTheDocument();
  });
});

describe('folderBaseName', () => {
  it('returns the last path segment for Windows and POSIX paths', () => {
    expect(folderBaseName('C:\\work\\task-manager')).toBe('task-manager');
    expect(folderBaseName('/home/me/notes/')).toBe('notes');
    expect(folderBaseName('C:\\')).toBe('');
  });
});
