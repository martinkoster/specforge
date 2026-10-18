// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectiveRules, type EffectiveRuleRow } from '../src/settings/EffectiveRules.js';

afterEach(cleanup);

const rules: EffectiveRuleRow[] = [
  { id: 'g1', effect: 'allow', toolName: 'Read', pattern: null, appliesTo: 'all', origin: 'global', disabled: false },
  { id: 'g2', effect: 'allow', toolName: 'Bash', pattern: 'npm test', appliesTo: 'implementation', origin: 'global', disabled: true },
  { id: 'p1', effect: 'deny', toolName: 'Bash', pattern: 'npm publish', appliesTo: 'all', origin: 'project', disabled: false },
];

describe('US-014 AC-3: settings show effective rules with their origin', () => {
  it('lists each rule with effect, tool, pattern, scope of use and origin', () => {
    render(<EffectiveRules rules={rules} onToggleGlobal={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Effective approval rules' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(
      rows.map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['Allow', 'Read', 'any input', 'all runs', 'Global', 'Active'],
      ['Allow', 'Bash', 'npm test', 'implementation runs', 'Global', 'Disabled for this project'],
      ['Deny', 'Bash', 'npm publish', 'all runs', 'Project', 'Active'],
    ]);
  });

  it('lets the project disable and re-enable a global rule; project rules have no toggle', async () => {
    const onToggleGlobal = vi.fn();
    render(<EffectiveRules rules={rules} onToggleGlobal={onToggleGlobal} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Use global rule Allow Read in this project' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Use global rule Allow Bash npm test in this project' }));

    expect(onToggleGlobal.mock.calls).toEqual([
      ['g1', true],
      ['g2', false],
    ]);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('explains that there are no rules yet', () => {
    render(<EffectiveRules rules={[]} onToggleGlobal={vi.fn()} />);
    expect(screen.getByText(/No approval rules — every agent request is relayed to you/)).toBeInTheDocument();
  });
});
