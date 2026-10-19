// SPDX-License-Identifier: Apache-2.0
// Agent runtime settings (US-015 AC-1, UF-08): model, effort, max turns and environment variables. Secret values are
// stored in the OS credential store by the core and are never sent back to the UI (shown as ••••).
import { useId, useState, type FormEvent } from 'react';
import type { CommandInput, CommandOutput, QueryOutput } from '@specforge/ipc-contract';

export type AgentSettingsView = QueryOutput<'settings.get'>['global'];
type AgentSettingsInput = CommandInput<'settings.saveAgent'>['settings'];
type SaveResult = CommandOutput<'settings.saveAgent'>;
type Effort = NonNullable<AgentSettingsView['effort']>;

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

interface Row {
  key: number;
  name: string;
  secret: boolean;
  /** For stored secrets: empty = keep the stored value. */
  value: string;
  storedSecret: boolean;
}

export interface AgentSettingsFormProps {
  title: string;
  settings: AgentSettingsView;
  /** Models reported by the runtime's capabilities; any model name can be entered. */
  modelSuggestions: readonly string[];
  onSave(settings: AgentSettingsInput): Promise<SaveResult>;
}

export function AgentSettingsForm({ title, settings, modelSuggestions, onSave }: AgentSettingsFormProps) {
  const listId = useId();
  const [model, setModel] = useState(settings.model ?? '');
  const [effort, setEffort] = useState<Effort | ''>(settings.effort ?? '');
  const [maxTurns, setMaxTurns] = useState(settings.maxTurns?.toString() ?? '');
  const [nextKey, setNextKey] = useState(settings.env.length);
  const [rows, setRows] = useState<Row[]>(
    settings.env.map((e, key) => ({ key, name: e.name, secret: e.secret, value: e.value ?? '', storedSecret: e.secret })),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const update = (key: number, patch: Partial<Row>): void => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const input: AgentSettingsInput = {
      env: rows.map((r) =>
        r.secret
          ? r.storedSecret && r.value === ''
            ? { name: r.name, secret: true }
            : { name: r.name, secret: true, value: r.value }
          : { name: r.name, secret: false, value: r.value },
      ),
    };
    if (model.trim()) input.model = model.trim();
    if (effort) input.effort = effort;
    if (maxTurns.trim()) input.maxTurns = Number(maxTurns);
    const result = await onSave(input);
    setErrors(result.ok ? [] : result.errors);
    setSaved(result.ok);
  };

  return (
    <form onSubmit={(e) => void submit(e)} aria-label={title}>
      <h2>{title}</h2>
      <label>
        Model
        <input list={listId} value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id={listId}>
          {modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <label>
        Effort
        <select value={effort} onChange={(e) => setEffort(e.target.value as Effort | '')}>
          <option value="">Default</option>
          {EFFORTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
      <label>
        Max turns
        <input type="number" min={1} value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
      </label>
      <table aria-label="Environment variables">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Value</th>
            <th scope="col">Secret</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <input aria-label="Variable name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
              </td>
              <td>
                <input
                  aria-label={`Value of ${r.name || 'variable'}`}
                  type={r.secret ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder={r.storedSecret ? '•••••••• (unchanged)' : ''}
                  value={r.value}
                  onChange={(e) => update(r.key, { value: e.target.value })}
                />
              </td>
              <td>
                <label>
                  <input
                    type="checkbox"
                    checked={r.secret}
                    onChange={(e) => update(r.key, { secret: e.target.checked, storedSecret: false, value: '' })}
                  />
                  Secret
                </label>
              </td>
              <td>
                <button
                  type="button"
                  aria-label={`Remove ${r.name || 'variable'}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, name: '', secret: false, value: '', storedSecret: false }]);
          setNextKey((k) => k + 1);
        }}
      >
        Add variable
      </button>
      <p className="hint">Secret values are stored in the operating system's credential store and passed only to the agent process.</p>
      {errors.length > 0 && (
        <div role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <button type="submit">Save agent settings</button>
      {saved && <span aria-live="polite">Saved</span>}
    </form>
  );
}
