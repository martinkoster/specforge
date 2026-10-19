// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RESULT_INSTRUCTION, parseRunResult } from '../src/index.js';

const fenced = (json: string) => `I implemented the story.\n\n\`\`\`specforge-result\n${json}\n\`\`\`\n`;

describe('US-051 AC-1: structured result (ADR-008, FR-036)', () => {
  it('extracts and validates the fenced specforge-result JSON', () => {
    const text = fenced(
      JSON.stringify({
        outcome: 'success',
        summary: 'Added login endpoint and tests.',
        tests: { run: 12, passed: 12, failed: 0 },
        coverage: 91.5,
        changedFiles: ['src/login.ts', 'test/login.test.ts'],
        openIssues: ['Password reset not covered'],
        recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
      }),
    );

    expect(parseRunResult(text)).toEqual({
      available: true,
      result: {
        outcome: 'success',
        summary: 'Added login endpoint and tests.',
        tests: { run: 12, passed: 12, failed: 0 },
        coverage: 91.5,
        changedFiles: ['src/login.ts', 'test/login.test.ts'],
        openIssues: ['Password reset not covered'],
        recommendations: [{ type: 'follow_up', text: 'Add rate limiting' }],
      },
    });
  });

  it('uses the last block when several are present; optional fields may be missing', () => {
    const text = fenced('{"outcome":"failed","summary":"old"}') + fenced('{"outcome":"partial","summary":"Half done"}');
    expect(parseRunResult(text)).toEqual({
      available: true,
      result: { outcome: 'partial', summary: 'Half done', changedFiles: [], openIssues: [], recommendations: [] },
    });
  });

  it('reports "result unavailable" for a missing block, invalid JSON or a schema violation', () => {
    expect(parseRunResult('Done, no block.')).toEqual({ available: false, reason: 'The agent did not report a structured result.' });
    expect(parseRunResult(fenced('{not json'))).toEqual({ available: false, reason: expect.stringMatching(/not valid JSON/) });
    expect(parseRunResult(fenced('{"outcome":"great","summary":"x"}'))).toEqual({
      available: false,
      reason: expect.stringMatching(/outcome/),
    });
    expect(parseRunResult(fenced('{"outcome":"success","summary":"x","tests":{"run":-1,"passed":0,"failed":0}}'))).toMatchObject({
      available: false,
    });
  });

  it('publishes the instruction that tells the agent how to report', () => {
    expect(RESULT_INSTRUCTION).toContain('```specforge-result');
    expect(RESULT_INSTRUCTION).toMatch(/outcome/);
  });
});
