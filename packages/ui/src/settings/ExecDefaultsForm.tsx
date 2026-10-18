// SPDX-License-Identifier: Apache-2.0
// Execution defaults (US-015 AC-2, FR-052): run duration, idle timeout, notifications, log retention and verbosity;
// merge check interval (US-024).
import { useState, type FormEvent } from 'react';
import type { CommandOutput, QueryOutput } from '@specforge/ipc-contract';

export type ExecDefaults = QueryOutput<'settings.get'>['exec'];
type SaveResult = CommandOutput<'settings.saveExec'>;

export interface ExecDefaultsFormProps {
  defaults: ExecDefaults;
  onSave(defaults: ExecDefaults): Promise<SaveResult>;
}

const LEVELS: ExecDefaults['logLevel'][] = ['error', 'warn', 'info', 'debug'];

export function ExecDefaultsForm({ defaults, onSave }: ExecDefaultsFormProps) {
  const [durationMin, setDurationMin] = useState(String(Math.round(defaults.maxRunDurationS / 60)));
  const [idleMin, setIdleMin] = useState(String(Math.round(defaults.idleTimeoutS / 60)));
  const [notifications, setNotifications] = useState(defaults.notifications);
  const [retention, setRetention] = useState(String(defaults.logRetentionDays));
  const [logLevel, setLogLevel] = useState(defaults.logLevel);
  const [mergeCheck, setMergeCheck] = useState(String(defaults.mergeCheckIntervalS));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await onSave({
      maxRunDurationS: Math.round(Number(durationMin) * 60),
      idleTimeoutS: Math.round(Number(idleMin) * 60),
      notifications,
      logRetentionDays: Number(retention),
      logLevel,
      mergeCheckIntervalS: Number(mergeCheck),
    });
    setErrors(result.ok ? [] : result.errors);
    setSaved(result.ok);
  };

  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Execution defaults">
      <h2>Execution defaults</h2>
      <p className="hint">Changes apply to the next run.</p>
      <label>
        Max run duration (minutes)
        <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
      </label>
      <label>
        Idle timeout (minutes)
        <input type="number" min={1} value={idleMin} onChange={(e) => setIdleMin(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
        Notifications
      </label>
      <label>
        Keep logs (days)
        <input type="number" min={1} value={retention} onChange={(e) => setRetention(e.target.value)} />
      </label>
      <label>
        Log verbosity
        <select value={logLevel} onChange={(e) => setLogLevel(e.target.value as ExecDefaults['logLevel'])}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Check for merged branches every (seconds)
        <input type="number" min={10} value={mergeCheck} onChange={(e) => setMergeCheck(e.target.value)} />
      </label>
      {errors.length > 0 && (
        <div role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <button type="submit">Save execution defaults</button>
      {saved && <span aria-live="polite">Saved</span>}
    </form>
  );
}
