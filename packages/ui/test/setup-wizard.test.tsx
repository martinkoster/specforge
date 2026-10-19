// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import type { ContractHandlers } from '@specforge/ipc-contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupWizard } from '../src/setup/SetupWizard.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

type Status = 'ok' | 'warning' | 'missing' | 'skipped';
type StepId = 'runtime' | 'provider' | 'git' | 'rules' | 'defaults' | 'summary';

const LABELS: Record<StepId, string> = {
  runtime: 'Agent runtime',
  provider: 'AI provider',
  git: 'Git',
  rules: 'Tools allowed without asking',
  defaults: 'Execution defaults',
  summary: 'Ready',
};

function core(extra: ContractHandlers = {}) {
  const statuses: Record<StepId, Status> = {
    runtime: 'missing',
    provider: 'missing',
    git: 'ok',
    rules: 'warning',
    defaults: 'ok',
    summary: 'warning',
  };
  const calls: string[] = [];
  const handlers: ContractHandlers = {
    'setup.state': async () => ({
      setupState: 'not_started',
      steps: (Object.keys(statuses) as StepId[]).map((id) => ({ id, label: LABELS[id], status: statuses[id], detail: `${id} detail` })),
    }),
    'runtime.detect': async () => {
      calls.push('detect');
      statuses.runtime = 'ok';
      return { found: true, path: '/usr/bin/claude', version: '2.1.299' };
    },
    'runtime.verify': async ({ path }) => {
      calls.push(`verify ${path}`);
      return { ok: false, error: 'not_found', message: `No file at ${path}.` };
    },
    'setup.saveProvider': async ({ provider }) => {
      calls.push(`provider ${provider.kind}`);
      return { ok: true };
    },
    'setup.testConnection': async () => {
      calls.push('test');
      statuses.provider = 'ok';
      return { ok: true };
    },
    'setup.ruleSuggestions': async () => [
      { key: 'read-search', label: 'Read & search files', enabled: false },
      { key: 'command:npm test', label: 'Run npm test', enabled: false },
    ],
    'setup.enableRules': async ({ keys }) => {
      calls.push(`rules ${keys.join(',')}`);
      return { created: keys.length };
    },
    'setup.skipStep': async ({ step }) => {
      calls.push(`skip ${step}`);
      statuses[step] = 'skipped';
      return {};
    },
    'setup.complete': async () => {
      calls.push('complete');
      return {};
    },
    'setup.skip': async () => {
      calls.push('skip setup');
      return {};
    },
    'settings.get': async () => ({
      global: { env: [] },
      project: null,
      effective: { env: [] },
      exec: {
        maxRunDurationS: 3600,
        idleTimeoutS: 600,
        notifications: true,
        logRetentionDays: 30,
        logLevel: 'info',
        mergeCheckIntervalS: 60,
      },
      modelSuggestions: [],
    }),
    'settings.saveExec': async () => {
      calls.push('exec');
      return { ok: true };
    },
    ...extra,
  };
  return { handlers, calls, statuses };
}

async function renderWizard(extra: ContractHandlers = {}) {
  const c = core(extra);
  const onDone = vi.fn();
  render(<SetupWizard session={await fakeCore(c.handlers)} onDone={onDone} />);
  await screen.findByRole('navigation', { name: 'Setup steps' });
  return { ...c, onDone };
}

const nav = () => screen.getByRole('navigation', { name: 'Setup steps' });
const step = (name: string) => within(nav()).getByRole('button', { name: new RegExp(`^${name}`) });

describe('US-012 AC-1: setup steps with status', () => {
  it('shows runtime, provider, Git, rules, defaults and summary with their status', async () => {
    await renderWizard();

    expect(
      within(nav())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Agent runtime — missing',
      'AI provider — missing',
      'Git — OK',
      'Tools allowed without asking — warning',
      'Execution defaults — OK',
      'Ready — warning',
    ]);
  });

  it('runtime step: re-detects and verifies a manually entered path with a specific error', async () => {
    const { calls } = await renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Re-check' }));
    expect(await within(nav()).findByText('Agent runtime — OK')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Path to Claude Code' }), '/opt/claude');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No file at /opt/claude.');
    expect(calls).toEqual(['detect', 'verify /opt/claude']);
  });
});

describe('US-012 AC-2: AI provider', () => {
  it('saves an API key and runs the connection test with a clear result', async () => {
    const { calls } = await renderWizard();
    await userEvent.click(step('AI provider'));

    expect(screen.getByText(/sends your prompts and code to this provider. SpecForge itself sends nothing/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('API key'), 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: 'Save and test connection' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Connection test succeeded.');
    expect(calls).toEqual(['provider anthropic_api_key', 'test']);
  });

  it('shows the connection error', async () => {
    await renderWizard({ 'setup.testConnection': async () => ({ ok: false, error: 'Invalid API key (401).' }) });
    await userEvent.click(step('AI provider'));
    await userEvent.type(screen.getByLabelText('API key'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Save and test connection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connection test failed: Invalid API key (401).');
  });

  it('configures a cloud provider (Bedrock)', async () => {
    const { calls } = await renderWizard();
    await userEvent.click(step('AI provider'));
    await userEvent.click(screen.getByRole('radio', { name: 'Amazon Bedrock' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'AWS region' }), 'eu-central-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save and test connection' }));

    await screen.findByRole('status');
    expect(calls[0]).toBe('provider bedrock');
  });
});

describe('US-012: rules and defaults steps', () => {
  it('offers suggested rules unticked and enables the chosen ones', async () => {
    const { calls } = await renderWizard();
    await userEvent.click(step('Tools allowed without asking'));

    const box = await screen.findByRole('checkbox', { name: 'Run npm test' });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Everything else will ask you first. Actions outside the workspace always ask./)).toBeInTheDocument();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));

    expect(await screen.findByText('1 rule enabled.')).toBeInTheDocument();
    expect(calls).toEqual(['rules command:npm test']);
  });

  it('saves execution defaults', async () => {
    const { calls } = await renderWizard();
    await userEvent.click(step('Execution defaults'));
    await userEvent.click(await screen.findByRole('button', { name: 'Save execution defaults' }));
    expect(calls).toEqual(['exec']);
  });
});

describe('US-012 AC-3/AC-4: finish and skip', () => {
  it('Finish records the setup as complete and continues', async () => {
    const { calls, onDone } = await renderWizard();
    await userEvent.click(step('Ready'));
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(calls).toEqual(['complete']);
    expect(onDone).toHaveBeenCalled();
  });

  it('a step can be skipped', async () => {
    const { calls } = await renderWizard();
    await userEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    expect(await within(nav()).findByText('Agent runtime — skipped')).toBeInTheDocument();
    expect(calls).toEqual(['skip runtime']);
  });

  it('"Skip setup" asks for confirmation, records it and continues', async () => {
    const { calls, onDone } = await renderWizard();
    await userEvent.click(screen.getByRole('button', { name: 'Skip setup' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('AI features will be disabled until setup is complete');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip setup' }));

    expect(calls).toEqual(['skip setup']);
    expect(onDone).toHaveBeenCalled();
  });
});
