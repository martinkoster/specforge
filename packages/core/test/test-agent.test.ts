// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { RunRequest } from '@specforge/application';
import { createTestAgent, testAgentScript } from '../src/test-agent.js';

const request = (kind: RunRequest['kind'], prompt: string): RunRequest => ({ runId: 'r', kind, cwd: '/ws', prompt, config: {} });
const writes = (steps: ReturnType<typeof testAgentScript>) =>
  steps.flatMap((s) => (s.type === 'tool' ? [(s.input as { file_path: string }).file_path] : []));

describe('US-063: scripted agent for the end-to-end suite', () => {
  it('writes the artifacts of each generation target', () => {
    expect(writes(testAgentScript(request('generate', 'Write only files inside spec/02_requirements/')))).toEqual([
      'spec/02_requirements/functional_requirements.md',
    ]);
    expect(writes(testAgentScript(request('generate', 'Write only files inside spec/03_design/')))).toEqual(['spec/03_design/design.md']);
    expect(writes(testAgentScript(request('generate', 'Write only files inside spec/04_user_stories/epics/')))).toEqual([
      'spec/04_user_stories/epics/EP-001-accounts.md',
    ]);
    expect(writes(testAgentScript(request('generate', 'Write only files inside spec/04_user_stories/')))).toEqual([
      'spec/04_user_stories/US-001-log-in.md',
      'spec/04_user_stories/US-002-log-out.md',
      'spec/04_user_stories/US-003-remember-me.md',
    ]);
    expect(testAgentScript(request('generate', 'something else'))).toEqual([{ type: 'result', text: 'Nothing to do.' }]);
  });

  it('implements stories with a file write; "slow" stories take longer, "hang" stories never end', () => {
    const quick = testAgentScript(request('implement', 'Implement user story US-001: Log in.'));
    expect(writes(quick)).toEqual(['src/us-001.ts']);
    expect(quick.at(-1)).toMatchObject({ type: 'result' });
    expect(testAgentScript(request('implement', 'Implement user story US-002: Log out slow.'))).toContainEqual({ type: 'delay', ms: 4000 });
    expect(testAgentScript(request('implement', 'Implement user story US-009: Endless hang.')).at(-1)).toEqual({ type: 'hang' });
  });

  it('answers clarifications, quality checks and chat read-only', () => {
    expect(testAgentScript(request('clarify', 'x')).at(-1)).toMatchObject({ type: 'result', text: expect.stringContaining('"done":true') });
    expect(testAgentScript(request('quality_check', 'x')).at(-1)).toMatchObject({ text: expect.stringContaining('"findings":[]') });
    expect(writes(testAgentScript(request('chat', 'x')))).toEqual([]);
    expect(testAgentScript(request('connection_test', 'x'))).toEqual([{ type: 'result', text: 'PONG' }]);
    expect(createTestAgent().capabilities().requiresProvider).toBe(false);
  });
});

describe('US-065 AC-1: streaming stories for the responsiveness benchmark', () => {
  it('"stream" stories write ≥ 100 output lines per second for 16 seconds before the result', () => {
    const steps = testAgentScript(request('implement', 'Implement user story US-004: Stream logs.'));
    const lines = steps.filter((s) => s.type === 'output').length;
    const waited = steps.reduce((ms, s) => ms + (s.type === 'delay' ? s.ms : 0), 0);
    expect(lines).toBeGreaterThanOrEqual(2000);
    expect(waited).toBe(16_000);
    expect(lines / (waited / 1000)).toBeGreaterThanOrEqual(100);
    expect(steps.at(-1)).toMatchObject({ type: 'result' });
  });
});
