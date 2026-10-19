// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseGuard, type CloseBridge } from '../src/shell/CloseGuard.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

function bridge() {
  let request: (() => void) | undefined;
  const b: CloseBridge & { request(): void } = {
    onCloseRequested: (listener) => void (request = listener),
    acknowledge: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    request: () => request?.(),
  };
  return b;
}

describe('US-049 AC-2: close dialog', () => {
  it('closes immediately when no run is active', async () => {
    const b = bridge();
    const session = await fakeCore({ 'runs.active': async () => [] });
    render(<CloseGuard session={session} bridge={b} />);

    await act(async () => b.request());

    await vi.waitFor(() => expect(b.confirm).toHaveBeenCalled());
    expect(b.acknowledge).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('lists active runs; confirming interrupts them and closes', async () => {
    const b = bridge();
    const interrupted: string[] = [];
    const session = await fakeCore({
      'runs.active': async () => [{ runId: 'r1', projectId: 'p1', storyId: 'US-001', title: 'Login' }],
      'runs.interruptAll': async () => {
        interrupted.push('all');
        return {};
      },
    });
    render(<CloseGuard session={session} bridge={b} />);

    await act(async () => b.request());
    const dialog = await screen.findByRole('alertdialog', { name: 'Runs are still active' });
    expect(within(dialog).getByText('US-001 Login')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop runs and close' }));

    await vi.waitFor(() => expect(b.confirm).toHaveBeenCalled());
    expect(interrupted).toEqual(['all']);
  });

  it('"Keep running" cancels the close', async () => {
    const b = bridge();
    const session = await fakeCore({ 'runs.active': async () => [{ runId: 'r1', projectId: 'p1', storyId: 'US-001', title: 'Login' }] });
    render(<CloseGuard session={session} bridge={b} />);

    await act(async () => b.request());
    await userEvent.click(await screen.findByRole('button', { name: 'Keep running' }));

    expect(b.cancel).toHaveBeenCalled();
    expect(b.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
