// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSettingsForm } from '../src/settings/AgentSettingsForm.js';
import { ExecDefaultsForm } from '../src/settings/ExecDefaultsForm.js';

afterEach(cleanup);

const exec = {
  maxRunDurationS: 3600,
  idleTimeoutS: 600,
  notifications: true,
  logRetentionDays: 30,
  logLevel: 'info' as const,
  mergeCheckIntervalS: 60,
};

describe('US-015 AC-1: agent runtime settings', () => {
  it('edits model, effort, max turns and environment variables; secrets are masked and kept unless replaced', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(
      <AgentSettingsForm
        title="Agent defaults"
        settings={{
          model: 'claude-opus-5-5',
          effort: 'high',
          env: [
            { name: 'NPM_TOKEN', secret: true, value: null },
            { name: 'A', secret: false, value: '1' },
          ],
        }}
        modelSuggestions={['claude-opus-5-5', 'claude-sonnet-5-5']}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('claude-opus-5-5');
    const secretValue = screen.getByLabelText('Value of NPM_TOKEN');
    expect(secretValue).toHaveValue('');
    expect(secretValue).toHaveAttribute('placeholder', '•••••••• (unchanged)');
    expect(secretValue).toHaveAttribute('type', 'password');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'max');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Max turns' }), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    const rows = screen.getAllByRole('row').slice(1);
    await userEvent.type(within(rows[2]!).getByRole('textbox', { name: 'Variable name' }), 'API_KEY');
    await userEvent.click(within(rows[2]!).getByRole('checkbox', { name: 'Secret' }));
    await userEvent.type(within(rows[2]!).getByLabelText('Value of API_KEY'), 'k-123');
    await userEvent.click(screen.getByRole('button', { name: 'Save agent settings' }));

    expect(onSave).toHaveBeenCalledWith({
      model: 'claude-opus-5-5',
      effort: 'max',
      maxTurns: 25,
      env: [
        { name: 'NPM_TOKEN', secret: true },
        { name: 'A', secret: false, value: '1' },
        { name: 'API_KEY', secret: true, value: 'k-123' },
      ],
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('removes variables and shows validation errors from the core', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, errors: ['"1X" is not a valid environment variable name.'] }));
    render(
      <AgentSettingsForm
        title="Agent defaults"
        settings={{ env: [{ name: 'A', secret: false, value: '1' }] }}
        modelSuggestions={[]}
        onSave={onSave}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save agent settings' }));

    expect(onSave).toHaveBeenCalledWith({ env: [] });
    expect(await screen.findByRole('alert')).toHaveTextContent('not a valid environment variable name');
  });
});

describe('US-015 AC-2: execution defaults', () => {
  it('edits duration, idle timeout, notifications, retention and verbosity (applied to the next run)', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(<ExecDefaultsForm defaults={exec} onSave={onSave} />);
    expect(screen.getByText(/Changes apply to the next run/)).toBeInTheDocument();

    const duration = screen.getByRole('spinbutton', { name: 'Max run duration (minutes)' });
    await userEvent.clear(duration);
    await userEvent.type(duration, '90');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notifications' }));
    const retention = screen.getByRole('spinbutton', { name: 'Keep logs (days)' });
    await userEvent.clear(retention);
    await userEvent.type(retention, '14');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Log verbosity' }), 'debug');
    const mergeCheck = screen.getByRole('spinbutton', { name: 'Check for merged branches every (seconds)' });
    await userEvent.clear(mergeCheck);
    await userEvent.type(mergeCheck, '120');
    await userEvent.click(screen.getByRole('button', { name: 'Save execution defaults' }));

    expect(onSave).toHaveBeenCalledWith({
      maxRunDurationS: 5400,
      idleTimeoutS: 600,
      notifications: false,
      logRetentionDays: 14,
      logLevel: 'debug',
      mergeCheckIntervalS: 120,
    });
  });

  it('shows rejected values', async () => {
    render(
      <ExecDefaultsForm
        defaults={exec}
        onSave={vi.fn(async () => ({ ok: false as const, errors: ['Idle timeout must be at least 30 seconds.'] }))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save execution defaults' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Idle timeout must be at least 30 seconds.');
  });
});
