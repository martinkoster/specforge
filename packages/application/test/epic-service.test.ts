// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { EpicService, mustHaveRequirementIds, type EpicDeps } from '../src/index.js';

const epicFile = (id: string, title: string, requirements: string[], approval = 'draft') =>
  `---\nkind: epic\nid: ${id}\ntitle: ${title}\napproval: ${approval}\nrequirements: [${requirements.join(', ')}]\n---\n## Goal\n${title}\n`;
const storyFile = (id: string, epic: string | null) =>
  `---\nkind: story\nid: ${id}\ntitle: ${id}\nstatus: backlog\n${epic ? `epic: ${epic}\n` : ''}---\nBody of ${id}\n`;

function setup() {
  const files = new Map<string, string>([
    ['spec/04_user_stories/epics/EP-001-login.md', epicFile('EP-001', 'Login', ['FR-001'])],
    ['spec/04_user_stories/epics/EP-002-profile.md', epicFile('EP-002', 'Profile', ['FR-002'])],
    ['spec/04_user_stories/US-001.md', storyFile('US-001', 'EP-001')],
    ['spec/04_user_stories/US-002.md', storyFile('US-002', 'EP-002')],
    ['spec/04_user_stories/US-003.md', storyFile('US-003', 'EP-002')],
  ]);
  const order = new Map<string, number>();
  const approved: string[] = [];
  const reindexed: string[] = [];
  const epicOf = (content: string) => /^epic: (.*)$/m.exec(content)?.[1] ?? null;
  const deps: EpicDeps = {
    index: {
      epics: () =>
        [...files.entries()]
          .filter(([p]) => p.includes('/epics/'))
          .map(([path, content]) => ({
            id: /^id: (.*)$/m.exec(content)![1]!,
            title: /^title: (.*)$/m.exec(content)![1]!,
            approval: /^approval: (.*)$/m.exec(content)![1]! as 'draft' | 'approved',
            path,
            laneOrder: order.get(/^id: (.*)$/m.exec(content)![1]!) ?? null,
          })),
      epicStoryIds: (_p, epicId) =>
        [...files.entries()]
          .filter(([p, c]) => p.includes('/US-') && epicOf(c) === epicId)
          .map(([p]) => /US-\d+/.exec(p)![0])
          .sort(),
      storyPath: (_p, id) => `spec/04_user_stories/${id}.md`,
      epicRequirements: (_p, epicId) => {
        const entry = [...files.entries()].find(([p, c]) => p.includes('/epics/') && c.includes(`id: ${epicId}\n`));
        return entry ? /requirements: \[(.*)\]/.exec(entry[1])![1]!.split(', ').filter(Boolean) : [];
      },
      setLaneOrder: (_p, epicId, value) => void order.set(epicId, value),
    },
    files: () => ({
      read: async (path) => (files.has(path) ? { content: files.get(path)!, hash: `h${files.get(path)!.length}` } : undefined),
      writeAtomic: async (path, content) => {
        files.set(path, content);
        return 'h';
      },
      remove: async (path) => void files.delete(path),
    }),
    reindex: async (_p, path) => void reindexed.push(path),
    approve: async (_p, path) => void approved.push(path),
  };
  return { service: new EpicService(deps), files, order, approved, reindexed };
}

describe('US-035 AC-2: requirement coverage', () => {
  it('finds the Must-have requirements of a requirements document', () => {
    const content = [
      '### FR-001: Login',
      '**Priority**: Must Have',
      '### FR-002: Profile',
      '**Priority**: Should Have',
      '### NFR-001: Fast',
      '**Priority**: Must Have',
      '### FR-003: Export',
    ].join('\n');
    expect(mustHaveRequirementIds(content)).toEqual(['FR-001', 'NFR-001']);
  });

  it('lists Must-have requirements that no epic covers', async () => {
    const { service } = setup();
    expect(service.uncovered('p1', ['FR-001', 'FR-002', 'NFR-001'])).toEqual(['NFR-001']);
  });
});

