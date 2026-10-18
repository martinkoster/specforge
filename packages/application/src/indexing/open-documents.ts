// SPDX-License-Identifier: Apache-2.0
// Tracks documents open in editors and detects conflicts with external changes (FR-018, US-021 AC-3).
import { createTwoFilesPatch } from 'diff';

export interface OpenDocument {
  path: string;
  content: string;
  baseHash: string;
  dirty: boolean;
}

export type ConflictResolution = 'keep-mine' | 'take-theirs';

export interface DocumentConflict {
  path: string;
  mine: string;
  theirs: string;
  theirsHash: string;
  /** Unified diff from the disk version (theirs) to the unsaved draft (mine). */
  diff: string;
  options: ['keep-mine', 'take-theirs', 'diff'];
}

export interface DocumentWriter {
  writeAtomic(path: string, content: string, options: { expectedHash: string | null }): Promise<string>;
}

export class OpenDocuments {
  private readonly docs = new Map<string, OpenDocument>();
  private readonly conflicts = new Map<string, DocumentConflict>();

  constructor(
    private readonly writer: DocumentWriter,
    private readonly onConflict: (conflict: DocumentConflict) => void,
  ) {}

  open(path: string, content: string, hash: string): void {
    this.docs.set(path, { path, content, baseHash: hash, dirty: false });
  }

  edit(path: string, content: string): void {
    const doc = this.require(path);
    this.docs.set(path, { ...doc, content, dirty: true });
  }

  get(path: string): OpenDocument | undefined {
    return this.docs.get(path);
  }

  close(path: string): void {
    this.docs.delete(path);
    this.conflicts.delete(path);
  }

  /** Called by the reconciler when a watched file changed on disk. */
  externalChange(path: string, theirs: string, theirsHash: string): void {
    const doc = this.docs.get(path);
    if (!doc || theirsHash === doc.baseHash) return;
    if (!doc.dirty) {
      this.docs.set(path, { ...doc, content: theirs, baseHash: theirsHash });
      return;
    }
    const conflict: DocumentConflict = {
      path,
      mine: doc.content,
      theirs,
      theirsHash,
      diff: createTwoFilesPatch(`${path} (on disk)`, `${path} (your changes)`, theirs, doc.content),
      options: ['keep-mine', 'take-theirs', 'diff'],
    };
    this.conflicts.set(path, conflict);
    this.onConflict(conflict);
  }

  async resolve(path: string, resolution: ConflictResolution): Promise<void> {
    const conflict = this.conflicts.get(path);
    if (!conflict) throw new Error(`No conflict pending for ${path}.`);
    this.conflicts.delete(path);
    if (resolution === 'take-theirs') {
      this.docs.set(path, { path, content: conflict.theirs, baseHash: conflict.theirsHash, dirty: false });
      return;
    }
    const hash = await this.writer.writeAtomic(path, conflict.mine, { expectedHash: conflict.theirsHash });
    this.docs.set(path, { path, content: conflict.mine, baseHash: hash, dirty: false });
  }

  private require(path: string): OpenDocument {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`${path} is not open.`);
    return doc;
  }
}
