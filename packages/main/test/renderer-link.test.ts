// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RendererLink } from '../src/renderer-link.js';

function setup() {
  const sent: Array<[string, unknown]> = [];
  const link = new RendererLink<string>({
    postPort: (port) => sent.push(['port', port]),
    sendStatus: (status) => sent.push(['status', status]),
  });
  return { link, sent };
}

describe('US-065 AC-2: the core starts while the page loads (NFR-003)', () => {
  it('holds the port and the latest status until the page has loaded', () => {
    const { link, sent } = setup();
    link.status('starting');
    link.port('p1');
    link.status('connected');
    expect(sent).toEqual([]);

    link.loaded();
    expect(sent).toEqual([
      ['status', 'connected'],
      ['port', 'p1'],
    ]);
  });

  it('delivers directly once the page is loaded (core restarts, US-005)', () => {
    const { link, sent } = setup();
    link.loaded();
    link.status('reconnecting');
    link.port('p2');
    expect(sent).toEqual([
      ['status', 'reconnecting'],
      ['port', 'p2'],
    ]);
  });

  it('a page that loaded without the core gets nothing until the core reports', () => {
    const { link, sent } = setup();
    link.loaded();
    expect(sent).toEqual([]);
  });
});
