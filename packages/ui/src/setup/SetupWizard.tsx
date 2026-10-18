// SPDX-License-Identifier: Apache-2.0
// First-start setup wizard (US-012, UC-028, UF-01): step list with status, one panel per step, "Skip setup" always visible.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CommandInput, QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { ExecDefaultsForm, type ExecDefaults } from '../settings/ExecDefaultsForm.js';

type SetupData = QueryOutput<'setup.state'>;
type Step = SetupData['steps'][number];
type StepId = Step['id'];
type Provider = CommandInput<'setup.saveProvider'>['provider'];
type Suggestion = QueryOutput<'setup.ruleSuggestions'>[number];

const STATUS_TEXT: Record<Step['status'], string> = { ok: 'OK', warning: 'warning', missing: 'missing', skipped: 'skipped' };

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface SetupWizardProps {
  session: CoreSession;
  /** Setup finished or skipped: continue to the start wizard. */
  onDone(): void;
  /** Opened from the "AI functions disabled" banner: start at the first incomplete step (US-013 AC-3). */
  startAtFirstIncomplete?: boolean;
}

function RuntimePanel({ session, step, reload }: { session: CoreSession; step: Step; reload(): Promise<void> }) {
  const [path, setPath] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>();

  const recheck = async (): Promise<void> => {
    const found = await session.client().command('runtime.detect', {});
    setResult(
      found.found
        ? { ok: true, text: `Claude Code ${found.version} found at ${found.path}.` }
        : { ok: false, text: 'Claude Code was not found.' },
    );
    await reload();
  };

  const verify = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const verified = await session.client().command('runtime.verify', { path });
    setResult(verified.ok ? { ok: true, text: `Claude Code ${verified.version} verified.` } : { ok: false, text: verified.message });
    await reload();
  };

  return (
    <>
      <p>{step.detail}</p>
      <button type="button" onClick={() => void recheck()}>
        Re-check
      </button>
      <form onSubmit={(e) => void verify(e)}>
        <label>
          Path to Claude Code
          <input value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <button type="submit" disabled={path.trim() === ''}>
          Verify
        </button>
      </form>
      {result && <p role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </>
  );
}

const PROVIDERS: { kind: Provider['kind']; label: string }[] = [
  { kind: 'anthropic_api_key', label: 'Anthropic API key' },
  { kind: 'bedrock', label: 'Amazon Bedrock' },
  { kind: 'vertex', label: 'Google Vertex AI' },
  { kind: 'foundry', label: 'Microsoft Foundry' },
];

