// SPDX-License-Identifier: Apache-2.0
// Spec baselines (US-096, FR-112, UC-048): annotated Git tags on the base-branch commit with notes listing the included
// feature intents and epics; files can be read at a baseline to compare them with the current content.
import { GitClient } from './git-client.js';

export interface BaselineTag {
  tag: string;
  commit: string;
  createdAt: string;
  notes: string;
}

const SEP = '\u001f';
const END = '\u001e';

export class SpecBaselines {
  constructor(private readonly git = new GitClient()) {}

  /** Annotated tags, newest first (all tags — the caller decides which ones are baselines). */
  async list(repo: string): Promise<BaselineTag[]> {
    const out = await this.git.run(repo, [
      'for-each-ref',
      '--sort=-creatordate',
      `--format=%(refname:short)${SEP}%(*objectname)${SEP}%(creatordate:iso-strict)${SEP}%(contents)${END}`,
      'refs/tags',
    ]);
    return out
      .split(END)
      .map((entry) => entry.replace(/^\n/, ''))
      .filter((entry) => entry.includes(SEP))
      .map((entry) => {
        const [tag, commit, createdAt, notes] = entry.split(SEP) as [string, string, string, string];
        return { tag, commit, createdAt, notes: notes.trimEnd() };
      })
      .filter((t) => t.commit !== '');
  }

  /** Creates the annotated tag `tag` on `ref` (e.g. the base branch); refuses invalid or existing names. */
  async create(repo: string, input: { tag: string; ref: string; notes: string }): Promise<{ commit: string }> {
    const valid = await this.git.raw(repo, ['check-ref-format', `refs/tags/${input.tag}`]);
    if (valid.code !== 0 || input.tag.startsWith('-')) throw new Error(`"${input.tag}" is not a valid tag name.`);
    const existing = await this.git.raw(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${input.tag}`]);
    if (existing.code === 0) throw new Error(`The tag ${input.tag} exists already.`);
    const commit = (await this.git.run(repo, ['rev-parse', '--verify', `${input.ref}^{commit}`])).trim();
    // An annotated tag needs a tagger: without a configured identity SpecForge tags as itself (like its commits).
    const email = await this.git.raw(repo, ['config', 'user.email']);
    const identity = email.code === 0 && email.stdout !== '' ? [] : ['-c', 'user.name=SpecForge', '-c', 'user.email=specforge@localhost'];
    await this.git.run(repo, [...identity, 'tag', '-a', input.tag, '-m', input.notes, commit]);
    return { commit };
  }

  /** Content of `path` at `tag`, or null when the file did not exist there. */
  async fileAt(repo: string, tag: string, path: string): Promise<string | null> {
    const blob = await this.git.blob(repo, `refs/tags/${tag}`, path);
    return blob === undefined ? null : blob.toString('utf8');
  }
}
