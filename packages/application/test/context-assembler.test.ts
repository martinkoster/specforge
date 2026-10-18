// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { assembleContext, extractElementSection, type ContextInput } from '../src/index.js';

const input = (overrides: Partial<ContextInput> = {}): ContextInput => ({
  story: {
    id: 'US-002',
    title: 'Signup',
    content:
      '---\nid: US-002\n---\n## Description\nAs a visitor I want to sign up.\n## Acceptance Criteria\n- [ ] AC-1: An account is created.\n- [ ] AC-2: A welcome mail is sent.\n',
  },
  startKind: 'implement',
  instructions: 'Use pnpm. Write tests first.',
  linked: [
    {
      id: 'FR-003',
      title: 'Account creation',
      path: 'spec/02_requirements/fr.md',
      text: '### FR-003: Account creation\nThe system creates accounts.',
    },
    { id: 'ADR-002', title: 'Use Postgres', path: 'spec/03_design/adr.md', text: '### ADR-002: Use Postgres\nDecision: Postgres.' },
  ],
  epic: {
    id: 'EP-001',
    title: 'User accounts',
    goal: 'Users can create and manage their accounts.',
    siblings: [
      { id: 'US-001', title: 'Login', status: 'done', summary: 'Login endpoint added.', changedFiles: ['src/login.ts'] },
      { id: 'US-003', title: 'Reset password', status: 'backlog', summary: null, changedFiles: [] },
    ],
  },
  predecessors: [
    {
      id: 'US-001',
      title: 'Login',
      status: 'done',
      summary: 'Login endpoint added.',
      changedFiles: ['src/login.ts', 'test/login.test.ts'],
    },
  ],
  concurrent: [{ id: 'US-004', title: 'Profile', touchedFiles: ['src/profile.ts'] }],
  budget: 20_000,
  ...overrides,
});

describe('US-050 AC-1/AC-3: context contents', () => {
  it('includes the story with its acceptance criteria, the epic goal and the predecessor summaries', () => {
    const { prompt } = assembleContext(input());

    expect(prompt).toContain('Implement user story US-002: Signup.');
    expect(prompt).toContain('- [ ] AC-1: An account is created.');
    expect(prompt).toContain('- [ ] AC-2: A welcome mail is sent.');
    expect(prompt).toContain('Epic EP-001: User accounts');
    expect(prompt).toContain('Goal: Users can create and manage their accounts.');
    expect(prompt).toMatch(/US-001 Login \(Done\): Login endpoint added\.\s+Changed files: src\/login\.ts, test\/login\.test\.ts/);
  });

  it('includes linked requirements/design/ADRs, sibling stories, concurrent runs, instructions, scope rule and result schema', () => {
    const { prompt, systemAppend } = assembleContext(input());

    expect(prompt).toContain('### FR-003: Account creation\nThe system creates accounts.');
    expect(prompt).toContain('### ADR-002: Use Postgres');
    expect(prompt).toContain('US-003 Reset password (Backlog)');
    expect(prompt).toContain('US-004 Profile — touching src/profile.ts');
    expect(prompt).toContain('Use pnpm. Write tests first.');
    expect(systemAppend).toContain('Implement only this story');
    expect(systemAppend).toContain('```specforge-result');
  });

  it('corrections say so', () => {
    expect(assembleContext(input({ startKind: 'correct' })).prompt).toContain('Corrections were requested for user story US-002');
  });

  it('US-055: resumed runs continue the interrupted work; retries start over', () => {
    expect(assembleContext(input({ startKind: 'resume' })).prompt).toMatch(
      /^Continue the work on user story US-002: .* The previous run stopped before it finished/,
    );
    expect(assembleContext(input({ startKind: 'retry' })).prompt).toMatch(
      /^Implement user story US-002: .* An earlier run of this story failed/,
    );
  });
});

describe('US-050 AC-2: deterministic truncation within a budget', () => {
  it('keeps the story and rules complete and reduces linked elements to titles when the budget is small', () => {
    const long = 'x'.repeat(5000);
    const small = input({
      budget: 2500,
      linked: [
        { id: 'FR-010', title: 'Big', path: 'spec/02_requirements/fr.md', text: `### FR-010: Big\n${long}` },
        { id: 'FR-002', title: 'Small', path: 'spec/02_requirements/fr.md', text: '### FR-002: Small\nshort text' },
      ],
    });

    const a = assembleContext(small);
    const b = assembleContext(small);

    expect(a.prompt).toBe(b.prompt);
    expect(a.prompt).toContain('- [ ] AC-2: A welcome mail is sent.');
    expect(a.prompt).toContain('### FR-002: Small\nshort text');
    expect(a.prompt).toContain('FR-010: Big (spec/02_requirements/fr.md) — not included in full (context budget)');
    expect(a.prompt).not.toContain(long);
    expect(a.truncated).toBe(true);
    expect(assembleContext(input()).truncated).toBe(false);
  });
});

describe('extractElementSection', () => {
  it('returns the section of an element up to the next heading of the same or a higher level', () => {
    const md = '# Requirements\n### FR-001: A\nText A\n#### Detail\nmore\n### FR-002: B\nText B\n## Other\n';
    expect(extractElementSection(md, 'FR-001')).toBe('### FR-001: A\nText A\n#### Detail\nmore');
    expect(extractElementSection(md, 'FR-002')).toBe('### FR-002: B\nText B');
    expect(extractElementSection(md, 'FR-009')).toBeNull();
  });
});

describe('US-059 AC-2/AC-3: correction context', () => {
  it('a correction carries the review feedback and, for a fresh session, the previous run summary', () => {
    const { prompt } = assembleContext(
      input({ startKind: 'correct', feedback: 'The welcome mail has the wrong sender.', previousSummary: 'Signup with welcome mail.' }),
    );
    expect(prompt).toContain('Corrections were requested for user story US-002: Signup.');
    expect(prompt).toContain('## Review feedback\nThe welcome mail has the wrong sender.');
    expect(prompt).toContain('## Summary of the previous run\nSignup with welcome mail.');
  });
});
