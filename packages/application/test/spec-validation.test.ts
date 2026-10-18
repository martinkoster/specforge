// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { validateSpecFiles, type SpecIndexView } from '../src/specs/spec-validation.js';

const index: SpecIndexView = {
  elements: [
    { id: 'FR-001', path: 'spec/02_requirements/functional_requirements.md' },
    { id: 'UC-001', path: 'spec/03_design/functional_design/use_cases.md' },
    { id: 'US-001', path: 'spec/04_user_stories/US-001.md' },
    { id: 'US-002', path: 'spec/04_user_stories/US-002.md' },
  ],
  dependencies: [{ from: 'US-002', to: 'US-001', type: 'blocking', path: 'spec/04_user_stories/US-002.md' }],
};

const story = (id: string, extra = '') =>
  `---\nkind: story\nid: ${id}\ntitle: Story ${id}\nstatus: backlog\n${extra.includes('requirements:') ? '' : 'requirements: [FR-001]\n'}${extra}---\n# ${id}\n## Acceptance criteria\n- [ ] Works.\n`;
const epic = (front: string, body: string) => `---\nkind: epic\nid: EP-001\ntitle: Accounts\n${front}---\n${body}`;

describe('US-027 AC-2: validation of produced specification files', () => {
  it('accepts valid files that reference existing and newly produced elements', () => {
    const files = [
      {
        path: 'spec/02_requirements/nfr.md',
        content: '# NFR\n\n### NFR-001: Fast\nSupports FR-001 and FR-002 (see D12).\n\n### FR-002: New\n',
      },
      {
        path: 'spec/04_user_stories/US-003.md',
        content: story('US-003', 'depends_on:\n  - id: US-002\n    rationale: Needs the profile.\nrequirements: [FR-002]\n'),
      },
    ];
    expect(validateSpecFiles(files, index)).toEqual([]);
  });

  it('reports invalid front-matter', () => {
    const issues = validateSpecFiles([{ path: 'spec/04_user_stories/US-009.md', content: '---\nkind: story\nid: nope\n---\n' }], index);
    expect(issues).toEqual([
      { path: 'spec/04_user_stories/US-009.md', kind: 'front_matter', message: expect.stringMatching(/invalid US id/) },
    ]);
  });

  it('reports IDs that already exist elsewhere or twice among the produced files', () => {
    const issues = validateSpecFiles(
      [
        { path: 'spec/02_requirements/more.md', content: '### FR-001: Duplicate of an existing one\n### FR-007: A\n' },
        { path: 'spec/02_requirements/other.md', content: '### FR-007: Twice\n' },
      ],
      index,
    );
    expect(issues).toEqual([
      {
        path: 'spec/02_requirements/more.md',
        kind: 'duplicate_id',
        message: 'FR-001 is already defined in spec/02_requirements/functional_requirements.md.',
      },
      {
        path: 'spec/02_requirements/other.md',
        kind: 'duplicate_id',
        message: 'FR-007 is already defined in spec/02_requirements/more.md.',
      },
    ]);
  });

  it('does not flag IDs of a rewritten file as duplicates of its own previous version', () => {
    const files = [{ path: 'spec/02_requirements/functional_requirements.md', content: '### FR-001: Rewritten\n' }];
    expect(validateSpecFiles(files, index)).toEqual([]);
  });

  it('reports links to unknown elements, including those of deleted files', () => {
    const issues = validateSpecFiles(
      [
        { path: 'spec/03_design/functional_design/use_cases.md', content: null },
        { path: 'spec/03_design/flows.md', content: '### UF-001: Flow\nCovers UC-001 and FR-099.\n' },
      ],
      index,
    );
    expect(issues).toEqual([
      { path: 'spec/03_design/flows.md', kind: 'broken_link', message: 'UF-001 references UC-001, which does not exist.' },
      { path: 'spec/03_design/flows.md', kind: 'broken_link', message: 'UF-001 references FR-099, which does not exist.' },
    ]);
  });

  it('reports blocking dependency cycles', () => {
    const issues = validateSpecFiles(
      [
        {
          path: 'spec/04_user_stories/US-001.md',
          content: story('US-001', 'depends_on:\n  - id: US-002\n    rationale: Uses its result.\n'),
        },
      ],
      index,
    );
    expect(issues).toEqual([
      { path: 'spec/04_user_stories/US-001.md', kind: 'dependency_cycle', message: 'Dependency cycle: US-001 → US-002 → US-001.' },
    ]);
  });

  it('ignores non-Markdown files', () => {
    expect(validateSpecFiles([{ path: 'spec/02_requirements/diagram.png', content: 'binary' }], index)).toEqual([]);
  });
});

