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

  it('US-078: writes below the target folder of any specification root; probe stories also write spec folders', () => {
    expect(writes(testAgentScript(request('generate', 'Write only files inside docs/spec/02_requirements/ (other writes …)')))).toEqual([
      'docs/spec/02_requirements/functional_requirements.md',
    ]);
    expect(writes(testAgentScript(request('refine', 'Edit only docs/spec/02_requirements/fr.md (other writes …)')))).toEqual([
      'docs/spec/02_requirements/functional_requirements.md',
    ]);
    expect(writes(testAgentScript(request('implement', 'Implement user story US-001: Spec probe.')))).toEqual([
      'src/us-001.ts',
      'docs/spec/probe.md',
      'spec/probe_spec.rb',
    ]);
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

describe('US-080: codebase analysis with the scripted agent', () => {
  it('writes the three drafts below the specification root', () => {
    const steps = testAgentScript(
      request('analyze', 'Analyse the existing codebase.\nWrite only files inside docs/spec/ (other writes are denied).'),
    );
    expect(writes(steps)).toEqual([
      'docs/spec/01_intent/intent.md',
      'docs/spec/03_design/current_state.md',
      'docs/spec/02_requirements/current_requirements.md',
    ]);
    expect(steps.some((s) => s.type === 'sneakWrite')).toBe(false);
  });

  it('the "intrude" variant also tries a source write and writes one file around the relay', () => {
    const steps = testAgentScript(
      request(
        'analyze',
        'Analyse.\n\nLimit the analysis to these folders: intrude.\nWrite only files inside spec/ (other writes are denied).',
      ),
    );
    expect(writes(steps)).toContain('src/intruder.ts');
    expect(steps).toContainEqual(expect.objectContaining({ type: 'sneakWrite', file_path: 'README.md' }));
  });
});

describe('US-089: delta generation with the scripted agent', () => {
  it('adds a new element, modifies and deprecates scoped elements with Edit; the design delta adds an ADR', () => {
    const req = testAgentScript(
      request(
        'generate',
        'Generate the delta requirements for the feature intent spec/01_intent/FI-001-x.md (FI-001).\n- FR-034 "Task details" (spec/02_requirements/fr.md): r\n- FR-020 "Export" (spec/02_requirements/fr.md): r\nNext free IDs: FR-118, NFR-004, CON-002.\nWrite only files inside spec/02_requirements/ (other writes are denied).',
      ),
    );
    const edits = req.filter((s) => s.type === 'tool').map((s) => (s as { input: { new_string: string } }).input.new_string);
    expect(edits[0]).toContain('### FR-118: Comment on tasks\n**Feature**: FI-001');
    expect(edits[0]).toContain('### FR-034: Task details\nChanged by FI-001');
    expect(edits[1]).toBe('### FR-020: [DEPRECATED] Export — replaced by FI-001');
    const design = testAgentScript(
      request(
        'generate',
        'Generate the delta design for the feature intent spec/01_intent/FI-001-x.md (FI-001).\nNext free IDs: UC-005, ADR-010.\nWrite only files inside spec/03_design/ (other writes are denied).',
      ),
    );
    expect(writes(design)).toEqual(['spec/03_design/adr-fi-001.md']);
  });
});

describe('US-088: impact analysis with the scripted agent', () => {
  it('streams the FR-106 example items found in the element index', () => {
    const steps = testAgentScript(
      request(
        'impact',
        'Specification elements and stories:\n- UC-010: Task data model\n- EP-002: Task management\n- US-008: Task detail view (done)\n',
      ),
    );
    const lines = steps
      .filter((s) => s.type === 'output' && s.text.startsWith('IMPACT '))
      .map((s) => JSON.parse((s as { text: string }).text.slice(7)));
    expect(lines.map((l: { targetRef: string }) => l.targetRef)).toEqual(['UC-010', 'EP-002', 'US-008']);
    expect(testAgentScript(request('impact', 'nothing')).filter((s) => s.type === 'output')).toHaveLength(1);
  });
});

describe('US-083: feature review with the scripted agent', () => {
  const result = (steps: ReturnType<typeof testAgentScript>) =>
    JSON.parse(/```specforge-result\n([\s\S]*?)```/.exec((steps.at(-1) as { text: string }).text)![1]!) as {
      title: string;
      questions: unknown[];
      done: boolean;
      covered: { ref: string } | null;
      draft: { assumptions: string[] };
    };

  it('enhances the FR-103 example, asks about the formatting and records the answer in the second round', () => {
    const first = result(testAgentScript(request('feature_review', 'Review this feature idea.\nIdea: Users can comment on tasks\n')));
    expect(first).toMatchObject({ title: 'Task comments', done: false, covered: null });
    expect(first.questions).toHaveLength(1);
    const second = result(
      testAgentScript(request('feature_review', 'The product owner answered:\n- Which formatting may comments use? → Markdown\n')),
    );
    expect(second).toMatchObject({ done: true, questions: [], draft: { assumptions: ['Comments use Markdown'] } });
  });

  it('reports an idea mentioning "duplicate" as covered by the first feature intent', () => {
    const r = result(testAgentScript(request('feature_review', 'Idea: duplicate of comments\nFeature intents:\n- FI-001: Comments\n')));
    expect(r.covered).toEqual({ ref: 'FI-001', text: 'Already covered.' });
  });
});
