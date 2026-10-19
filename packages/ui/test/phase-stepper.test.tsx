// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhaseStepper, type PhaseStatus } from '../src/shell/PhaseStepper.js';

afterEach(cleanup);

const status: PhaseStatus = {
  phases: [
    { phase: 'intent', state: 'approved', step: 'approve', enabled: true, unapprovedInputs: [] },
    { phase: 'requirements', state: 'awaiting_approval', step: 'quality_check', enabled: true, unapprovedInputs: [] },
    { phase: 'design', state: 'not_started', step: 'write', enabled: true, unapprovedInputs: ['requirements'] },
    { phase: 'stories', state: 'not_started', step: 'write', enabled: true, unapprovedInputs: ['requirements', 'design'] },
    { phase: 'kanban', state: 'not_started', step: 'write', enabled: false, unapprovedInputs: ['requirements', 'design', 'stories'] },
  ],
  recommended: 'requirements',
};

describe('US-033: phase stepper', () => {
  it('AC-1/AC-4: five phases with status and the recommended phase; Kanban is disabled without stories', () => {
    render(<PhaseStepper status={status} current="requirements" onOpen={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: 'Phases' });
    const steps = within(nav).getAllByRole('button');
    expect(steps.map((s) => s.textContent)).toEqual([
      'Intent · approved',
      'Requirements · awaiting approval (recommended)',
      'Design · not started',
      'User stories · not started',
      'Kanban · not started',
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[4]).toBeDisabled();
    expect(steps[4]).toHaveAttribute('title', 'Available once user stories exist.');
  });

  it('AC-2: shows the phase loop of the current phase with its step highlighted', () => {
    render(<PhaseStepper status={status} current="requirements" onOpen={() => undefined} />);
    const loop = screen.getByRole('list', { name: 'Requirements loop' });
    expect(
      within(loop)
        .getAllByRole('listitem')
        .map((li) => [li.textContent, li.getAttribute('aria-current')]),
    ).toEqual([
      ['Write / Generate', null],
      ['Quality check', 'step'],
      ['Review & refine', null],
      ['Approve', null],
    ]);
  });

  it('AC-3: opening a phase with unapproved inputs asks first (continue / go back)', async () => {
    const onOpen = vi.fn();
    render(<PhaseStepper status={status} current="requirements" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /^Design/ }));
    const gate = screen.getByRole('alertdialog', { name: 'Inputs not approved yet' });
    expect(gate).toHaveTextContent('Requirements is not approved yet');
    await userEvent.click(within(gate).getByRole('button', { name: 'Go back' }));
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^Design/ }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Continue' }));
    expect(onOpen).toHaveBeenCalledWith('design');

    await userEvent.click(screen.getByRole('button', { name: /^Intent/ }));
    expect(onOpen).toHaveBeenLastCalledWith('intent');
  });
});