describe('US-036 AC-2: proposed dependencies need a rationale', () => {
  it('reports blocking dependencies of produced stories without a rationale', () => {
    const files = [
      {
        path: 'spec/04_user_stories/US-003.md',
        content: story('US-003', 'depends_on:\n  - id: US-001\n    rationale: Needs the login.\n  - US-002\n'),
      },
    ];
    expect(validateSpecFiles(files, index)).toEqual([
      { path: 'spec/04_user_stories/US-003.md', kind: 'missing_rationale', message: 'US-003 depends on US-002 without a rationale.' },
    ]);
  });

  it('reports related stories of produced stories without a rationale', () => {
    const files = [
      {
        path: 'spec/04_user_stories/US-003.md',
        content: story('US-003', 'related_to:\n  - id: US-001\n    rationale: Same screen.\n  - US-002\n'),
      },
    ];
    expect(validateSpecFiles(files, index)).toEqual([
      { path: 'spec/04_user_stories/US-003.md', kind: 'missing_rationale', message: 'US-003 is related to US-002 without a rationale.' },
    ]);
  });

  it('reports dependencies on unknown stories', () => {
    const files = [
      {
        path: 'spec/04_user_stories/US-003.md',
        content: story(
          'US-003',
          'depends_on:\n  - id: US-042\n    rationale: Needs it.\nrelated_to:\n  - id: US-043\n    rationale: Similar.\n',
        ),
      },
    ];
    expect(validateSpecFiles(files, index)).toEqual([
      { path: 'spec/04_user_stories/US-003.md', kind: 'unknown_dependency', message: 'US-003 depends on US-042, which does not exist.' },
      { path: 'spec/04_user_stories/US-003.md', kind: 'unknown_dependency', message: 'US-003 is related to US-043, which does not exist.' },
    ]);
  });
});

describe('US-035 AC-1: produced epics have goal, value, linked requirements and acceptance criteria', () => {
  const path = 'spec/04_user_stories/epics/EP-001-accounts.md';

  it('accepts a complete epic', () => {
    const content = epic('requirements: [FR-001]\n', '## Goal\nG.\n## Value\nV.\n## Acceptance criteria\n- [ ] A.\n');
    expect(validateSpecFiles([{ path, content }], index)).toEqual([]);
  });

  it('reports missing sections and requirements', () => {
    const content = epic('', '## Goal\nG.\n');
    expect(validateSpecFiles([{ path, content }], index)).toEqual([
      { path, kind: 'incomplete', message: 'EP-001 has no linked requirements.' },
      { path, kind: 'incomplete', message: 'EP-001 has no "## Value" section.' },
      { path, kind: 'incomplete', message: 'EP-001 has no "## Acceptance criteria" section.' },
    ]);
  });
});

describe('US-036 AC-1: produced stories have acceptance criteria and requirement links', () => {
  it('reports a story without acceptance criteria or requirements', () => {
    const path = 'spec/04_user_stories/US-003.md';
    const content = '---\nkind: story\nid: US-003\ntitle: T\nstatus: backlog\n---\n## Description\nAs a user …\n';
    expect(validateSpecFiles([{ path, content }], index)).toEqual([
      { path, kind: 'incomplete', message: 'US-003 has no linked requirements.' },
      { path, kind: 'incomplete', message: 'US-003 has no "## Acceptance criteria" section.' },
    ]);
  });
});

describe('US-036 AC-2: dependency cycles of produced stories are reported', () => {
  it('reports a cycle between two produced stories', () => {
    const files = [
      { path: 'spec/04_user_stories/US-003.md', content: story('US-003', 'depends_on:\n  - id: US-004\n    rationale: A.\n') },
      { path: 'spec/04_user_stories/US-004.md', content: story('US-004', 'depends_on:\n  - id: US-003\n    rationale: B.\n') },
    ];
    expect(validateSpecFiles(files, index)).toEqual([
      { path: 'spec/04_user_stories/US-003.md', kind: 'dependency_cycle', message: 'Dependency cycle: US-003 → US-004 → US-003.' },
    ]);
  });
});
