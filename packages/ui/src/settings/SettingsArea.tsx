// SPDX-License-Identifier: Apache-2.0
// Settings area (UF-08): agent defaults, project overrides, execution defaults and effective approval rules
// (US-014 AC-3, US-015).
import { PageHeader } from '../components/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryOutput } from '@specforge/ipc-contract';
import type { CoreSession } from '../core/core-session.js';
import { AgentSettingsForm } from './AgentSettingsForm.js';
import { AppearanceSettings, type ThemeBridge } from './AppearanceSettings.js';
import { EffectiveRules, type EffectiveRuleRow } from './EffectiveRules.js';
import { ExecDefaultsForm } from './ExecDefaultsForm.js';
import { ProjectSettingsForm, type ProjectSettingsView } from './ProjectSettingsForm.js';

type SettingsData = QueryOutput<'settings.get'>;

export interface SettingsAreaProps {
  session: CoreSession;
  projectId: string | null;
  /** Opens the setup wizard again (UF-08). */
  onOpenSetup?(): void;
  /** Colour theme preference (US-077); absent outside Electron. */
  theme?: ThemeBridge;
}

/** In-page navigation of the settings sections (US-076 AC-4). */
export function SettingsNav({ sections, onSelect }: { sections: readonly { id: string; label: string }[]; onSelect(id: string): void }) {
  return (
    <nav aria-label="Settings sections" className="settings-nav">
      {sections.map((s) => (
        <button key={s.id} type="button" className="settings-nav-item" onClick={() => onSelect(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

const scrollToSection = (id: string): void => document.getElementById(`settings-${id}`)?.scrollIntoView?.({ block: 'start' });

export function SettingsArea({ session, projectId, onOpenSetup, theme }: SettingsAreaProps) {
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
      <PageHeader
        title="Settings"
        {...(onOpenSetup
          ? {
              actions: (
                <button className="btn btn-secondary" type="button" onClick={onOpenSetup}>
                  Run setup again
                </button>
              ),
            }
          : {})}
      />
      <SettingsNav
        sections={[
          ...(theme ? [{ id: 'appearance', label: 'Appearance' }] : []),
          { id: 'agent', label: 'Agent' },
          ...(projectId ? [{ id: 'project', label: 'Project' }] : []),
          { id: 'execution', label: 'Execution' },
          ...(projectId ? [{ id: 'rules', label: 'Approval rules' }] : []),
        ]}
        onSelect={scrollToSection}
      />
      {theme && (
        <div id="settings-appearance" className="settings-card">
          <AppearanceSettings theme={theme} />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <div className="settings-sections">
          <div id="settings-agent" className="settings-card">
            <AgentSettingsForm
              title="Agent defaults (all projects)"
              settings={data.global}
              modelSuggestions={data.modelSuggestions}
              onSave={async (settings) =>
                saved(await session.client().command('settings.saveAgent', { scope: { kind: 'global' }, settings }))
              }
            />
          </div>
          {projectId && (
            <div className="settings-card">
              <AgentSettingsForm
                title="Agent settings for this project (override the defaults)"
                settings={data.project ?? { env: [] }}
                modelSuggestions={data.modelSuggestions}
                onSave={async (settings) =>
                  saved(await session.client().command('settings.saveAgent', { scope: { kind: 'project', projectId }, settings }))
                }
              />
            </div>
          )}
          {projectId && project && (
            <div id="settings-project" className="settings-card">
              <ProjectSettingsForm
                view={project}
                onSave={(settings) => session.client().command('projectSettings.save', { projectId, settings })}
                onSaveInstructions={(content, expectedHash) =>
                  session.client().command('projectSettings.saveInstructions', { projectId, content, expectedHash })
                }
              />
            </div>
          )}
          <div id="settings-execution" className="settings-card">
            <ExecDefaultsForm
              defaults={data.exec}
              onSave={async (defaults) => saved(await session.client().command('settings.saveExec', { defaults }))}
            />
          </div>
          {projectId && (
            <section id="settings-rules" aria-label="Approval rules" className="settings-card">
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
