// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_EXEC_DEFAULTS } from '@specforge/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository, SettingsRepository, openDatabase, type OpenDatabase } from '../src/index.js';

const opened: OpenDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup(dir = mkdtempSync(join(tmpdir(), 'sf-settings-'))) {
  const db = openDatabase({ dir });
  opened.push(db);
  const projects = new ProjectRepository(db.db);
  if (!(await projects.get('p1')))
    await projects.create({ id: 'p1', name: 'P', workspacePath: `${dir}/ws`, vcsMode: 'git', baseBranch: 'main' });
  return { dir, db, settings: new SettingsRepository(db.sqlite) };
}

describe('US-015: settings persistence (app_setup, project_settings)', () => {
  it('starts with defaults and persists agent defaults, project overrides and execution defaults across restarts', async () => {
    const first = await setup();
    expect(first.settings.agentDefaults()).toEqual({ env: [] });
    expect(first.settings.execDefaults()).toEqual(DEFAULT_EXEC_DEFAULTS);
    expect(first.settings.projectOverrides('p1')).toBeUndefined();

    first.settings.setAgentDefaults({ model: 'claude-opus-5-5', env: [{ name: 'T', secretRef: 'agent-env/global/T' }] });
    first.settings.setProjectOverrides('p1', { effort: 'max', env: [] });
    first.settings.setExecDefaults({ ...DEFAULT_EXEC_DEFAULTS, logRetentionDays: 7 });
    first.db.close();
    opened.splice(0);

    const second = await setup(first.dir);
    expect(second.settings.agentDefaults()).toEqual({ model: 'claude-opus-5-5', env: [{ name: 'T', secretRef: 'agent-env/global/T' }] });
    expect(second.settings.projectOverrides('p1')).toEqual({ effort: 'max', env: [] });
    expect(second.settings.execDefaults()).toEqual({ ...DEFAULT_EXEC_DEFAULTS, logRetentionDays: 7 });
  });
});

describe('US-012: setup state (app_setup)', () => {
  it('records step outcomes, provider and the overall setup state', async () => {
    const first = await setup();
    expect(first.settings.setup()).toEqual({
      setupState: 'not_started',
      steps: {},
      providerKind: null,
      providerConfig: {},
      providerOk: null,
    });

    first.settings.recordStep('runtime', 'done');
    first.settings.recordStep('provider', 'skipped');
    first.settings.setProvider('anthropic_api_key', { env: [{ name: 'ANTHROPIC_API_KEY', secretRef: 'provider/ANTHROPIC_API_KEY' }] });
    first.settings.setProviderOk(true);
    first.settings.setSetupState('complete');
    first.db.close();
    opened.splice(0);

    const second = await setup(first.dir);
    expect(second.settings.setup()).toEqual({
      setupState: 'complete',
      steps: { runtime: 'done', provider: 'skipped' },
      providerKind: 'anthropic_api_key',
      providerConfig: { env: [{ name: 'ANTHROPIC_API_KEY', secretRef: 'provider/ANTHROPIC_API_KEY' }] },
      providerOk: true,
    });
  });
});
