// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryOutput } from '@specforge/ipc-contract';
import { cleanupChecked } from './styled-controls.js';
import { FeaturePage } from '../src/features/FeaturePage.js';
import { PhaseStepper } from '../src/shell/PhaseStepper.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

type Feature = NonNullable<QueryOutput<'features.get'>>;
const PHASES = ['intent', 'impact', 'requirements', 'design', 'stories', 'kanban', 'epic_review'] as const;

const feature = (over: Partial<Feature> = {}): Feature => ({
  id: 'FI-001',
  title: 'Task comments',
  approval: 'approved',
  status: 'in_delivery',
  sourceIdea: null,
  baseline: null,
  path: 'spec/01_intent/FI-001-task-comments.md',
  storyCount: 1,
  links: [
    { id: 'FR-040', type: 'introduces' },
    { id: 'US-010', type: 'introduces' },
  ],
  phases: PHASES.map((phase, i) => ({
    phase,
    state: i === 0 ? ('approved' as const) : phase === 'stories' ? ('awaiting_approval' as const) : ('not_started' as const),
    unapprovedEarlier: phase === 'stories' ? (['impact', 'requirements', 'design'] as const).slice() : [],
    enabled: true,
  })),
  current: 'impact',
  nextStep: 'Analyse the impact of FI-001',
  impact: null,
  decisions: [],
  progress: { done: 0, total: 1 },
  ...over,
});

async function renderPage(data: Feature | null = feature()) {
  const session = await fakeCore({
    'features.get': async () => data,
    'artifact.read': async () => ({ content: '---\nkind: feature_intent\n---\n## Problem\nNo comments.\n', hash: 'h' }),
  });
  const props = { onBack: vi.fn(), onOpenArtifact: vi.fn() };
  render(<FeaturePage session={session} projectId="p1" featureId="FI-001" {...props} />);
  return props;
}

