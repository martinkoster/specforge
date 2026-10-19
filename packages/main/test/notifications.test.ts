// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { notificationContent } from '../src/notifications.js';

describe('US-053 AC-3: OS notifications requested by the renderer', () => {
  it('accepts plain text title and body, trimmed and length-limited', () => {
    expect(notificationContent(' SpecForge ', 'US-002: run failed')).toEqual({ title: 'SpecForge', body: 'US-002: run failed' });
    expect(notificationContent('T', 'x'.repeat(500))!.body).toHaveLength(300);
  });

  it('rejects anything else', () => {
    expect(notificationContent(1, 'b')).toBeUndefined();
    expect(notificationContent('t', { html: '<b>' })).toBeUndefined();
    expect(notificationContent('', 'b')).toBeUndefined();
  });
});
