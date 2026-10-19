// SPDX-License-Identifier: Apache-2.0
// Generated message for "Commit spec changes" (US-023, FR-072); the user can edit it before committing.

export interface SpecChange {
  path: string;
  change: 'A' | 'M' | 'D';
}

/** Spec area of a path: the phase folder below spec/, or "project settings" for .specforge/. */
function areaOf(path: string): string {
  const [root, folder] = path.split('/');
  return root === '.specforge' ? 'project settings' : (folder ?? path);
}

export function specCommitMessage(files: readonly SpecChange[]): string {
  const subject = files.length === 1 ? files[0]!.path.split('/').at(-1)! : [...new Set(files.map((f) => areaOf(f.path)))].join(', ');
  return [`Update specification: ${subject}`, '', ...files.map((f) => `${f.change} ${f.path}`)].join('\n');
}
