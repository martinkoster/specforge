// SPDX-License-Identifier: Apache-2.0
// VCS port on the system Git (US-018, US-019, US-079): availability, mode/branch detection, repository location, init and initial commit.
import type { GitLocation, VcsInfo, VcsPort } from '@specforge/application';
import { GitClient } from './git-client.js';

/** Used only when the user has no Git identity configured, so the initial commit cannot fail. */
const FALLBACK_IDENTITY = ['-c', 'user.name=SpecForge', '-c', 'user.email=specforge@localhost'];

export class GitVcs implements VcsPort {
  constructor(private readonly git = new GitClient()) {}

  async available(): Promise<boolean> {
    try {
      await this.git.version();
      return true;
    } catch {
      return false;
    }
  }

  async detect(path: string): Promise<VcsInfo> {
    const inside = await this.git.raw(path, ['rev-parse', '--is-inside-work-tree']);
    if (inside.code !== 0 || inside.stdout !== 'true') return { mode: 'none' };
    const branch = await this.git.raw(path, ['symbolic-ref', '--short', '-q', 'HEAD']);
    return { mode: 'git', branch: branch.code === 0 && branch.stdout !== '' ? branch.stdout : null };
  }

  async branchExists(path: string, branch: string): Promise<boolean> {
    return this.git.test(path, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  }

  async init(path: string): Promise<void> {
    await this.git.run(path, ['init']);
  }

  async location(path: string): Promise<GitLocation> {
    const prefix = await this.git.raw(path, ['rev-parse', '--show-prefix']);
    if (prefix.code !== 0) return 'none';
    return prefix.stdout === '' ? 'root' : 'subfolder';
  }

  async commitAll(path: string, message: string): Promise<void> {
    await this.git.run(path, ['add', '-A']);
    await this.commit(path, message);
  }

  async commitPaths(path: string, paths: readonly string[], message: string): Promise<void> {
    await this.git.run(path, ['add', '--', ...paths]);
    await this.commit(path, message);
  }

  private async commit(path: string, message: string): Promise<void> {
    const email = await this.git.raw(path, ['config', 'user.email']);
    const identity = email.code === 0 && email.stdout !== '' ? [] : FALLBACK_IDENTITY;
    await this.git.run(path, [...identity, 'commit', '-q', '-m', message]);
  }
}
