// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { ChangesPanel } from '../src/features/ChangesPanel.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type View = NonNullable<QueryOutput<'delta.changeSet'>>;
const item = (id: string, kind: View['items'][number]['kind'], elementId: string | null, path = 'spec/02_requirements/fr.md') => ({
  id,
  changeSetId: 'cs1',
  path,
  elementId,
  kind,
  before: kind === 'new' ? null : 'old\n',
  after: 'new\n',
  patch: `@@ -1 +1 @@\n-old\n+new ${id}\n`,
  state: 'open' as const,
});
const changeSet = (items: View['items'], state: View['state'] = 'open', reason: string | null = null): View => ({
  id: 'cs1',
  projectId: 'p1',
  featureId: 'FI-001',
  phase: 'requirements',
  runId: 'r1',
  state,
  reason,
  createdAt: 't',
  items,
});

describe('US-089 AC-1/AC-3: the Changes tab', () => {
  it('generates the delta, shows the change set grouped by file with badges and accepts / discards items', async () => {
    let current: View | null = null;
    const calls: string[] = [];
    const { session, server } = await fakeCoreWithEvents({
      'delta.changeSet': async ({ phase }) => (phase === 'requirements' ? current : null),
      'delta.generate': async ({ phase }) => {
        calls.push(`generate ${phase}`);
        current = changeSet([], 'running');
        return { ok: true as const, runId: 'r1' };
      },
      'delta.decide': async ({ itemId, decision }) => {
        calls.push(`${decision} ${itemId}`);
        current = changeSet(
          current!.items.map((i) =>
            i.id === itemId ? { ...i, state: decision === 'accept' ? ('accepted' as const) : ('discarded' as const) } : i,
          ),
        );
        return current;
      },
      'delta.acceptAll': async () => {
        calls.push('acceptAll');
        current = changeSet(current!.items.map((i) => (i.state === 'open' ? { ...i, state: 'accepted' as const } : i)));
        return current;
      },
    });
    render(<ChangesPanel session={session} projectId="p1" featureId="FI-001" initialPhase="requirements" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Generate delta' }));
    expect(calls).toEqual(['generate requirements']);
    expect(await screen.findByText(/Generating the delta/)).toBeInTheDocument();

    current = changeSet([
      item('a', 'new', 'FR-118'),
      item('b', 'modified', 'FR-034'),
      item('c', 'deprecated', 'FR-020'),
      item('d', 'modified', null, 'spec/02_requirements/summary.md'),
    ]);
    act(() => server.emit('features.deltaUpdated', { projectId: 'p1', featureId: 'FI-001' }));
    const file = await screen.findByRole('region', { name: 'spec/02_requirements/fr.md' });
    expect(
      within(file)
        .getAllByRole('listitem')
        .map((li) => within(li).getByText(/^(New|Modified|Deprecated|Other)/).textContent),
    ).toEqual(['New FR-118', 'Modified FR-034', 'Deprecated FR-020']);
    expect(within(file).getByText('+new a')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'spec/02_requirements/summary.md' })).toHaveTextContent('Other changes');

    await userEvent.click(within(file).getByRole('button', { name: 'Accept FR-118' }));
    await userEvent.click(within(file).getByRole('button', { name: 'Discard FR-020' }));
    await waitFor(() => expect(within(file).getByRole('listitem', { name: 'FR-118' })).toHaveTextContent('Accepted'));
    expect(within(file).getByRole('listitem', { name: 'FR-020' })).toHaveTextContent('Discarded');
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    await waitFor(() => expect(calls).toEqual(['generate requirements', 'accept a', 'discard c', 'acceptAll']));
  });

  it('switches to the design delta, shows a failed generation and is disabled in limited mode', async () => {
    const { session } = await fakeCoreWithEvents({
      'delta.changeSet': async ({ phase }) =>
        phase === 'design' ? changeSet([], 'failed', 'FR-020 was deleted — deprecate elements instead.') : null,
    });
    render(
      <ChangesPanel session={session} projectId="p1" featureId="FI-001" initialPhase="requirements" aiDisabledReason="No agent runtime." />,
    );

    const generate = await screen.findByRole('button', { name: 'Generate delta' });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAttribute('title', 'No agent runtime.');
    await userEvent.click(screen.getByRole('button', { name: 'Design (delta)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('FR-020 was deleted');
  });
});

describe('US-090: applying the accepted changes', () => {
  it('applies once every item is decided, opens changed artifacts and shows conflicts', async () => {
    let current: View = changeSet([
      { ...item('a', 'new', 'FR-118'), state: 'accepted' },
      { ...item('b', 'modified', 'FR-034'), state: 'discarded' },
    ]);
    let conflicts: string[] = [];
    const onOpenArtifact = vi.fn();
    const { session } = await fakeCoreWithEvents({
      'delta.changeSet': async () => current,
      'delta.apply': async () => {
        if (conflicts.length === 0)
          current = {
            ...current,
            state: 'applied',
            items: current.items.map((i) => (i.state === 'accepted' ? { ...i, state: 'applied' as const } : i)),
          };
        return { applied: conflicts.length ? [] : ['spec/02_requirements/fr.md'], conflicts };
      },
    });
    render(
      <ChangesPanel session={session} projectId="p1" featureId="FI-001" initialPhase="requirements" onOpenArtifact={onOpenArtifact} />,
    );

    conflicts = ['spec/02_requirements/fr.md'];
    await userEvent.click(await screen.findByRole('button', { name: 'Apply accepted changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Changed since the generation: spec/02_requirements/fr.md');

    conflicts = [];
    await userEvent.click(screen.getByRole('button', { name: 'Apply accepted changes' }));
    expect(await screen.findByText(/Applied\. Review and approve the changed artifacts/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'FR-118' })).toHaveTextContent('Applied');
    await userEvent.click(screen.getByRole('button', { name: 'Open spec/02_requirements/fr.md' }));
    expect(onOpenArtifact).toHaveBeenCalledWith('spec/02_requirements/fr.md');
  });
});

describe('US-091 AC-1: in-flight decisions when applying', () => {
  it('requires a choice per affected story; Cancel applies nothing; the decisions go with the apply', async () => {
    const current: View = changeSet([{ ...item('a', 'modified', 'FR-020'), state: 'accepted' }]);
    const applies: unknown[] = [];
    const { session } = await fakeCoreWithEvents({
      'delta.changeSet': async () => current,
      'delta.apply': async (input) => {
        applies.push(input);
        if (!input.decisions)
          return {
            needsDecision: [
              { storyId: 'US-011', title: 'Export view', status: 'in_progress', subState: 'running', changes: ['changed FR-020'] },
              { storyId: 'US-012', title: 'Export file', status: 'review', subState: 'none', changes: ['changed FR-020'] },
            ],
          };
        return { applied: ['spec/02_requirements/fr.md'], conflicts: [] };
      },
    });
    render(<ChangesPanel session={session} projectId="p1" featureId="FI-001" initialPhase="requirements" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Apply accepted changes' }));
    let dialog = await screen.findByRole('dialog', { name: 'Stories in flight' });
    expect(within(dialog).getByRole('group', { name: 'US-011 Export view' })).toHaveTextContent('In progress (running) · changed FR-020');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Stories in flight' })).toBeNull();
    expect(applies).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Apply accepted changes' }));
    dialog = await screen.findByRole('dialog', { name: 'Stories in flight' });
    const apply = within(dialog).getByRole('button', { name: 'Apply' });
    await userEvent.click(
      within(within(dialog).getByRole('group', { name: 'US-011 Export view' })).getByRole('radio', { name: 'Continue unchanged' }),
    );
    expect(apply).toBeDisabled();
    await userEvent.click(
      within(within(dialog).getByRole('group', { name: 'US-012 Export file' })).getByRole('radio', { name: 'Apply in corrections' }),
    );
    await userEvent.click(apply);
    await waitFor(() =>
      expect(applies.at(-1)).toEqual({ changeSetId: 'cs1', decisions: { 'US-011': 'continue', 'US-012': 'apply_in_corrections' } }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Stories in flight' })).toBeNull());
  });
});
