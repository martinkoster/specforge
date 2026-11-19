// SPDX-License-Identifier: Apache-2.0
// Test-only component gallery (US-070 AC-5): every control variant on one page for visual smoke and contrast checks.
// Rendered only in test mode (`?test=1#gallery`).
import { Callout } from './Callout.js';
import { CountPill, Tag } from './Pill.js';
import { StatusBadge } from './StatusBadge.js';

const STATUSES = ['backlog', 'ready', 'running', 'review', 'done', 'awaiting_approval', 'failed', 'cancelled'];

export function ComponentGallery() {
  return (
    <div className="gallery">
      <h1>Component gallery</h1>
      <section aria-label="Buttons" className="gallery-row">
        <button type="button" className="btn btn-primary">
          Primary
        </button>
        <button type="button" className="btn btn-secondary">
          Secondary
        </button>
        <button type="button" className="btn btn-ghost">
          Ghost
        </button>
        <button type="button" className="btn btn-danger">
          Danger
        </button>
        <button type="button" className="btn btn-primary btn-sm">
          Small
        </button>
        <button type="button" className="btn btn-secondary btn-lg">
          Large
        </button>
        <button type="button" className="btn btn-primary" aria-busy="true">
          Saving
        </button>
        <button type="button" className="btn btn-secondary" disabled>
          Disabled
        </button>
      </section>
      <section aria-label="Fields" className="gallery-form">
        <label className="field">
          <span className="field-label">Project name</span>
          <input className="input" defaultValue="Task Manager" />
          <span className="field-hint">Shown in the project switcher.</span>
        </label>
        <label className="field">
          <span className="field-label">Branch pattern</span>
          <input className="input" aria-invalid="true" defaultValue="feature/{" />
          <span className="field-error">The pattern is not valid.</span>
        </label>
        <label className="field">
          <span className="field-label">Model</span>
          <select className="select" defaultValue="default">
            <option value="default">Default</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Instructions</span>
          <textarea className="textarea" defaultValue="Use strict TDD." />
        </label>
        <label className="checkbox">
          <input type="checkbox" defaultChecked /> Initialise Git repository
        </label>
        <label className="radio">
          <input type="radio" name="gallery-radio" defaultChecked /> Option
        </label>
        <label className="switch">
          <input type="checkbox" role="switch" defaultChecked /> Notifications
        </label>
      </section>
      <section aria-label="Badges" className="gallery-row">
        {STATUSES.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
        <CountPill count={3} label="pending decisions" />
        <Tag colour={0}>Authentication</Tag>
        <Tag>Neutral</Tag>
      </section>
      <section aria-label="Callouts" className="gallery-stack">
        <Callout tone="info" title="Information">
          Specification runs write only into the target folder.
        </Callout>
        <Callout tone="success" title="Approved">
          The requirements are approved.
        </Callout>
        <Callout tone="warning" title="No Git repository" action={{ label: 'Initialise Git', onClick: () => undefined }}>
          Runs are not isolated.
        </Callout>
        <Callout tone="danger" title="Run failed">
          The agent exited with code 1.
        </Callout>
      </section>
    </div>
  );
}
