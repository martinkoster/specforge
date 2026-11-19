// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-076 (UF-05, UF-08, UF-13, NFR-005, NFR-033): run log ANSI palette, permission prompts, chat, settings sections.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnsiText, parseAnsi } from '../src/executions/ansi.js';
import { PermissionPrompt } from '../src/pending/PermissionPrompt.js';
import { SettingsNav } from '../src/settings/SettingsArea.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(cleanupChecked);

const TOKENS = readFileSync(join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');

/** Token values of the light (:root) and the dark (prefers-color-scheme) block. */
function themeTokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const darkStart = TOKENS.indexOf('@media (prefers-color-scheme: dark)');
  const read = (css: string) =>
    Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
  const light = read(TOKENS.slice(0, darkStart));
  return { light, dark: { ...light, ...read(TOKENS.slice(darkStart)) } };
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('US-076 AC-2: run log ANSI colours', () => {
  it('parses SGR colour and bold codes into styled segments and drops other escape sequences', () => {
    expect(parseAnsi('\u001b[32m✓ 12 passed\u001b[0m in 1.2s')).toEqual([
      { text: '✓ 12 passed', classes: ['ansi-green'] },
      { text: ' in 1.2s', classes: [] },
    ]);
    expect(parseAnsi('\u001b[1;91mFAIL\u001b[22m x\u001b[39m\u001b[2K done')).toEqual([
      { text: 'FAIL', classes: ['ansi-bold', 'ansi-red'] },
      { text: ' x', classes: ['ansi-red'] },
      { text: ' done', classes: [] },
    ]);
    expect(parseAnsi('plain')).toEqual([{ text: 'plain', classes: [] }]);
  });

  it('renders the segments; every palette colour meets AA on the log background in light and dark', () => {
    const { container } = render(<AnsiText text={'\u001b[33mwarn\u001b[0m ok'} />);
    expect(container.querySelector('.ansi-yellow')).toHaveTextContent('warn');
    expect(container).toHaveTextContent('warn ok');

    const { light, dark } = themeTokens();
    for (const [name, theme] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const colour of ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']) {
        const value = theme[`--ansi-${colour}`];
        expect(value, `${name} --ansi-${colour}`).toBeDefined();
        expect(contrast(value!, theme['--bg-subtle']!), `${name} ${colour}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('US-076 AC-3: permission prompts', () => {
  const permission = {
    id: 'perm-1',
    runId: 'run-12345678',
    toolName: 'Bash',
    input: { command: 'rm -rf ../other' },
    cwd: 'C:\\work\\tasks',
    outsideWorkspace: true,
    requestedAt: '2026-11-18T10:00:00.000Z',
  };

  it('ranks the decisions visually without changing their order; tool and command are mono; the risk is a callout', () => {
    render(
      <PermissionPrompt
        storyId="US-001"
        permission={{ ...permission, outsideWorkspace: false } as never}
        onDecide={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    const group = screen.getByRole('group', { name: 'US-001 asks to use Bash' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Allow', 'Deny', 'Always allow for this project']);
    expect(buttons[0]).toHaveClass('btn-primary');
    expect(buttons[1]).toHaveClass('btn-danger');
    expect(buttons[2]).toHaveClass('btn-secondary');
    expect(within(group).getByText('Bash')).toHaveClass('mono');
    cleanupChecked();

    render(<PermissionPrompt storyId="US-001" permission={permission as never} onDecide={vi.fn(async () => ({ ok: true as const }))} />);
    const risk = screen.getByRole('note');
    expect(risk).toHaveClass('callout', 'callout-warning');
    expect(risk).toHaveTextContent('Outside the workspace');
  });
});

describe('US-076 AC-4: settings navigation', () => {
  it('lists the settings sections as an in-page navigation', () => {
    const onSelect = vi.fn();
    render(
      <SettingsNav
        sections={[
          { id: 'appearance', label: 'Appearance' },
          { id: 'agent', label: 'Agent defaults' },
        ]}
        onSelect={onSelect}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    within(nav).getByRole('button', { name: 'Agent defaults' }).click();
    expect(onSelect).toHaveBeenCalledWith('agent');
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveClass('settings-nav-item');
  });
});
