// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-077 AC-2/AC-4 (FR-117, UF-08): Settings → Appearance with System / Light / Dark.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupChecked } from './styled-controls.js';
import { AppearanceSettings, type Theme } from '../src/settings/AppearanceSettings.js';

afterEach(cleanupChecked);

function bridge(initial: Theme) {
  let current = initial;
  return {
    get: vi.fn(async () => current),
    set: vi.fn(async (theme: Theme) => (current = theme)),
  };
}

describe('US-077 AC-2: Appearance setting', () => {
  it('shows the current theme and applies a new choice through the shell bridge', async () => {
    const theme = bridge('system');
    render(<AppearanceSettings theme={theme} />);

    const group = await screen.findByRole('radiogroup', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(theme.set).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('shows the error when the theme cannot be changed and keeps the previous choice', async () => {
    const theme = { get: vi.fn(async () => 'light' as Theme), set: vi.fn(async () => Promise.reject(new Error('not allowed'))) };
    render(<AppearanceSettings theme={theme} />);
    expect(await screen.findByRole('radio', { name: 'Light' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  });
});

describe('US-077 AC-1: unknown preference', () => {
  it('shows System when the current theme cannot be read', async () => {
    const theme = { get: vi.fn(async () => Promise.reject(new Error('no shell'))), set: vi.fn(async (t: Theme) => t) };
    render(<AppearanceSettings theme={theme} />);

    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked();
  });
});

describe('US-077 AC-4: keyboard', () => {
  it('is operable with Tab and the arrow keys', async () => {
    const theme = bridge('light');
    render(
      <>
        <button type="button" className="btn btn-secondary">
          before
        </button>
        <AppearanceSettings theme={theme} />
      </>,
    );
    await screen.findByRole('radio', { name: 'Light' });
    screen.getByRole('button', { name: 'before' }).focus();

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');

    expect(theme.set).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
