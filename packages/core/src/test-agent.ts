// SPDX-License-Identifier: Apache-2.0
// Scripted agent for end-to-end tests (US-063, NFR-016): only used in test mode with SPECFORGE_MOCK_AGENT=1. It
// produces plausible specification artifacts and code through the normal tool/permission path, so the e2e suite
// exercises SpecForge exactly like a real agent would (runs, permission prompts, reviews).
import { MockAdapter, type MockStep } from '@specforge/agent-mock';
import type { RunRequest } from '@specforge/application';

const RESULT = (summary: string) => `Done.\n\`\`\`specforge-result\n${JSON.stringify({ outcome: 'success', summary })}\n\`\`\`\n`;
const write = (file_path: string, content: string): MockStep => ({ type: 'tool', toolName: 'Write', input: { file_path, content } });

const REQUIREMENTS = [
  '---',
  'kind: requirements',
  'approval: draft',
  '---',
  '# Functional requirements',
  '### FR-001: Log in',
  '**Description**: Users log in with e-mail and password.',
  '**Priority**: Must Have',
  '**Release**: R1',
  '**Acceptance**: A registered user can log in.',
  '### FR-002: Log out',
  '**Description**: Users end their session.',
  '**Priority**: Must Have',
  '**Release**: R1',
  '**Acceptance**: After logging out the session is gone.',
  '',
].join('\n');

const DESIGN = [
  '---',
  'kind: design',
  'approval: draft',
  '---',
  '# Design',
  '### UC-001: Log in',
  'Addresses FR-001 and FR-002.',
  '### ADR-001: Session tokens',
  '**Context**: Sessions must survive restarts. **Decision**: signed tokens. **Alternatives**: server sessions. **Consequences**: stateless.',
  '',
].join('\n');

const EPIC =
  '---\nkind: epic\nid: EP-001\ntitle: Accounts\napproval: draft\nrequirements: [FR-001, FR-002]\n---\n## Goal\nUsers manage their sessions.\n## Value\nAccess control.\n## Acceptance criteria\n- [ ] Users can log in and out.\n';

const story = (id: string, title: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: ${title}\nstatus: backlog\napproval: draft\nsize: S\nepic: EP-001\nrequirements: [FR-001]\n${extra}---\n## Description\nAs a user I want ${title.toLowerCase()}.\n## Acceptance criteria\n- [ ] ${title} works.\n`;

/** The scripted behaviour per run kind and target. */
export function testAgentScript(request: RunRequest): MockStep[] {
  const { prompt } = request;
  if (request.kind === 'generate' || request.kind === 'refine') {
    if (prompt.includes('spec/02_requirements'))
      return [write('spec/02_requirements/functional_requirements.md', REQUIREMENTS), { type: 'result', text: 'Requirements written.' }];
    if (prompt.includes('spec/03_design')) return [write('spec/03_design/design.md', DESIGN), { type: 'result', text: 'Design written.' }];
    if (prompt.includes('spec/04_user_stories/epics'))
      return [write('spec/04_user_stories/epics/EP-001-accounts.md', EPIC), { type: 'result', text: 'Epics written.' }];
    if (prompt.includes('spec/04_user_stories')) {
      return [
        write('spec/04_user_stories/US-001-log-in.md', story('US-001', 'Log in')),
        write(
          'spec/04_user_stories/US-002-log-out.md',
          story('US-002', 'Log out slow', 'depends_on:\n  - id: US-001\n    rationale: Needs a session.\n'),
        ),
        write('spec/04_user_stories/US-003-remember-me.md', story('US-003', 'Remember me')),
        { type: 'result', text: 'Stories written.' },
      ];
    }
    return [{ type: 'result', text: 'Nothing to do.' }];
  }
  if (request.kind === 'clarify') {
    return [{ type: 'result', text: `\`\`\`specforge-result\n${JSON.stringify({ done: true, items: [] })}\n\`\`\`\n` }];
  }
  if (request.kind === 'quality_check') return [{ type: 'result', text: '```specforge-result\n{"findings":[]}\n```\n' }];
  if (request.kind === 'chat')
    return [
      { type: 'output', text: 'Read-only answer.' },
      { type: 'result', text: 'Read-only answer.' },
    ];
  if (request.kind === 'implement' || request.kind === 'correct') {
    const story = /user story (US-\d+): (.*?)\./.exec(prompt);
    const id = story?.[1] ?? 'US-000';
    const title = story?.[2] ?? '';
    const steps: MockStep[] = [
      { type: 'output', text: `Implementing ${id}…` },
      write(`src/${id.toLowerCase()}.ts`, `export const ${id.replace('-', '_')} = true;\n`),
    ];
    if (/\bhang\b/i.test(title)) return [...steps, { type: 'hang' }];
    if (/\bslow\b/i.test(title)) steps.push({ type: 'delay', ms: 4000 });
    // US-065 benchmark: 10 lines every 80 ms (125 lines/s) for 16 s.
    if (/\bstream\b/i.test(title)) {
      for (let chunk = 0; chunk < 200; chunk++) {
        for (let line = 0; line < 10; line++) steps.push({ type: 'output', text: `${id} log line ${chunk * 10 + line}` });
        steps.push({ type: 'delay', ms: 80 });
      }
    }
    return [...steps, { type: 'result', text: RESULT(`${id} implemented.`) }];
  }
  return [{ type: 'result', text: 'PONG' }];
}

export function createTestAgent(): MockAdapter {
  return new MockAdapter({ script: testAgentScript });
}
