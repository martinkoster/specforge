// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { CloseCoordinator } from '../src/close-coordinator.js';

const guarded = (c: CloseCoordinator) => {
  c.setGuarded(true);
  return c;
};

describe('US-049 AC-2: closing the window asks the renderer about active runs first', () => {
  it('prevents the first close and asks the renderer; a confirmation closes for real', () => {
    const ask = vi.fn();
    const close = vi.fn();
    const c = guarded(new CloseCoordinator({ ask, close, ackTimeoutMs: 5000 }));

    expect(c.onCloseRequested()).toBe('prevent');
    expect(ask).toHaveBeenCalledOnce();
    c.onConfirmed();
    expect(close).toHaveBeenCalledOnce();
    expect(c.onCloseRequested()).toBe('allow');
  });

  it('closes anyway when the renderer does not acknowledge (crashed or not loaded)', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const c = guarded(new CloseCoordinator({ ask: vi.fn(), close, ackTimeoutMs: 5000 }));

    c.onCloseRequested();
    vi.advanceTimersByTime(5000);

    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('waits for the user once the renderer acknowledged; "keep running" allows a later close request again', () => {
    vi.useFakeTimers();
    const ask = vi.fn();
    const close = vi.fn();
    const c = guarded(new CloseCoordinator({ ask, close, ackTimeoutMs: 5000 }));

    c.onCloseRequested();
    c.onAcknowledged();
    vi.advanceTimersByTime(60_000);
    expect(close).not.toHaveBeenCalled();

    c.onCancelled();
    expect(c.onCloseRequested()).toBe('prevent');
    expect(ask).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('closes immediately while no renderer guard is registered (test mode, page not loaded, renderer gone)', () => {
    const ask = vi.fn();
    const c = new CloseCoordinator({ ask, close: vi.fn(), ackTimeoutMs: 5000 });
    expect(c.onCloseRequested()).toBe('allow');

    c.setGuarded(true);
    c.setGuarded(false);
    expect(c.onCloseRequested()).toBe('allow');
    expect(ask).not.toHaveBeenCalled();
  });
});
