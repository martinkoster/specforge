// SPDX-License-Identifier: Apache-2.0
// US-078 (ADR-024, D27): per-project specification root — layout, validation and built-in denies.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC_ROOT, builtInDenial, specLayout, specRootError, type PermissionContext } from '../src/index.js';

const base: PermissionContext = {
  runKind: 'implement',
  toolName: 'Write',
  input: {},
  writes: [],
  nonGit: false,
  implementationActive: false,
};

describe('US-078 AC-1/AC-5: specification layout', () => {
  it('defaults to spec/ and builds the phase folders below the root', () => {
    expect(DEFAULT_SPEC_ROOT).toBe('spec');
    const layout = specLayout();
    expect(layout.root).toBe('spec');
    expect(layout.intentPath).toBe('spec/01_intent/intent.md');
    expect(layout.folders).toEqual({
      intent: 'spec/01_intent',
      requirements: 'spec/02_requirements',
      design: 'spec/03_design',
      stories: 'spec/04_user_stories',
      epics: 'spec/04_user_stories/epics',
      test_concepts: 'spec/05_test_concepts',
    });
  });

  it('uses a nested root such as docs/spec', () => {
    const layout = specLayout('docs/spec');
    expect(layout.intentPath).toBe('docs/spec/01_intent/intent.md');
    expect(layout.folders.stories).toBe('docs/spec/04_user_stories');
    expect(layout.isSpecPath('docs/spec/02_requirements/fr.md')).toBe(true);
    expect(layout.isSpecPath('docs/spec')).toBe(true);
    expect(layout.isSpecPath('.specforge/project.yaml')).toBe(true);
    expect(layout.isSpecPath('spec/user_spec.rb')).toBe(false);
    expect(layout.isSpecPath('docs/specs/x.md')).toBe(false);
    expect(layout.isStoryFile('docs/spec/04_user_stories/US-001-a.md')).toBe(true);
    expect(layout.isStoryFile('docs/spec/04_user_stories/epics/EP-001-a.md')).toBe(true);
    expect(layout.isStoryFile('spec/04_user_stories/US-001-a.md')).toBe(false);
  });

  it('maps paths to phases and to root-relative display paths', () => {
    const layout = specLayout('docs/spec');
    expect(layout.phaseOf('docs/spec/01_intent/intent.md')).toBe('intent');
    expect(layout.phaseOf('docs/spec/03_design/technical_design/c4.md')).toBe('design');
    expect(layout.phaseOf('docs/spec/04_user_stories/epics/EP-001.md')).toBe('stories');
    expect(layout.phaseOf('docs/spec/05_test_concepts/tc.md')).toBe('test_concepts');
    expect(layout.phaseOf('src/main.ts')).toBeUndefined();
    expect(layout.display('docs/spec/01_intent/intent.md')).toBe('01_intent/intent.md');
    expect(layout.display('.specforge/instructions.md')).toBe('.specforge/instructions.md');
  });

  it('normalises backslashes and trailing slashes of the root', () => {
    expect(specLayout('docs\\spec\\').root).toBe('docs/spec');
  });

  it('validates the root: relative, inside the workspace, outside .specforge', () => {
    expect(specRootError('spec')).toBeUndefined();
    expect(specRootError('docs/spec')).toBeUndefined();
    expect(specRootError('')).toMatch(/must not be empty/);
    expect(specRootError('/abs/spec')).toMatch(/relative/);
    expect(specRootError('C:\\spec')).toMatch(/relative/);
    expect(specRootError('../spec')).toMatch(/inside the project folder/);
    expect(specRootError('docs/../../spec')).toMatch(/inside the project folder/);
    expect(specRootError('.specforge/spec')).toMatch(/\.specforge/);
    expect(specRootError('.')).toMatch(/inside the project folder/);
  });
});

describe('US-078 AC-2: built-in denies follow the specification root', () => {
  it('denies implementation writes below the configured root but allows a top-level spec/ folder', () => {
    const ctx = { ...base, specRoot: 'docs/spec' };
    expect(builtInDenial({ ...ctx, writes: ['docs/spec/x.md'] })).toMatch(/docs\/spec\/\*\*/);
    expect(builtInDenial({ ...ctx, writes: ['spec/x.rb'] })).toBeUndefined();
    expect(builtInDenial({ ...ctx, writes: ['.specforge/project.yaml'] })).toMatch(/may not change specifications/);
  });

  it('keeps spec/ as the default root', () => {
    expect(builtInDenial({ ...base, writes: ['spec/x.md'] })).toMatch(/spec\/\*\*/);
  });

  it('protects story status in story files below the configured root', () => {
    const ctx: PermissionContext = {
      ...base,
      runKind: 'generate',
      specRoot: 'docs/spec',
      input: { content: 'status: done' },
      writes: ['docs/spec/04_user_stories/US-001-a.md'],
    };
    expect(builtInDenial(ctx)).toMatch(/cannot change story status/);
    expect(builtInDenial({ ...ctx, writes: ['spec/04_user_stories/US-001-a.md'] })).toBeUndefined();
  });
});
