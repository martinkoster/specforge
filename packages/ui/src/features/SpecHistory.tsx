// SPDX-License-Identifier: Apache-2.0
// Spec history widget of the dashboard (US-096 AC-3/AC-4, FR-112): the spec baselines, newest first, and *Create
// baseline* on demand; hidden with an explanation in projects without Git.
import { useEffect, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import { EmptyState } from '../components/index.js';
import type { CoreSession } from '../core/core-session.js';

export interface SpecHistoryProps {
  session: CoreSession;
  projectId: string;
  onCreate(): void;
  refreshKey?: unknown;
}

export function SpecHistory({ session, projectId, onCreate, refreshKey }: SpecHistoryProps) {
  const [baselines, setBaselines] = useState<QueryOutput<'baselines.list'> | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    const client = session.client();
    void client.query('baselines.list', { projectId }).then(setBaselines, () => setBaselines([]));
    void client.query('baselines.offer', { projectId }).then(
      (o) => setUnavailable(o.available ? null : o.reason),
      () => setUnavailable(null),
    );
  }, [session, projectId, refreshKey]);

  return (
    <section aria-label="Spec history" className="dashboard-widget">
      <header className="widget-header">
        <h2>Spec history</h2>
        {baselines !== null && unavailable === null && (
          <button className="btn btn-secondary btn-sm" type="button" onClick={onCreate}>
            Create baseline
          </button>
        )}
      </header>
      {unavailable && <p className="field-hint">{unavailable}</p>}
      {baselines?.length === 0 && !unavailable && <EmptyState compact title="No baselines yet." />}
      {baselines && baselines.length > 0 && (
        <ul>
          {baselines.map((b) => (
            <li key={b.tag}>{[b.tag, b.createdAt.slice(0, 10), ...(b.featureIds.length ? [b.featureIds.join(', ')] : [])].join(' · ')}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
