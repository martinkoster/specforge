// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom
// US-078 AC-3: areas use the project's specification root and show paths relative to it.
import { render, screen } from '@testing-library/react';
import { specLayout } from '@specforge/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntentArea } from '../src/intent/IntentArea.js';
import { ArtifactList } from '../src/specs/ArtifactList.js';
import { SpecificationsArea } from '../src/specs/SpecificationsArea.js';
import { SpecLayoutContext } from '../src/specs/spec-layout-context.js';
import { closeFakeCores, fakeCoreWithEvents } from './fake-core.js';
import { cleanupChecked } from './styled-controls.js';

afterEach(() => {
  cleanupChecked();
  closeFakeCores();
});

const INTENT = 'docs/spec/01_intent/intent.md';

describe('US-078 AC-3: specification root in the UI', () => {
  it('reads the intent below docs/spec and shows its path relative to the root', async () => {
    const read = vi.fn(async () => ({ content: '---\nkind: intent\napproval: draft\n---\n## Vision\n', hash: 'h1' }));
    const { session } = await fakeCoreWithEvents({
      'artifact.read': read,
      'artifacts.list': async () => [{ kind: 'intent', label: 'Intent', artifacts: [{ path: INTENT, approval: 'draft', invalid: null }] }],
      'clarify.current': async () => null,
      'quality.findings': async () => [],
    });
    render(
      <SpecLayoutContext.Provider value={specLayout('docs/spec')}>
        <IntentArea session={session} projectId="p1" />
      </SpecLayoutContext.Provider>,
    );
    expect(await screen.findByText('01_intent/intent.md')).toHaveAttribute('title', INTENT);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ path: INTENT }));
  });

  it('lists artifacts with root-relative paths as tooltips', () => {
    render(
      <SpecLayoutContext.Provider value={specLayout('docs/spec')}>
        <ArtifactList
          groups={[
            {
              kind: 'requirements',
              label: 'Requirements',
              artifacts: [{ path: 'docs/spec/02_requirements/fr.md', approval: 'draft', invalid: null }],
            },
          ]}
          selected={null}
          onSelect={() => undefined}
        />
      </SpecLayoutContext.Provider>,
    );
    expect(screen.getByRole('button', { name: 'fr.md' })).toHaveAttribute('title', '02_requirements/fr.md');
  });
});

describe('US-078 AC-3: phase filter of the Specifications area', () => {
  it('shows only the artifacts of the phase folder below docs/spec', async () => {
    const { session } = await fakeCoreWithEvents({
      'artifacts.list': async () => [
        {
          kind: 'requirements',
          label: 'Requirements',
          artifacts: [
            { path: 'docs/spec/02_requirements/fr.md', approval: 'draft', invalid: null },
            { path: 'spec/02_requirements/other.md', approval: 'draft', invalid: null },
          ],
        },
        { kind: 'design', label: 'Design', artifacts: [{ path: 'docs/spec/03_design/c4.md', approval: 'draft', invalid: null }] },
      ],
      'trace.issues': async () => ({ issues: [] }),
    });
    render(
      <SpecLayoutContext.Provider value={specLayout('docs/spec')}>
        <SpecificationsArea session={session} projectId="p1" phase="requirements" />
      </SpecLayoutContext.Provider>,
    );
    expect(await screen.findByRole('button', { name: 'fr.md' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'other.md' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'c4.md' })).toBeNull();
  });
});