function ProviderPanel({ session, reload }: { session: CoreSession; reload(): Promise<void> }) {
  const [kind, setKind] = useState<Provider['kind']>('anthropic_api_key');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const field = (name: string, label: string, secret = false) => (
    <label>
      {label}
      <input
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        value={fields[name] ?? ''}
        onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
      />
    </label>
  );

  const provider = (): Provider => {
    const f = (name: string) => fields[name] ?? '';
    if (kind === 'anthropic_api_key') return { kind, apiKey: f('apiKey') };
    if (kind === 'bedrock') return f('profile') ? { kind, region: f('region'), profile: f('profile') } : { kind, region: f('region') };
    if (kind === 'vertex') return { kind, region: f('region'), projectId: f('projectId') };
    return { kind, resource: f('resource'), apiKey: f('apiKey') };
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await session.client().command('setup.saveProvider', { provider: provider() });
      if (!saved.ok) {
        setResult({ ok: false, text: saved.errors.join(' ') });
        return;
      }
      const tested = await session.client().command('setup.testConnection', {});
      setResult(
        tested.ok ? { ok: true, text: 'Connection test succeeded.' } : { ok: false, text: `Connection test failed: ${tested.error}` },
      );
      await reload();
    } catch (e) {
      setResult({ ok: false, text: message(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="hint">Claude Code sends your prompts and code to this provider. SpecForge itself sends nothing.</p>
      <fieldset>
        <legend>Provider</legend>
        {PROVIDERS.map((p) => (
          <label key={p.kind}>
            <input type="radio" name="provider" checked={kind === p.kind} onChange={() => setKind(p.kind)} />
            {p.label}
          </label>
        ))}
      </fieldset>
      {kind === 'anthropic_api_key' && field('apiKey', 'API key', true)}
      {kind === 'bedrock' && (
        <>
          {field('region', 'AWS region')}
          {field('profile', 'AWS profile (optional)')}
        </>
      )}
      {kind === 'vertex' && (
        <>
          {field('region', 'Region')}
          {field('projectId', 'Google Cloud project ID')}
        </>
      )}
      {kind === 'foundry' && (
        <>
          {field('resource', 'Foundry resource name')}
          {field('apiKey', 'Foundry API key', true)}
        </>
      )}
      <p className="hint">Keys are stored in the operating system's credential store and passed only to the agent process.</p>
      <button type="submit" disabled={busy}>
        Save and test connection
      </button>
      {result && <p role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </form>
  );
}

function RulesPanel({ session, reload }: { session: CoreSession; reload(): Promise<void> }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | undefined>();

  useEffect(() => {
    void session.client().query('setup.ruleSuggestions', {}).then(setSuggestions);
  }, [session]);

  const save = async (): Promise<void> => {
    const keys = [...chosen].filter((k) => !suggestions.find((s) => s.key === k)?.enabled);
    await session.client().command('setup.enableRules', { keys });
    setDone(`${keys.length} ${keys.length === 1 ? 'rule' : 'rules'} enabled.`);
    setSuggestions(await session.client().query('setup.ruleSuggestions', {}));
    await reload();
  };

  return (
    <>
      <ul className="checklist">
        {suggestions.map((s) => (
          <li key={s.key}>
            <label>
              <input
                type="checkbox"
                checked={s.enabled || chosen.has(s.key)}
                disabled={s.enabled}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(s.key);
                  else next.delete(s.key);
                  setChosen(next);
                }}
              />
              {s.label}
            </label>
          </li>
        ))}
      </ul>
      <p className="hint">Everything else will ask you first. Actions outside the workspace always ask.</p>
      <button type="button" onClick={() => void save()}>
        Save rules
      </button>
      {done && <p aria-live="polite">{done}</p>}
    </>
  );
}

function DefaultsPanel({ session, reload }: { session: CoreSession; reload(): Promise<void> }) {
  const [defaults, setDefaults] = useState<ExecDefaults | undefined>();
  useEffect(() => {
    void session
      .client()
      .query('settings.get', { projectId: null })
      .then((s) => setDefaults(s.exec));
  }, [session]);
  if (!defaults) return null;
  return (
    <ExecDefaultsForm
      defaults={defaults}
      onSave={async (next) => {
        const result = await session.client().command('settings.saveExec', { defaults: next });
        if (result.ok) await reload();
        return result;
      }}
    />
  );
}

export function SetupWizard({ session, onDone, startAtFirstIncomplete = false }: SetupWizardProps) {
  const [data, setData] = useState<SetupData | undefined>();
  const [current, setCurrent] = useState<StepId>('runtime');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setData(await session.client().query('setup.state', {}));
  }, [session]);

  useEffect(() => {
    session
      .client()
      .query('setup.state', {})
      .then((loaded) => {
        setData(loaded);
        // US-013 AC-3: opened from the "AI functions disabled" banner, the wizard starts at the first incomplete step.
        const incomplete = startAtFirstIncomplete ? loaded.steps.find((s) => s.id !== 'summary' && s.status !== 'ok') : undefined;
        if (incomplete) setCurrent(incomplete.id);
      })
      .catch((e: unknown) => setError(message(e)));
  }, [session, startAtFirstIncomplete]);

  const run = (fn: () => Promise<void>) => () => void fn().catch((e: unknown) => setError(message(e)));

  if (!data) return error ? <p role="alert">{error}</p> : <p>Loading setup…</p>;
  const step = data.steps.find((s) => s.id === current)!;
  const index = data.steps.findIndex((s) => s.id === current);
  const next = data.steps[index + 1];

  return (
    <div className="setup-wizard">
      <header className="setup-header">
        <h1>Set up SpecForge</h1>
        <button type="button" onClick={() => setConfirmSkip(true)}>
          Skip setup
        </button>
      </header>
      <div className="setup-layout">
        <nav aria-label="Setup steps">
          {data.steps.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={s.id === current ? 'step' : undefined}
              className={`step step-${s.status}`}
              onClick={() => setCurrent(s.id)}
            >
              {s.label} — {STATUS_TEXT[s.status]}
            </button>
          ))}
        </nav>
        <section aria-label={step.label} className="setup-panel">
          <h2>{step.label}</h2>
          {error && <p role="alert">{error}</p>}
          {current === 'runtime' && <RuntimePanel session={session} step={step} reload={reload} />}
          {current === 'provider' && <ProviderPanel session={session} reload={reload} />}
          {current === 'git' && <p>{step.detail}</p>}
          {current === 'rules' && <RulesPanel session={session} reload={reload} />}
          {current === 'defaults' && <DefaultsPanel session={session} reload={reload} />}
          {current === 'summary' && (
            <>
              <ul>
                {data.steps
                  .filter((s) => s.id !== 'summary')
                  .map((s) => (
                    <li key={s.id}>
                      {s.label}: {STATUS_TEXT[s.status]} — {s.detail}
                    </li>
                  ))}
              </ul>
              <p>{step.detail}</p>
              <button
                type="button"
                onClick={run(async () => {
                  await session.client().command('setup.complete', {});
                  onDone();
                })}
              >
                Finish
              </button>
            </>
          )}
          {current !== 'summary' && (
            <div className="setup-footer">
              <button
                type="button"
                onClick={run(async () => {
                  await session.client().command('setup.skipStep', { step: current });
                  await reload();
                })}
              >
                Skip this step
              </button>
              {next && (
                <button type="button" onClick={() => setCurrent(next.id)}>
                  Next
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      {confirmSkip && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="skip-setup-title" className="dialog">
          <h2 id="skip-setup-title">Skip setup?</h2>
          <p>AI features will be disabled until setup is complete. You can run the setup again from Settings.</p>
          <button
            type="button"
            onClick={run(async () => {
              await session.client().command('setup.skip', {});
              onDone();
            })}
          >
            Skip setup
          </button>
          <button type="button" onClick={() => setConfirmSkip(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
