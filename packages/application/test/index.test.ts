// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { LAYER } from '../src/index.js';

describe('US-004 AC-1: @specforge/application package', () => {
  it('exposes its architectural layer', () => {
    expect(LAYER).toBe('application');
  });
});
