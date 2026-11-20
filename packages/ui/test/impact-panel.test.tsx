// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { ImpactPanel } from '../src/features/ImpactPanel.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type View = QueryOutput<'impact.view'>;
const item = (id: string, targetRef: string, origin: 'trace' | 'agent', confidence: 'high' | 'medium' = 'high') => ({
  id,
  projectId: 'p1',
  featureId: 'FI-001',
  category: 'design' as const,
  targetRef,
  reason: `Reason ${targetRef}`,
  confidence,
  origin,
  confirmed: false,
});
const view = (items: View['items'], analysing: boolean): View => ({
  state: analysing ? 'analysing' : 'proposed',
  items,
  columns: { specs: items, work: [], code: [] },
  analysing,
});

describe('US-088: AI impact analysis in the Impact tab', () => {
  it('AC-1/AC-2: starts the analysis in the background, keeps the trace items usable and shows streamed AI items', async () => {
    let current = view([item('a', 'FR-034', 'trace')], false);
    const calls: string[] = [];
    const { session, server } = await fakeCoreWithEvents({
      'impact.analyse': async () => {
        calls.push('analyse');
        current = view(current.items, true);
        return { ok: true as const, runId: 'run-1' };
      },
      'impact.view': async () => current,
      'impact.cancel': async () => {
        calls.push('cancel');
        current = view(current.items, false);
        return {};
      },
      'impact.remove': async () => current,
    });
    render(<ImpactPanel session={session} projectId="p1" featureId="FI-001" initial={current} approved onApproved={vi.fn()} />);

    await waitFor(() => expect(calls).toEqual(['analyse']));
    expect(await screen.findByText('Analysing code…')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Keep FR-034' })).toBeEnabled();

    current = view([...current.items, item('b', 'UC-010', 'agent', 'medium')], true);
    act(() => server.emit('features.impactUpdated', { projectId: 'p1', featureId: 'FI-001' }));
    const ai = await screen.findByRole('listitem', { name: 'UC-010' });
    expect(within(ai).getByText('AI')).toBeInTheDocument();
    expect(within(ai).getByText('medium')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel analysis' }));
    await waitFor(() => expect(calls).toContain('cancel'));
    act(() => server.emit('features.impactUpdated', { projectId: 'p1', featureId: 'FI-001' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Re-run analysis' }));
    await waitFor(() => expect(calls.filter((c) => c === 'analyse')).toHaveLength(2));
  });

  it('AC-3: in limited mode only the trace part is available, with an explanation', async () => {
    const analyse = vi.fn();
    const { session } = await fakeCoreWithEvents({ 'impact.analyse': analyse });
    render(
      <ImpactPanel
        session={session}
        projectId="p1"
        featureId="FI-001"
        initial={view([item('a', 'FR-034', 'trace')], false)}
        approved
        aiDisabledReason="No agent runtime configured."
        onApproved={vi.fn()}
      />,
    );
    expect(await screen.findByText(/AI analysis is unavailable: No agent runtime configured\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-run analysis' })).toBeNull();
    expect(analyse).not.toHaveBeenCalled();
  });

  it('does not start the analysis for a Draft feature', async () => {
    const analyse = vi.fn();
    const { session } = await fakeCoreWithEvents({ 'impact.analyse': analyse });
    render(
      <ImpactPanel
        session={session}
        projectId="p1"
        featureId="FI-001"
        initial={view([item('a', 'FR-034', 'trace')], false)}
        approved={false}
        onApproved={vi.fn()}
      />,
    );
    await screen.findByRole('checkbox', { name: 'Keep FR-034' });
    expect(analyse).not.toHaveBeenCalled();
  });
});
