// SPDX-License-Identifier: Apache-2.0
// Window close with active runs (US-049 AC-2): once the renderer has registered its close guard, the first close is
// prevented and the renderer asked; it confirms (runs interrupted), cancels, or — if it does not acknowledge in time
// (hung) — the window closes anyway. Without a registered guard (test mode, not loaded, renderer gone) it closes at once.

export interface CloseCoordinatorOptions {
  ask(): void;
  close(): void;
  ackTimeoutMs: number;
}

export class CloseCoordinator {
  private confirmed = false;
  private asking = false;
  private guarded = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: CloseCoordinatorOptions) {}

  /** The renderer registered (true) or lost (false: navigation, crash) its close guard. */
  setGuarded(guarded: boolean): void {
    this.guarded = guarded;
    if (!guarded && this.asking) this.onConfirmed();
  }

  /** From the window's `close` event: 'prevent' means call `event.preventDefault()`. */
  onCloseRequested(): 'allow' | 'prevent' {
    if (this.confirmed || !this.guarded) return 'allow';
    if (!this.asking) {
      this.asking = true;
      this.options.ask();
      this.timer = setTimeout(() => this.onConfirmed(), this.options.ackTimeoutMs);
    }
    return 'prevent';
  }

  /** The renderer handles the request (it may now show the dialog and wait for the user). */
  onAcknowledged(): void {
    clearTimeout(this.timer);
  }

  onConfirmed(): void {
    clearTimeout(this.timer);
    this.confirmed = true;
    this.options.close();
  }

  onCancelled(): void {
    clearTimeout(this.timer);
    this.asking = false;
  }
}
