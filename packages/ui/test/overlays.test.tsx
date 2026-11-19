// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-071 (NFR-033, NFR-020, ui_design_concept.md §4.1, §5): dialogs, drawers, menus, tooltips and toasts.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, Drawer, Menu, Tooltip } from '../src/components/index.js';
import { Toasts, type Toast } from '../src/pending/Toasts.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(() => {
  vi.useRealTimers();
  cleanupChecked();
});

function DialogHarness({ busy = false, onClose = () => undefined }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <Dialog
          title="Commit spec changes"
          description="Only these files are committed."
          busy={busy}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={
            <button type="button" className="btn btn-primary">
              Commit
            </button>
          }
        >
          <p>3 files</p>
        </Dialog>
      )}
    </>
  );
}

describe('US-071 AC-1: dialog', () => {
  it('has title, description and footer, traps focus, closes with Esc and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });

    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Commit spec changes' });
    expect(dialog).toHaveAccessibleDescription('Only these files are committed.');
    expect(dialog).toHaveClass('dialog');
    expect(document.querySelector('.dialog-overlay')).not.toBeNull();
    expect(dialog.querySelector('.dialog-footer')).toContainElement(screen.getByRole('button', { name: 'Commit' }));
    expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });

  it('does not close while busy; the danger variant marks destructive confirmations', async () => {
    const onClose = vi.fn();
    render(<DialogHarness busy onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    cleanupChecked();

    render(
      <Dialog title="Discard run?" tone="danger" onClose={() => undefined} role="alertdialog">
        Discarding removes the worktree.
      </Dialog>,
    );
    const danger = await screen.findByRole('alertdialog', { name: 'Discard run?' });
    expect(danger).toHaveClass('dialog', 'dialog-danger');
  });
});

describe('US-071 AC-2: menus and tooltips', () => {
  it('dropdown menu opens from its trigger and is operable with the keyboard', async () => {
    const rename = vi.fn();
    const remove = vi.fn();
    render(
      <Menu
        label="Actions for Task Manager"
        items={[
          { label: 'Rename', onSelect: rename },
          { label: 'Remove from list', onSelect: remove, danger: true },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Task Manager' });
    expect(trigger).toHaveClass('btn');

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveClass('menu');
    expect(screen.getByRole('menuitem', { name: 'Remove from list' })).toHaveClass('menu-item-danger');
    await userEvent.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Remove from list' })).toHaveFocus());
    await userEvent.keyboard('{Enter}');

    expect(remove).toHaveBeenCalledOnce();
    expect(rename).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('tooltip shows on keyboard focus of an icon-only button', async () => {
    render(
      <Tooltip content="Close panel">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close panel">
          ×
        </button>
      </Tooltip>,
    );
    await userEvent.tab();

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Close panel');
  });
});

describe('US-071 AC-3: toasts', () => {
  const toast = (id: number, tone: Toast['tone'], text: string): Toast => ({ id, tone, text });

  it('info and success toasts dismiss themselves after 5 s; warnings and errors stay; errors are alerts', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toasts
        toasts={[toast(1, 'info', 'Run queued'), toast(2, 'success', 'US-001: run completed'), toast(3, 'danger', 'US-002: run failed')]}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('US-002: run failed');
    expect(screen.getByText('US-001: run completed').closest('.toast')).toHaveClass('toast', 'toast-success');
    expect(screen.getByText('US-001: run completed').closest('.toast')!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    act(() => vi.advanceTimersByTime(4900));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDismiss.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2]);
  });

  it('a toast may offer an action', async () => {
    const open = vi.fn();
    render(
      <Toasts
        toasts={[{ id: 1, tone: 'warning', text: 'US-003 asks to use Bash', action: { label: 'Open', onClick: open } }]}
        onDismiss={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalled();
  });
});

describe('US-071 AC-4: drawer', () => {
  function DrawerHarness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Open US-001
        </button>
        <button type="button" className="btn btn-secondary">
          Elsewhere
        </button>
        {open && (
          <Drawer
            title="US-001 Log in"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <p>Backlog</p>
          </Drawer>
        )}
      </>
    );
  }

  it('slides in as a non-modal panel, closes with Esc or Close and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(<DrawerHarness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open US-001' });
    await userEvent.click(opener);

    const drawer = await screen.findByRole('dialog', { name: 'US-001 Log in' });
    expect(drawer).toHaveClass('drawer');
    // Non-modal: the rest of the page stays usable.
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.getByRole('dialog', { name: 'US-001 Log in' })).toBeInTheDocument();

    drawer.focus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(opener).toHaveFocus());

    await userEvent.click(opener);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('US-071 AC-1/AC-4: existing dialogs and drawers use the shared components', () => {
  it('create-project dialog renders in the shared dialog; the pending-decisions drawer keeps its label', async () => {
    const { CreateProjectDialog } = await import('../src/projects/CreateProjectDialog.js');
    const { PendingDecisionsPanel } = await import('../src/pending/PendingDecisionsPanel.js');
    render(
      <>
        <CreateProjectDialog
          folder="C:\work\notes"
          gitAvailable
          onChangeFolder={async () => null}
          onCreate={async () => undefined}
          onCancel={() => undefined}
        />
        <PendingDecisionsPanel groups={[]} onDecide={async () => undefined} onOpenBoard={() => undefined} onClose={() => undefined} />
      </>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Create new project' });
    expect(dialog).toHaveClass('dialog');
    expect(document.querySelector('.dialog-overlay')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toHaveClass('btn-primary');
    expect(document.querySelector('.drawer[aria-label="Pending decisions (0)"]')).not.toBeNull();
  });
});
