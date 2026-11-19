// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-070 (NFR-033, NFR-020, ui_design_concept.md §2.1, §5, §5.1): status badges, callouts, pills, tags, icons and the
// styled-controls guard.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Callout, CountPill, StatusBadge, Tag, statusTone } from '../src/components/index.js';
import { AREA_ICONS, STATUS_ICONS, Icon } from '../src/components/icons.js';
import { ComponentGallery } from '../src/components/ComponentGallery.js';
import { expectStyledControls, unstyledControls } from './styled-controls.js';

afterEach(cleanup);

describe('US-070 AC-3: status badges', () => {
  it('maps story, run, phase, artifact and setup statuses to the concept tones', () => {
    const tones = Object.fromEntries(
      [
        'backlog',
        'ready',
        'in_progress',
        'review',
        'done',
        'merged',
        'queued',
        'running',
        'awaiting_approval',
        'awaiting_permission',
        'blocked_conflict',
        'completed',
        'completed_no_result',
        'failed',
        'interrupted',
        'cancelled',
        'draft',
        'approved',
        'impacted',
        'not_started',
        'ready_for_review',
        'ok',
        'warning',
        'missing',
        'skipped',
      ].map((s) => [s, statusTone(s)]),
    );
    expect(tones).toEqual({
      backlog: 'neutral',
      ready: 'info',
      in_progress: 'info',
      review: 'review',
      done: 'success',
      merged: 'success',
      queued: 'info',
      running: 'info',
      awaiting_approval: 'warning',
      awaiting_permission: 'warning',
      blocked_conflict: 'warning',
      completed: 'success',
      completed_no_result: 'warning',
      failed: 'danger',
      interrupted: 'danger',
      cancelled: 'neutral',
      draft: 'neutral',
      approved: 'success',
      impacted: 'warning',
      not_started: 'neutral',
      ready_for_review: 'review',
      ok: 'success',
      warning: 'warning',
      missing: 'danger',
      skipped: 'neutral',
    });
    expect(statusTone('something-new')).toBe('neutral');
  });

  it('renders icon and text label (status not by colour alone); running spins', () => {
    const { container } = render(
      <>
        <StatusBadge status="failed" />
        <StatusBadge status="running" label="Running · 2:10" />
      </>,
    );

    const failed = screen.getByText('Failed').closest('.badge')!;
    expect(failed).toHaveClass('badge', 'badge-danger');
    expect(failed.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const running = screen.getByText('Running · 2:10').closest('.badge')!;
    expect(running).toHaveClass('badge-info');
    expect(running.querySelector('svg')).toHaveClass('icon-spin');
    expect(container.querySelectorAll('.badge svg')).toHaveLength(2);
  });
});

describe('US-070 AC-3: callouts, pills and tags', () => {
  it('callout shows icon, title, text and an optional action; warnings and dangers are announced', async () => {
    const onAction = vi.fn();
    render(
      <>
        <Callout tone="warning" title="AI functions disabled" action={{ label: 'Complete setup', onClick: onAction }}>
          Claude Code is not configured.
        </Callout>
        <Callout tone="info">Plain information</Callout>
      </>,
    );

    const warning = screen.getByRole('alert');
    expect(warning).toHaveClass('callout', 'callout-warning');
    expect(warning).toHaveTextContent('AI functions disabled');
    expect(warning).toHaveTextContent('Claude Code is not configured.');
    expect(warning.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Complete setup' }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Plain information');
  });

  it('callout may use a custom role and label', () => {
    render(
      <Callout tone="warning" role="region" label="Link issues">
        2 broken links
      </Callout>,
    );
    expect(screen.getByRole('region', { name: 'Link issues' })).toHaveClass('callout-warning');
  });

  it('count pill and tag', () => {
    render(
      <>
        <CountPill count={3} label="pending decisions" />
        <Tag colour={2}>Auth</Tag>
      </>,
    );
    expect(screen.getByText('3')).toHaveClass('pill');
    expect(screen.getByText('3')).toHaveAccessibleName('3 pending decisions');
    expect(screen.getByText('Auth')).toHaveClass('tag', 'epic-colour-2');
  });
});

describe('US-070 AC-4: icons', () => {
  it('defines the concept icon mapping in one module; decorative icons are hidden from assistive technology', () => {
    expect(Object.keys(AREA_ICONS).sort()).toEqual([
      'dashboard',
      'executions',
      'intent',
      'kanban',
      'projects',
      'settings',
      'specifications',
    ]);
    expect(Object.keys(STATUS_ICONS).sort()).toEqual(['danger', 'info', 'neutral', 'review', 'success', 'warning']);
    const { container } = render(<Icon icon={AREA_ICONS.settings} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('icon');
    expect(svg).toHaveAttribute('width', '16');
  });
});

describe('US-070 AC-5: styled controls', () => {
  it('the guard reports controls without a styled class and accepts styled ones', () => {
    const { container } = render(
      <div>
        <button type="button">plain</button>
        <button type="button" className="btn btn-primary">
          ok
        </button>
        <input aria-label="plain field" />
        <input aria-label="styled field" className="input" />
        <label className="checkbox">
          <input type="checkbox" /> wrapped
        </label>
        <input type="hidden" value="x" />
      </div>,
    );
    expect(unstyledControls(container)).toEqual([expect.stringContaining('plain'), expect.stringContaining('plain field')]);
  });

  it('the component gallery shows every variant with styled controls', () => {
    const { container } = render(<ComponentGallery />);
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) expect(container.querySelector(`.btn-${variant}`)).not.toBeNull();
    for (const size of ['sm', 'lg']) expect(container.querySelector(`.btn-${size}`)).not.toBeNull();
    expect(container.querySelector('.btn[aria-busy="true"]')).not.toBeNull();
    for (const tone of ['info', 'success', 'warning', 'danger']) expect(container.querySelector(`.callout-${tone}`)).not.toBeNull();
    expect(container.querySelector('.switch')).not.toBeNull();
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expectStyledControls(container);
  });
});
