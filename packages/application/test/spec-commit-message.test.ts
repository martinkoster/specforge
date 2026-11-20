// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { specCommitMessage } from '../src/index.js';

describe('US-023 AC-2: generated commit message', () => {
  it('names the changed spec areas in the subject and lists the files in the body', () => {
    expect(
      specCommitMessage([
        { path: 'spec/02_requirements/fr.md', change: 'M' },
        { path: 'spec/03_design/technical_design/adr.md', change: 'A' },
        { path: 'spec/03_design/old.md', change: 'D' },
        { path: '.specforge/project.yaml', change: 'M' },
      ]),
    ).toBe(
      [
        'Update specification: 02_requirements, 03_design, project settings',
        '',
        'M spec/02_requirements/fr.md',
        'A spec/03_design/technical_design/adr.md',
        'D spec/03_design/old.md',
        'M .specforge/project.yaml',
      ].join('\n'),
    );
  });

  it('uses the file name for a single file', () => {
    expect(specCommitMessage([{ path: 'spec/01_intent/intent.md', change: 'M' }])).toBe(
      'Update specification: intent.md\n\nM spec/01_intent/intent.md',
    );
  });
});

describe('US-078: commit message areas below a nested specification root', () => {
  it('names the phase folders, not the root', () => {
    expect(
      specCommitMessage([
        { path: 'docs/spec/02_requirements/fr.md', change: 'M' },
        { path: 'docs/spec/03_design/c4.md', change: 'A' },
        { path: '.specforge/instructions.md', change: 'M' },
      ]).split('\n')[0],
    ).toBe('Update specification: 02_requirements, 03_design, project settings');
  });
});
