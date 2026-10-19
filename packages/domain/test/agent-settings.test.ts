// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXEC_DEFAULTS, effectiveAgentSettings, validateAgentSettings, validateExecDefaults } from '../src/index.js';

describe('US-015 AC-4: project overrides of agent settings take precedence', () => {
  it('overrides defined fields and merges environment variables by name', () => {
    const effective = effectiveAgentSettings(
      {
        model: 'claude-opus-5-5',
        effort: 'high',
        maxTurns: 50,
        env: [
          { name: 'A', value: '1' },
          { name: 'TOKEN', secretRef: 'global:TOKEN' },
        ],
      },
      {
        model: 'claude-sonnet-5-5',
        env: [
          { name: 'A', value: '2' },
          { name: 'B', value: 'x' },
        ],
      },
    );

    expect(effective).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'high',
      maxTurns: 50,
      env: [
        { name: 'A', value: '2' },
        { name: 'TOKEN', secretRef: 'global:TOKEN' },
        { name: 'B', value: 'x' },
      ],
    });
  });

  it('uses the global settings when there is no override', () => {
    expect(effectiveAgentSettings({ env: [] }, undefined)).toEqual({ env: [] });
  });
});

describe('US-015 AC-1/AC-2: validation', () => {
  it('rejects invalid environment variable names, duplicates and turn limits', () => {
    expect(validateAgentSettings({ env: [{ name: 'GOOD_1', value: 'x' }] })).toEqual([]);
    expect(validateAgentSettings({ env: [{ name: '1BAD', value: 'x' }] })).toEqual(['"1BAD" is not a valid environment variable name.']);
    expect(
      validateAgentSettings({
        env: [
          { name: 'A', value: '1' },
          { name: 'A', value: '2' },
        ],
      }),
    ).toEqual(['Environment variable A is defined twice.']);
    expect(validateAgentSettings({ maxTurns: 0, env: [] })).toEqual(['Max turns must be a whole number of at least 1.']);
  });

  it('validates execution defaults', () => {
    expect(DEFAULT_EXEC_DEFAULTS).toEqual({
      maxRunDurationS: 3600,
      idleTimeoutS: 600,
      notifications: true,
      logRetentionDays: 30,
      logLevel: 'info',
      mergeCheckIntervalS: 60,
    });
    expect(validateExecDefaults(DEFAULT_EXEC_DEFAULTS)).toEqual([]);
    expect(
      validateExecDefaults({ ...DEFAULT_EXEC_DEFAULTS, maxRunDurationS: 30, idleTimeoutS: 0, logRetentionDays: 0, mergeCheckIntervalS: 5 }),
    ).toEqual([
      'Max run duration must be at least 60 seconds.',
      'Idle timeout must be at least 30 seconds.',
      'Log retention must be at least 1 day.',
      'The merge check interval must be at least 10 seconds.',
    ]);
    // US-024 AC-1: merged branches are checked every 60 s by default.
    expect(DEFAULT_EXEC_DEFAULTS.mergeCheckIntervalS).toBe(60);
  });
});
