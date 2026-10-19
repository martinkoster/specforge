// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectDialog, folderNameFor } from '../src/projects/CreateProjectDialog.js';

afterEach(cleanup);

function renderDialog(gitAvailable = true, onCreate = vi.fn(async () => undefined)) {
  const onPickFolder = vi.fn(async () => 'C:\\work');
  const onCancel = vi.fn();
  render(<CreateProjectDialog gitAvailable={gitAvailable} onPickFolder={onPickFolder} onCreate={onCreate} onCancel={onCancel} />);
  return { onCreate, onPickFolder, onCancel };
}

describe('US-018 AC-1: create-project dialog', () => {
  it('asks for name, location and folder name (pre-filled from the name) with "Initialise Git" checked', async () => {
    const { onCreate, onPickFolder } = renderDialog();

    await userEvent.type(screen.getByRole('textbox', { name: 'Project name' }), 'Task Manager 2');
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('task-manager-2');
    expect(screen.getByRole('checkbox', { name: /Initialise Git repository/ })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Choose location…' }));
    expect(onPickFolder).toHaveBeenCalled();
    expect(await screen.findByText('C:\\work')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Task Manager 2', parentDir: 'C:\\work', folderName: 'task-manager-2', initGit: true });
  });

  it('keeps an edited folder name and allows unticking Git', async () => {
    const { onCreate } = renderDialog();
    await userEvent.type(screen.getByRole('textbox', { name: 'Folder name' }), 'custom');
    await userEvent.type(screen.getByRole('textbox', { name: 'Project name' }), 'Billing');
    await userEvent.click(screen.getByRole('checkbox', { name: /Initialise Git repository/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose location…' }));
    await screen.findByText('C:\\work');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith({ name: 'Billing', parentDir: 'C:\\work', folderName: 'custom', initGit: false });
  });

  it('requires a name and a location before creating', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('AC-2: shows why creation failed (e.g. folder not empty)', async () => {
    renderDialog(
      true,
      vi.fn(async () => Promise.reject(new Error('The folder C:\\work\\x already exists and is not empty.'))),
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Project name' }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Choose location…' }));
    await screen.findByText('C:\\work');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists and is not empty');
  });
});

describe('US-018 AC-3: Git not installed', () => {
  it('disables the checkbox with an explanation', () => {
    renderDialog(false);
    const checkbox = screen.getByRole('checkbox', { name: /Initialise Git repository/ });

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/Git is not installed — the project is created without Git/)).toBeInTheDocument();
  });
});

describe('folderNameFor', () => {
  it('derives a safe folder name', () => {
    expect(folderNameFor('  Über Projekt: v2! ')).toBe('uber-projekt-v2');
    expect(folderNameFor('***')).toBe('');
  });
});
