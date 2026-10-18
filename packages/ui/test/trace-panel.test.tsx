// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractHandlers } from '@specforge/ipc-contract';
import { TracePanel, elementIdsOf } from '../src/specs/TracePanel.js';
import { closeFakeCores, fakeCore } from './fake-core.js';

afterEach(() => {
  cleanup();
  closeFakeCores();
});

const traces: Record<string, unknown> = {
  'element:US-001': {
    node: { kind: 'story', id: 'US-001', label: 'US-001: Login form', path: 'spec/04_user_stories/US-001.md', exists: true },
    upstream: [
      { kind: 'element', id: 'FR-001', label: 'FR-001: Login', path: 'spec/02_requirements/fr.md', exists: true },
      { kind: 'element', id: 'FR-404', label: 'FR-404', exists: false },
    ],
    downstream: [{ kind: 'run', id: 'r1', label: 'Run 2026-10-16 10:00 (completed)', exists: true }],
    issues: ['US-001 references FR-404, which does not exist.'],
  },
  'run:r1': {
    node: { kind: 'run', id: 'r1', label: 'Run 2026-10-16 10:00 (completed)', exists: true },
    upstream: [{ kind: 'story', id: 'US-001', label: 'US-001: Login form', path: 'spec/04_user_stories/US-001.md', exists: true }],
    downstream: [{ kind: 'file', id: 'src/login.ts', label: 'src/login.ts', runId: 'r1', exists: true }],
    issues: [],
  },
};

async function renderPanel(handlers: ContractHandlers = {}) {
  const onNavigate = vi.fn();
  const session = await fakeCore({
    'trace.get': async ({ target }) => traces[`${target.kind}:${target.id}`] as never,
    'review.fileVersions': async () => ({ before: 'old\n', after: 'new\n', binary: false }),
    ...handlers,
  });
  render(<TracePanel session={session} projectId="p1" elements={['US-001']} onNavigate={onNavigate} />);
  return { onNavigate, panel: await screen.findByRole('region', { name: 'Trace' }) };
}

describe('US-034 AC-1: upstream and downstream links', () => {
  it('shows the links of the selected element; unknown references are marked and listed as issues (AC-3)', async () => {
    const { panel } = await renderPanel();
    const up = await within(panel).findByRole('list', { name: 'Upstream' });
    expect(
      within(up)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['FR-001: Login', 'FR-404 (unknown)']);
    expect(within(panel).getByRole('list', { name: 'Downstream' })).toHaveTextContent('Run 2026-10-16 10:00 (completed)');
    expect(within(panel).getByRole('list', { name: 'Issues' })).toHaveTextContent('US-001 references FR-404, which does not exist.');
  });

  it('extracts the element IDs of an artifact (headings and story front-matter)', () => {
    expect(elementIdsOf('---\nkind: story\nid: US-007\n---\n# x')).toEqual(['US-007']);
    expect(elementIdsOf('### FR-001: A\ntext\n## FR-002: B')).toEqual(['FR-001', 'FR-002']);
  });
});

describe('US-034 AC-2: navigation', () => {
  it('elements navigate to their artifact; runs open their own trace; files open as diff or in the editor', async () => {
    const openFile = vi.fn(async () => ({ ok: true as const }));
    const { panel, onNavigate } = await renderPanel({ 'review.openFile': openFile });
    await userEvent.click(await within(panel).findByRole('button', { name: 'FR-001: Login' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'FR-001', path: 'spec/02_requirements/fr.md' }));
    expect(within(panel).getByRole('button', { name: 'FR-404 (unknown)' })).toBeDisabled();

    await userEvent.click(within(panel).getByRole('button', { name: 'Run 2026-10-16 10:00 (completed)' }));
    const down = await within(panel).findByRole('list', { name: 'Downstream' });
    expect(within(down).getByText('src/login.ts')).toBeInTheDocument();

    await userEvent.click(within(down).getByRole('button', { name: 'Diff of src/login.ts' }));
    expect(await within(panel).findByTestId('diff-view')).toBeInTheDocument();
    await userEvent.click(within(down).getByRole('button', { name: 'Open src/login.ts in editor' }));
    expect(openFile).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', runId: 'r1', path: 'src/login.ts' }));

    await userEvent.click(within(panel).getByRole('button', { name: 'Back' }));
    expect(await within(panel).findByRole('list', { name: 'Upstream' })).toHaveTextContent('FR-001: Login');
  });
});

describe('US-034 AC-1: a story, run or file as the trace root', () => {
  it('traces a run directly (board drawer and executions view)', async () => {
    const session = await fakeCore({ 'trace.get': async ({ target }) => traces[`${target.kind}:${target.id}`] as never });
    render(<TracePanel session={session} projectId="p1" elements={[]} root={{ kind: 'run', id: 'r1' }} onNavigate={vi.fn()} />);
    const panel = await screen.findByRole('region', { name: 'Trace' });
    const down = await within(panel).findByRole('list', { name: 'Downstream' });
    expect(within(down).getByText('src/login.ts')).toBeInTheDocument();
    expect(within(panel).queryByText(/no element IDs/)).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});
