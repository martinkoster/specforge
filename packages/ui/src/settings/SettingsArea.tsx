// SPDX-License-Identifier: Apache-2.0
// Settings area (UF-08): agent defaults, project overrides, execution defaults and effective approval rules
// (US-014 AC-3, US-015).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { AgentSettingsForm } from './AgentSettingsForm.js';
import { EffectiveRules, type EffectiveRuleRow } from './EffectiveRules.js';
import { ExecDefaultsForm } from './ExecDefaultsForm.js';
import { ProjectSettingsForm, type ProjectSettingsView } from './ProjectSettingsForm.js';

type SettingsData = QueryOutput<'settings.get'>;

export interface SettingsAreaProps {
  session: CoreSession;
  projectId: string | null;
  /** Opens the setup wizard again (UF-08). */
  onOpenSetup?(): void;
}

export function SettingsArea({ session, projectId, onOpenSetup }: SettingsAreaProps) {
  const [data, setData] = useState<SettingsData | undefined>();
  const [rules, setRules] = useState<EffectiveRuleRow[]>([]);
  const [project, setProject] = useState<ProjectSettingsView | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Overlapping reloads (e.g. two quick saves) may finish out of order; only the latest one is applied.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    try {
      const nextData = await session.client().query('settings.get', { projectId });
      const nextRules = projectId ? await session.client().query('rules.effective', { projectId }) : [];
      if (request !== latest.current) return;
      setData(nextData);
      setRules(nextRules);
      setError(undefined);
    } catch (e) {
      if (request === latest.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [session, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Project settings load independently, so a failure there does not hide the other settings.
  useEffect(() => {
    setProject(undefined);
    if (!projectId) return;
    session
      .client()
      .query('projectSettings.get', { projectId })
      .then(setProject, () => undefined);
  }, [session, projectId]);

  const saved = async <T extends { ok: boolean }>(result: T): Promise<T> => {
    // The forms keep the values just saved; the reload refreshes the effective settings.
    if (result.ok) await load();
    return result;
  };

  return (
    <div className="settings">
      <h1>Settings</h1>
      {onOpenSetup && (
        <button type="button" onClick={onOpenSetup}>
          Run setup again
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <div>
          <AgentSettingsForm
            title="Agent defaults (all projects)"
            settings={data.global}
            modelSuggestions={data.modelSuggestions}
            onSave={async (settings) =>
              saved(await session.client().command('settings.saveAgent', { scope: { kind: 'global' }, settings }))
            }
          />
          {projectId && (
            <AgentSettingsForm
              title="Agent settings for this project (override the defaults)"
              settings={data.project ?? { env: [] }}
              modelSuggestions={data.modelSuggestions}
              onSave={async (settings) =>
                saved(await session.client().command('settings.saveAgent', { scope: { kind: 'project', projectId }, settings }))
              }
            />
          )}
          {projectId && project && (
            <ProjectSettingsForm
              view={project}
              onSave={(settings) => session.client().command('projectSettings.save', { projectId, settings })}
              onSaveInstructions={(content, expectedHash) =>
                session.client().command('projectSettings.saveInstructions', { projectId, content, expectedHash })
              }
            />
          )}
          <ExecDefaultsForm
            defaults={data.exec}
            onSave={async (defaults) => saved(await session.client().command('settings.saveExec', { defaults }))}
          />
          {projectId && (
            <section aria-label="Approval rules">
              <h2>Approval rules</h2>
              <EffectiveRules
                rules={rules}
                onToggleGlobal={(ruleId, disabled) =>
                  void session.client().command('rules.setGlobalDisabled', { projectId, ruleId, disabled }).then(load)
                }
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
