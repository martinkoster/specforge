// SPDX-License-Identifier: Apache-2.0
// Specifications list grouped by artifact type with approval state (US-025 AC-2).
import type { QueryOutput } from '@specforge/ipc-contract';

export type ArtifactGroups = QueryOutput<'artifacts.list'>;

export interface ArtifactListProps {
  groups: ArtifactGroups;
  selected: string | null;
  onSelect(path: string): void;
}

const fileName = (path: string): string => path.split('/').pop() ?? path;

export function ArtifactList({ groups, selected, onSelect }: ArtifactListProps) {
  if (groups.length === 0) return <p>No specifications yet — write the intent or generate requirements to get started.</p>;
  return (
    <nav aria-label="Specifications" className="artifact-list">
      {groups.map((group) => (
        <div role="group" aria-label={group.label} key={group.kind}>
          <h2>{group.label}</h2>
          <ul>
            {group.artifacts.map((a) => (
              <li key={a.path}>
                <button
                  type="button"
                  title={a.path}
                  aria-current={a.path === selected ? 'true' : undefined}
                  onClick={() => onSelect(a.path)}
                >
                  {fileName(a.path)}
                </button>{' '}
                <span className={a.approval === 'approved' ? 'badge' : 'badge badge-warning'}>
                  {a.approval === 'approved' ? 'Approved' : 'Draft'}
                </span>
                {a.invalid && <span className="badge badge-warning">Invalid: {a.invalid}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