describe('US-084 AC-1: feature page', () => {
  it('shows ID, title, status, the feature stepper and the tabs', async () => {
    const props = await renderPage();
    expect(await screen.findByRole('heading', { name: 'FI-001 Task comments' })).toBeInTheDocument();
    expect(screen.getByText('In delivery')).toBeInTheDocument();
    const stepper = screen.getByRole('navigation', { name: 'Feature phases' });
    expect(
      within(stepper)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Feature intent · approved',
      'Impact · not started',
      'Requirements (delta) · not started',
      'Design (delta) · not started',
      'Epic & stories · awaiting approval',
      'Kanban · not started',
      'Epic review · not started',
    ]);
    expect(within(stepper).getByRole('button', { name: /Impact/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Intent', 'Impact', 'Changes', 'Epic & stories', 'Activity']);
    expect(screen.getByRole('tab', { name: 'Impact' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: 'Intent' }));
    expect(await screen.findByText(/No comments\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    expect(props.onOpenArtifact).toHaveBeenCalledWith('spec/01_intent/FI-001-task-comments.md');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it('later tabs show empty states or the linked stories and the trace links', async () => {
    await renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Changes' }));
    expect(screen.getByRole('group', { name: 'Delta phase' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Epic & stories' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('US-010');
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('FR-040 introduces');
  });

  it('AC-2: soft gate — opening a phase with unapproved earlier phases warns but opens it', async () => {
    await renderPage();
    await userEvent.click(
      within(await screen.findByRole('navigation', { name: 'Feature phases' })).getByRole('button', { name: /Epic & stories/ }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Impact, Requirements (delta), Design (delta) not approved yet');
    expect(screen.getByRole('tab', { name: 'Epic & stories' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reports an unknown feature', async () => {
    await renderPage(null);
    expect(await screen.findByRole('alert')).toHaveTextContent('FI-001 no longer exists');
  });
});

describe('US-084 AC-4: maintenance in the project stepper', () => {
  it('shows Maintenance once all initial epics are Done', () => {
    const status = {
      phases: (['intent', 'requirements', 'design', 'stories', 'kanban'] as const).map((phase) => ({
        phase,
        state: 'approved' as const,
        step: 'approve' as const,
        enabled: true,
        unapprovedInputs: [],
      })),
      recommended: 'kanban' as const,
      maintenance: true,
    };
    render(<PhaseStepper status={status} current={null} onOpen={() => undefined} />);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });
});

describe('US-087 AC-2/AC-3: the Impact tab', () => {
  type View = QueryOutput<'impact.propose'>;
  const item = (id: string, category: View['items'][number]['category'], targetRef: string, origin: 'trace' | 'user' = 'trace') => ({
    id,
    projectId: 'p1',
    featureId: 'FI-001',
    category,
    targetRef,
    reason: origin === 'user' ? 'Added by you' : `Reason for ${targetRef}`,
    confidence: 'high' as const,
    origin,
    confirmed: false,
  });
  const view = (items: View['items'], state: View['state'] = 'proposed'): View => ({
    state,
    analysing: false,
    items,
    columns: {
      specs: items.filter((i) => ['requirement', 'design', 'adr'].includes(i.category)),
      work: items.filter((i) => i.category.startsWith('story') || i.category === 'epic'),
      code: items.filter((i) => i.category === 'run' || i.category === 'code_area'),
    },
  });

  it('proposes the impact, shows three columns, removes and adds items and approves the list', async () => {
    let current = view([item('a', 'requirement', 'FR-034'), item('b', 'story_done', 'US-008'), item('c', 'code_area', 'src/task.ts')]);
    const calls: string[] = [];
    const session = await fakeCore({
      'features.get': async () => feature({ impact: calls.includes('approve') ? current : null }),
      'impact.propose': async () => {
        calls.push('propose');
        return current;
      },
      'impact.remove': async ({ itemId }) => {
        calls.push(`remove ${itemId}`);
        current = view(current.items.filter((i) => i.id !== itemId));
        return current;
      },
      'impact.add': async ({ ref }) => {
        calls.push(`add ${ref}`);
        current = view([...current.items, item('d', 'code_area', ref, 'user')]);
        return current;
      },
      'impact.approve': async () => {
        calls.push('approve');
        current = view(
          current.items.map((i) => ({ ...i, confirmed: true })),
          'confirmed',
        );
        return current;
      },
    });
    render(<FeaturePage session={session} projectId="p1" featureId="FI-001" onBack={vi.fn()} onOpenArtifact={vi.fn()} />);

    const specs = await screen.findByRole('region', { name: 'Specs' });
    expect(calls).toEqual(['propose']);
    expect(within(specs).getByRole('listitem', { name: 'FR-034' })).toHaveTextContent('Reason for FR-034');
    expect(within(specs).getByRole('listitem', { name: 'FR-034' })).toHaveTextContent('high');
    expect(within(specs).getByRole('listitem', { name: 'FR-034' })).toHaveTextContent('trace');
    expect(screen.getByRole('region', { name: 'Work' })).toHaveTextContent('US-008');
    expect(screen.getByRole('region', { name: 'Code areas' })).toHaveTextContent('src/task.ts');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep US-008' }));
    expect(calls).toContain('remove b');
    expect(screen.queryByRole('checkbox', { name: 'Keep US-008' })).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add item' }), 'docs/api.md');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('listitem', { name: 'docs/api.md' })).toHaveTextContent('Added by you');

    await userEvent.click(screen.getByRole('button', { name: 'Approve impact' }));
    expect(await screen.findByText('Impact approved')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Keep FR-034' })).toBeDisabled();
  });
});

describe('US-091 AC-5: in-flight decisions on the Activity tab', () => {
  it('lists the decisions of the feature', async () => {
    const session = await fakeCore({
      'features.get': async () =>
        feature({ decisions: [{ storyId: 'US-011', decision: 'continue', decidedAt: '2026-11-20T10:00:00.000Z' }] }),
    });
    render(<FeaturePage session={session} projectId="p1" featureId="FI-001" onBack={vi.fn()} onOpenArtifact={vi.fn()} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('US-011: Continue unchanged');
  });
});
