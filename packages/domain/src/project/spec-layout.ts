// SPDX-License-Identifier: Apache-2.0
// Specification root per project (US-078, ADR-024, intent D27): the folder below the workspace that holds the
// specifications. Paths stay workspace-relative (what agents, Git and the index see); only the prefix is configurable.

/** Root used by new projects and by projects whose `project.yaml` has no `specRoot`. */
export const DEFAULT_SPEC_ROOT = 'spec';

export type SpecFolder = 'intent' | 'requirements' | 'design' | 'stories' | 'epics' | 'test_concepts';
export type SpecFolderPhase = Exclude<SpecFolder, 'epics'>;

const SUBFOLDERS: Record<SpecFolder, string> = {
  intent: '01_intent',
  requirements: '02_requirements',
  design: '03_design',
  stories: '04_user_stories',
  epics: '04_user_stories/epics',
  test_concepts: '05_test_concepts',
};
const PHASES: SpecFolderPhase[] = ['intent', 'requirements', 'design', 'stories', 'test_concepts'];
const SETTINGS_FOLDER = '.specforge';

export interface SpecLayout {
  /** Normalised root, POSIX, without trailing slash (e.g. `spec`, `docs/spec`). */
  readonly root: string;
  readonly intentPath: string;
  readonly folders: Readonly<Record<SpecFolder, string>>;
  /** Specification content or SpecForge settings (`<root>/**`, `.specforge/**`). */
  isSpecPath(path: string): boolean;
  /** A Markdown file below the stories folder (stories and epics). */
  isStoryFile(path: string): boolean;
  /** Phase folder a workspace-relative path belongs to. */
  phaseOf(path: string): SpecFolderPhase | undefined;
  /** Path as shown to users: relative to the root for specification content. */
  display(path: string): string;
}

const normalise = (root: string): string => root.replace(/\\/g, '/').replace(/\/+$/, '');
const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

export function specLayout(specRoot: string = DEFAULT_SPEC_ROOT): SpecLayout {
  const root = normalise(specRoot);
  const folders = Object.fromEntries(Object.entries(SUBFOLDERS).map(([k, sub]) => [k, `${root}/${sub}`])) as Record<SpecFolder, string>;
  return {
    root,
    intentPath: `${folders.intent}/intent.md`,
    folders,
    isSpecPath: (path) => within(path, root) || within(path, SETTINGS_FOLDER),
    isStoryFile: (path) => path.startsWith(`${folders.stories}/`) && path.endsWith('.md'),
    phaseOf: (path) => PHASES.find((phase) => within(path, folders[phase])),
    display: (path) => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path),
  };
}

/** Why a specification root is invalid, or undefined if it is acceptable. */
export function specRootError(specRoot: string): string | undefined {
  const root = normalise(specRoot.trim());
  if (root === '') return 'The specification folder must not be empty.';
  if (/^([a-zA-Z]:)?\//.test(root)) return 'The specification folder must be a relative path inside the project folder.';
  // No `.`/`..` or empty segments: the root must name a folder strictly inside the workspace, in canonical form.
  if (root.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return 'The specification folder must be inside the project folder (no "." or ".." segments).';
  }
  if (within(root, SETTINGS_FOLDER)) return 'The specification folder must not be inside .specforge.';
  return undefined;
}
