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

const ANALYZED_INTENT = [
  '---',
  'kind: intent',
  'approval: draft',
  '---',
  '# Intent',
  '## As-is',
  'A small web shop: customers log in and place orders.',
  '## Desired change',
  '_Describe the change you want to make._',
  '',
].join('\n');

const ANALYZED_DESIGN = [
  '---',
  'kind: design',
  'approval: draft',
  '---',
  '# Current-state design',
  '## Technologies',
  '- Ruby 3.3, Rails 7.1',
  '## Components',
  '### UC-001: Log in',
  'Addresses FR-001 and FR-002.',
  '',
].join('\n');

const EPIC =
  '---\nkind: epic\nid: EP-001\ntitle: Accounts\napproval: draft\nrequirements: [FR-001, FR-002]\n---\n## Goal\nUsers manage their sessions.\n## Value\nAccess control.\n## Acceptance criteria\n- [ ] Users can log in and out.\n';

const story = (id: string, title: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: ${title}\nstatus: backlog\napproval: draft\nsize: S\nepic: EP-001\nrequirements: [FR-001]\n${extra}---\n## Description\nAs a user I want ${title.toLowerCase()}.\n## Acceptance criteria\n- [ ] ${title} works.\n`;

/** The scripted behaviour per run kind and target. */
export function testAgentScript(request: RunRequest): MockStep[] {
  const { prompt } = request;
  // US-089: delta generation — a new element with the next free ID, a modified and a deprecated element (Edit), and in
  // the design phase a new ADR (written as Accepted; SpecForge makes it Proposed).
  const delta = /^Generate the delta (requirements|design) for the feature intent \S+ \((FI-\d+)\)/.exec(prompt);
  if (request.kind === 'generate' && delta) {
    const [, phase, fi] = delta as unknown as [string, string, string];
    const folder = /Write only files inside (\S+)\//.exec(prompt)?.[1] ?? '';
    const scoped = [...prompt.matchAll(/^- ((?:FR|NFR|CON|UC|BP|UF|ADR)-\d+) "([^"]*)" \(([^)]+)\):/gm)].map((m) => ({
      id: m[1]!,
      title: m[2]!,
      path: m[3]!,
    }));
    const prefix = phase === 'requirements' ? 'FR' : 'UC';
    const nextId = new RegExp(`Next free IDs: .*?\\b(${prefix}-\\d+)`).exec(prompt)?.[1] ?? `${prefix}-900`;
    const nextAdr = /Next free IDs: .*?\b(ADR-\d+)/.exec(prompt)?.[1] ?? 'ADR-900';
    const inFolder = scoped.filter((s) => s.path.startsWith(`${folder}/`) && s.id.startsWith(prefix));
    const steps: MockStep[] = [];
    const edit = (file_path: string, old_string: string, new_string: string): MockStep => ({
      type: 'tool',
      toolName: 'Edit',
      input: { file_path, old_string, new_string },
    });
    const [first, second] = inFolder;
    if (first) {
      const heading = `### ${first.id}: ${first.title}`;
      steps.push(
        edit(
          first.path,
          heading,
          `### ${nextId}: Comment on tasks\n**Feature**: ${fi}\nUsers comment on tasks and mention teammates.\n\n${heading}\nChanged by ${fi}: shows the comments.`,
        ),
      );
    }
    if (second)
      steps.push(
        edit(second.path, `### ${second.id}: ${second.title}`, `### ${second.id}: [DEPRECATED] ${second.title} — replaced by ${fi}`),
      );
    if (phase === 'design') {
      steps.push(
        write(
          `${folder}/adr-${fi.toLowerCase()}.md`,
          `---\nkind: adr\napproval: draft\n---\n### ${nextAdr}: Comment storage\n**Feature**: ${fi}\n**Status**: Accepted\n**Context**: Comments need storage.\n**Decision**: One table per comment.\n`,
        ),
      );
    }
    return [...steps, { type: 'result', text: 'Delta written.' }];
  }
  if (request.kind === 'generate' || request.kind === 'refine') {
    // The target folder below the project's specification root (US-078), or the folder of a refined artifact.
    const target = /Write only files inside (\S+)\//.exec(prompt)?.[1] ?? /Edit only (\S+)\/[^/\s]+\.md /.exec(prompt)?.[1] ?? '';
    if (target.endsWith('/02_requirements'))
      return [write(`${target}/functional_requirements.md`, REQUIREMENTS), { type: 'result', text: 'Requirements written.' }];
    if (target.endsWith('/03_design')) return [write(`${target}/design.md`, DESIGN), { type: 'result', text: 'Design written.' }];
    if (target.endsWith('/04_user_stories/epics'))
      return [write(`${target}/EP-001-accounts.md`, EPIC), { type: 'result', text: 'Epics written.' }];
    if (target.endsWith('/04_user_stories')) {
      return [
        write(`${target}/US-001-log-in.md`, story('US-001', 'Log in')),
        write(
          `${target}/US-002-log-out.md`,
          story('US-002', 'Log out slow', 'depends_on:\n  - id: US-001\n    rationale: Needs a session.\n'),
        ),
        write(`${target}/US-003-remember-me.md`, story('US-003', 'Remember me')),
        { type: 'result', text: 'Stories written.' },
      ];
    }
    return [{ type: 'result', text: 'Nothing to do.' }];
  }
  if (request.kind === 'analyze') {
    // US-080: current-state drafts below the specification root; the "intrude" variant (analysis limited to a folder
    // named intrude) also tries a source write (denied by the relay) and changes README.md around the relay.
    const root = /Write only files inside (\S+)\//.exec(prompt)?.[1] ?? '';
    const steps: MockStep[] = [
      write(`${root}/01_intent/intent.md`, ANALYZED_INTENT),
      write(`${root}/03_design/current_state.md`, ANALYZED_DESIGN),
      write(`${root}/02_requirements/current_requirements.md`, REQUIREMENTS),
    ];
    if (/Limit the analysis to these folders: .*\bintrude\b/.test(prompt)) {
      steps.push(write('src/intruder.ts', 'export {};\n'), { type: 'sneakWrite', file_path: 'README.md', content: 'overwritten\n' });
    }
    return [...steps, { type: 'result', text: 'Current-state drafts written.' }];
  }
  if (request.kind === 'impact') {
    // US-088 (FR-106 acceptance example): the data-model design element, the epic "Task management" and the Done story
    // implementing the task detail view, found in the element index of the prompt, streamed as IMPACT lines.
    const find = (pattern: RegExp) => pattern.exec(prompt)?.[1];
    const found = [
      ['design', find(/^- ((?:UC|BP|UF)-\d+): .*data model/im), 'medium', 'Comments need a new entity in the task data model.'],
      ['epic', find(/^- (EP-\d+): Task management/m), 'high', 'Comments extend task management.'],
      [
        'story_done',
        find(/^- (US-\d+): .*detail view.* \(done\)/im),
        'medium',
        'Its task detail view must show the comments (rework candidate).',
      ],
    ].filter((f) => f[1] !== undefined);
    const lines = found.map(
      ([category, targetRef, confidence, reason]) => `IMPACT ${JSON.stringify({ category, targetRef, confidence, reason })}`,
    );
    return [
      { type: 'output', text: 'Analysing code…' },
      ...lines.map((text): MockStep => ({ type: 'output', text })),
      { type: 'result', text: 'Impact analysed.' },
    ];
  }
  if (request.kind === 'feature_review') {
    // US-083 (FR-103 acceptance example): the first round enhances "Users can comment on tasks" and asks about the
    // formatting; the answer round records it and is done. An idea mentioning "duplicate" is reported as covered.
    const answer = /→ (.+)$/m.exec(prompt)?.[1]?.trim();
    const covered = /^Idea: .*\bduplicate\b/im.test(prompt)
      ? { ref: /^- (FI-\d+):/m.exec(prompt)?.[1] ?? 'FR-001', text: 'Already covered.' }
      : null;
    const review = {
      title: 'Task comments',
      draft: {
        problem: 'Team members cannot discuss a task where it lives.',
        goal: 'Users comment on tasks and mention teammates.',
        inScope: ['Comments on tasks', '@mentions of teammates'],
        outOfScope: ['Attachments'],
        successCriteria: ['A new comment is visible to everyone viewing the task'],
        constraints: [],
        assumptions: answer ? [`Comments use ${answer}`] : [],
      },
      overlaps: [],
      conflicts: [],
      suggestedEpic: null,
      covered: answer ? null : covered,
      questions: answer
        ? []
        : [
            {
              id: 'q1',
              text: 'Which formatting may comments use?',
              why: 'Affects storage and rendering.',
              options: ['Plain text', 'Markdown', 'Rich text'],
            },
          ],
      done: answer !== undefined,
    };
    return [
      { type: 'output', text: 'Reviewing the feature idea…' },
      { type: 'result', text: `Review done.\n\`\`\`specforge-result\n${JSON.stringify(review)}\n\`\`\`\n` },
    ];
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
    // US-078: a probe story also tries to write below `docs/spec` (denied where that is the specification root) and
    // into a top-level `spec/` folder (allowed there, e.g. RSpec tests).
    if (/\bprobe\b/i.test(title)) steps.push(write('docs/spec/probe.md', '# not allowed\n'), write('spec/probe_spec.rb', 'describe\n'));
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
