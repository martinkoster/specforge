// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcError, type ContractHandlers, type QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { IntentArea } from '../src/intent/IntentArea.js';
import { AdoptProjectDialog } from '../src/projects/AdoptProjectDialog.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

const INTENT = 'spec/01_intent/intent.md';
type Review = NonNullable<QueryOutput<'specs.review'>>;
const review = (over: Partial<Review> = {}): Review => ({
  runId: 'run-a',
  projectId: 'p1',
  target: 'spec',
  kind: 'analyze',
  instruction: 'Analyse the existing codebase.',
  snapshotId: 's',
  parentRunId: null,
  state: 'open',
  files: [{ path: INTENT, change: 'A' }],
  issues: [],
  reason: null,
  createdAt: '2026-11-19T10:00:00.000Z',
  ...over,
});

function intentHandlers(over: ContractHandlers = {}): ContractHandlers {
  return {
    'artifact.read': async () => {
      throw new IpcError('NOT_FOUND', 'not indexed');
    },
    'artifacts.list': async () => [],
    'clarify.current': async () => null,
    'quality.findings': async () => [],
    'specs.analysisAvailable': async () => ({ available: true }),
    'specs.openAnalysis': async () => null,
    ...over,
  };
}

describe('US-080 AC-1: "Analyse codebase" on the Intent screen', () => {
  it('starts the analysis (optionally limited to folders), waits for the review and keeps the drafts', async () => {
    let current: Review | null = null;
    const analyze = vi.fn(async () => {
      current = review({ state: 'running' });
      return { ok: true as const, runId: 'run-a' };
    });
    const keep = vi.fn(async () => {
      current = review({ state: 'kept' });
      return { ok: true as const };
    });
    const { session, server } = await fakeCoreWithEvents(
      intentHandlers({
        'specs.analyze': analyze,
        'specs.review': async () => current,
        'specs.keep': keep,
      }),
    );
    render(<IntentArea session={session} projectId="p1" />);

    await userEvent.type(await screen.findByRole('textbox', { name: 'Limit to folders' }), 'app, lib/core');
    await userEvent.click(screen.getByRole('button', { name: 'Analyse codebase' }));
    expect(analyze).toHaveBeenCalledWith({ projectId: 'p1', limitTo: ['app', 'lib/core'] });
    expect(await screen.findByText(/Analysing the codebase/)).toBeInTheDocument();

    current = review();
    await waitFor(() => {
      act(() => server.emit('spec.reviewReady', { projectId: 'p1', runId: 'run-a', state: 'open' }));
      expect(screen.getByRole('dialog', { name: 'Review changes in spec' })).toBeInTheDocument();
    });
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Review changes in spec' })).getByRole('button', { name: 'Keep' }));
    expect(keep).toHaveBeenCalledWith({ runId: 'run-a' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review changes in spec' })).toBeNull(), { timeout: 5_000 });
  });

  it('resumes an analysis started with the adoption and shows its review', async () => {
    const { session } = await fakeCoreWithEvents(
      intentHandlers({ 'specs.openAnalysis': async () => review(), 'specs.review': async () => review() }),
    );
    render(<IntentArea session={session} projectId="p1" />);

    expect(await screen.findByRole('button', { name: 'Review the analysis' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review the analysis' }));
    expect(screen.getByRole('dialog', { name: 'Review changes in spec' })).toBeInTheDocument();
  });

  it('is disabled with the explanation in limited mode and hidden without code or with an approved intent', async () => {
    const limited = await fakeCoreWithEvents(intentHandlers());
    const { unmount } = render(<IntentArea session={limited.session} projectId="p1" aiDisabledReason="No agent runtime configured." />);
    const button = await screen.findByRole('button', { name: 'Analyse codebase' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'No agent runtime configured.');
    unmount();

    const empty = await fakeCoreWithEvents(intentHandlers({ 'specs.analysisAvailable': async () => ({ available: false }) }));
    const second = render(<IntentArea session={empty.session} projectId="p1" />);
    await screen.findByRole('button', { name: 'Start from the template' });
    expect(screen.queryByRole('button', { name: 'Analyse codebase' })).toBeNull();
    second.unmount();

    const approved = await fakeCoreWithEvents(
      intentHandlers({
        'artifact.read': async () => ({ content: '---\nkind: intent\n---\n# Intent\n', hash: 'h1' }),
        'artifacts.list': async () => [
          { kind: 'intent', label: 'Intent', artifacts: [{ path: INTENT, approval: 'approved' as const, invalid: null }] },
        ],
      }),
    );
    render(<IntentArea session={approved.session} projectId="p1" />);
    await screen.findByRole('button', { name: /Approved/ }).catch(() => undefined);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Analyse codebase' })).toBeNull());
  });

  it('shows why the analysis could not start', async () => {
    const { session } = await fakeCoreWithEvents(
      intentHandlers({ 'specs.analyze': async () => ({ ok: false as const, reason: 'A specification run for spec is still running.' }) }),
    );
    render(<IntentArea session={session} projectId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyse codebase' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still running');
  });
});

describe('US-080 AC-1: "Analyse the codebase now" in the adopt dialog', () => {
  const folder = { path: '/code/shop', git: 'root' as const, suggestedSpecRoot: 'spec' };

  it('is checked by default and passed with the adoption', async () => {
    const onAdopt = vi.fn(async () => undefined);
    render(
      <AdoptProjectDialog
        folder={folder}
        gitAvailable
        checkSpecRoot={async () => null}
        onChangeFolder={async () => null}
        onAdopt={onAdopt}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Analyse the codebase now/ })).toBeChecked();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adopt' })).toBeEnabled());
    await userEvent.click(screen.getByRole('checkbox', { name: /Analyse the codebase now/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onAdopt).toHaveBeenCalledWith(expect.objectContaining({ path: '/code/shop' }), { analyze: false });
  });

  it('is disabled with the explanation in limited mode', () => {
    render(
      <AdoptProjectDialog
        folder={folder}
        gitAvailable
        aiDisabledReason="No agent runtime configured."
        checkSpecRoot={async () => null}
        onChangeFolder={async () => null}
        onAdopt={async () => undefined}
        onCancel={() => undefined}
      />,
    );
    const box = screen.getByRole('checkbox', { name: /Analyse the codebase now/ });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByText('No agent runtime configured.')).toBeInTheDocument();
  });
});

describe('US-082 AC-1: Add feature in the Intent area', () => {
  it('offers Add feature once the main intent is approved', async () => {
    const onAddFeature = vi.fn();
    const { session } = await fakeCoreWithEvents(
      intentHandlers({
        'artifact.read': async () => ({ content: '---\nkind: intent\n---\n# Intent\n', hash: 'h1' }),
        'artifacts.list': async () => [
          { kind: 'intent', label: 'Intent', artifacts: [{ path: INTENT, approval: 'approved' as const, invalid: null }] },
        ],
      }),
    );
    render(<IntentArea session={session} projectId="p1" onAddFeature={onAddFeature} />);
    await userEvent.click(await screen.findByRole('button', { name: '＋ Add feature' }));
    expect(onAddFeature).toHaveBeenCalled();
  });
});
