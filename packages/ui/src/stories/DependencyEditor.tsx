// SPDX-License-Identifier: Apache-2.0
// Dependency section of the story drawer: list, add (depends_on with rationale / related_to), remove (US-040 AC-1, FR-062).
import { useState, type FormEvent } from 'react';
import type { CommandOutput, QueryOutput } from '@specforge/ipc-contract';

type Dependency = QueryOutput<'stories.dependencies'>['dependencies'][number];
type DependencyChange = CommandOutput<'stories.addDependency'>;

export interface DependencyEditorProps {
  storyId: string;
  dependencies: readonly Dependency[];
  storyIds: readonly string[];
  onAdd(dependency: Dependency & { rationale?: string }): Promise<DependencyChange>;
  onRemove(dependency: Dependency): Promise<DependencyChange>;
}

const describe = (d: Dependency): string => (d.type === 'blocking' ? `depends on ${d.to}` : `related to ${d.to}`);

export function DependencyEditor({ storyId, dependencies, storyIds, onAdd, onRemove }: DependencyEditorProps) {
  const candidates = storyIds.filter((id) => id !== storyId);
  const [to, setTo] = useState(candidates[0] ?? '');
  const [type, setType] = useState<Dependency['type']>('blocking');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | undefined>();

  const report = (change: DependencyChange): void => setError(change.ok ? undefined : change.reason);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!to) return;
    const trimmed = rationale.trim();
    report(await onAdd(type === 'blocking' && trimmed ? { to, type, rationale: trimmed } : { to, type }));
    setRationale('');
  };

  return (
    <section aria-label="Dependencies">
      <ul aria-label={`Dependencies of ${storyId}`}>
        {dependencies.map((d) => (
          <li key={`${d.type}:${d.to}`}>
            <span>{describe(d)}</span>
            <button type="button" aria-label={`Remove dependency on ${d.to}`} onClick={() => void onRemove(d).then(report)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as Dependency['type'])}>
            <option value="blocking">depends on</option>
            <option value="related">related to</option>
          </select>
        </label>
        <label>
          Story
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {candidates.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {type === 'blocking' && (
          <label>
            Rationale
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
        )}
        <button type="submit">Add dependency</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
