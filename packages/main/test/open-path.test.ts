// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { handleOpenPath } from '../src/open-path.js';

describe('US-057 AC-3: Open in editor (core → main)', () => {
  it('opens absolute paths requested by the core with the OS default application', async () => {
    const open = vi.fn(async () => '');
    const path = join(tmpdir(), 'wt', 'US-001', 'src', 'a.ts');
    expect(await handleOpenPath({ type: 'open-path', path }, open)).toBe(true);
    expect(open).toHaveBeenCalledWith(path);
  });

  it('ignores other messages and relative or malformed paths', async () => {
    const open = vi.fn(async () => '');
    expect(await handleOpenPath({ type: 'secret', id: 1 }, open)).toBe(false);
    expect(await handleOpenPath({ type: 'open-path', path: 'src/a.ts' }, open)).toBe(false);
    expect(await handleOpenPath({ type: 'open-path', path: 42 }, open)).toBe(false);
    expect(await handleOpenPath(null, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