describe('US-035 AC-3: create, edit, merge, split, reorder and delete epics', () => {
  it('creates the next epic file with goal, value, requirements and acceptance criteria sections', async () => {
    const { service, files } = setup();
    await expect(service.create('p1', { title: 'Data export' })).resolves.toEqual({
      id: 'EP-003',
      path: 'spec/04_user_stories/epics/EP-003-data-export.md',
    });
    const content = files.get('spec/04_user_stories/epics/EP-003-data-export.md')!;
    expect(content).toMatch(/^---\nkind: epic\nid: EP-003\ntitle: Data export\napproval: draft\nrequirements: \[\]\n---\n/);
    for (const section of ['## Goal', '## Value', '## Acceptance criteria']) expect(content).toContain(section);
  });

  it('merges an epic into another: stories move, requirements are combined, the source is deleted', async () => {
    const { service, files } = setup();
    await service.merge('p1', 'EP-002', 'EP-001');
    expect(files.has('spec/04_user_stories/epics/EP-002-profile.md')).toBe(false);
    expect(files.get('spec/04_user_stories/US-002.md')).toContain('epic: EP-001');
    expect(files.get('spec/04_user_stories/US-003.md')).toContain('epic: EP-001');
    expect(files.get('spec/04_user_stories/epics/EP-001-login.md')).toMatch(
      /requirements:\s*\n?\s*- FR-001\s*\n\s*- FR-002|requirements: \[ FR-001, FR-002 \]|requirements: \[FR-001, FR-002\]/,
    );
    await expect(service.merge('p1', 'EP-001', 'EP-001')).rejects.toThrow(/into itself/);
  });

  it('splits stories of an epic into a new epic', async () => {
    const { service, files } = setup();
    await expect(service.split('p1', 'EP-002', ['US-003'], 'Avatars')).resolves.toEqual({
      id: 'EP-003',
      path: 'spec/04_user_stories/epics/EP-003-avatars.md',
    });
    expect(files.get('spec/04_user_stories/US-003.md')).toContain('epic: EP-003');
    expect(files.get('spec/04_user_stories/US-002.md')).toContain('epic: EP-002');
    await expect(service.split('p1', 'EP-002', ['US-001'], 'X')).rejects.toThrow(/US-001 does not belong to EP-002/);
  });

  it('reorders the lanes', () => {
    const { service, order } = setup();
    service.reorder('p1', ['EP-002', 'EP-001']);
    expect([...order.entries()]).toEqual([
      ['EP-002', 0],
      ['EP-001', 1],
    ]);
  });

  it('deleting asks first how many stories move to No epic, then deletes the epic and clears their epic', async () => {
    const { service, files } = setup();
    expect(service.deletePreview('p1', 'EP-002')).toEqual({ stories: ['US-002', 'US-003'] });
    await service.delete('p1', 'EP-002');
    expect(files.has('spec/04_user_stories/epics/EP-002-profile.md')).toBe(false);
    expect(files.get('spec/04_user_stories/US-002.md')).not.toContain('epic:');
    expect(files.get('spec/04_user_stories/US-002.md')).toContain('Body of US-002');
    await expect(service.delete('p1', 'EP-404')).rejects.toThrow(/Unknown epic EP-404/);
  });
});

describe('US-035 AC-4: approve the epic structure', () => {
  it('approves every Draft epic', async () => {
    const { service, files, approved } = setup();
    files.set('spec/04_user_stories/epics/EP-002-profile.md', epicFile('EP-002', 'Profile', ['FR-002'], 'approved'));
    await expect(service.approveAll('p1')).resolves.toEqual({ approved: ['EP-001'] });
    expect(approved).toEqual(['spec/04_user_stories/epics/EP-001-login.md']);
  });
});

describe('US-039 AC-3/AC-4: moving a story to another epic', () => {
  it('writes the epic; adding to an epic with a confirmed review clears the outcome', async () => {
    const { service, files } = setup();
    files.set(
      'spec/04_user_stories/epics/EP-002-profile.md',
      '---\nkind: epic\nid: EP-002\ntitle: Profile\napproval: approved\nrequirements: [FR-002]\nepic_review:\n  outcome: confirmed\n---\n',
    );
    const deps = (service as unknown as { deps: EpicDeps }).deps;
    const plain = deps.index.epics;
    deps.index.epics = (p) => plain(p).map((e) => (e.id === 'EP-002' ? { ...e, reviewOutcome: 'confirmed' } : e));

    await service.assign('p1', 'US-001', 'EP-002');
    expect(files.get('spec/04_user_stories/US-001.md')).toContain('epic: EP-002');
    expect(files.get('spec/04_user_stories/epics/EP-002-profile.md')).not.toContain('epic_review');

    await service.assign('p1', 'US-001', null);
    expect(files.get('spec/04_user_stories/US-001.md')).not.toContain('epic:');
    await expect(service.assign('p1', 'US-001', 'EP-404')).rejects.toThrow(/Unknown epic/);
  });
});

describe('US-039 AC-4: stories added to a Done epic return it to In progress (FR-095)', () => {
  function doneEpic() {
    const ctx = setup();
    ctx.files.set(
      'spec/04_user_stories/epics/EP-002-profile.md',
      '---\nkind: epic\nid: EP-002\ntitle: Profile\napproval: approved\nrequirements: [FR-002]\nepic_review:\n  outcome: confirmed\n---\n',
    );
    const deps = (ctx.service as unknown as { deps: EpicDeps }).deps;
    const plain = deps.index.epics;
    deps.index.epics = (p) =>
      plain(p).map((e) => (e.id === 'EP-002' && ctx.files.get(e.path)!.includes('epic_review') ? { ...e, reviewOutcome: 'confirmed' } : e));
    return ctx;
  }
  const outcomeOf = (files: Map<string, string>) => files.get('spec/04_user_stories/epics/EP-002-profile.md')!.includes('epic_review');

  it('merging another epic into a Done epic clears its review outcome', async () => {
    const { service, files } = doneEpic();
    await service.merge('p1', 'EP-001', 'EP-002');
    expect(outcomeOf(files)).toBe(false);
  });

  it('new stories of a kept generation run (or a new story file) reopen their Done epic', async () => {
    const { service, files } = doneEpic();
    files.set('spec/04_user_stories/US-009.md', storyFile('US-009', 'EP-002'));
    await service.storiesAdded('p1', ['US-001']);
    expect(outcomeOf(files)).toBe(true);
    await service.storiesAdded('p1', ['US-009']);
    expect(outcomeOf(files)).toBe(false);
  });
});
