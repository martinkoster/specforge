// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { createRedactor, isSecretRef, resolveAgentEnv, type SecretResolver } from '../src/index.js';

describe('US-011 AC-1: the core holds secret references and resolves them just-in-time', () => {
  it('stores only references in configuration and resolves values when the agent environment is built', async () => {
    const resolver: SecretResolver = { resolve: vi.fn(async (key: string) => (key === 'anthropic' ? 'sk-ant-api03-value' : 'other')) };
    const config = { env: { ANTHROPIC_API_KEY: { secretRef: 'anthropic' }, LOG_LEVEL: 'debug' } };

    expect(JSON.stringify(config)).not.toContain('sk-ant');
    expect(resolver.resolve).not.toHaveBeenCalled();

    const env = await resolveAgentEnv(config.env, resolver);

    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-api03-value', LOG_LEVEL: 'debug' });
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(isSecretRef(config.env.ANTHROPIC_API_KEY)).toBe(true);
    expect(isSecretRef('plain')).toBe(false);
  });
});

describe('US-011 AC-3: SecretRedactor', () => {
  it('replaces known secret values everywhere in a text', () => {
    const redact = createRedactor(['hunter2-secret']);
    expect(redact.text('a hunter2-secret b hunter2-secret')).toBe('a *** b ***');
  });

  it('replaces Anthropic key patterns even when the value is not registered', () => {
    const redact = createRedactor([]);
    expect(redact.text('key=sk-ant-api03-AbCdEf_0123456789-xyz end')).toBe('key=*** end');
  });

  it('replaces AWS access key ids and bearer tokens', () => {
    const redact = createRedactor([]);
    expect(redact.text('AKIAABCDEFGHIJKLMNOP and Authorization: Bearer abc.def-123')).toBe('*** and Authorization: Bearer ***');
  });

  it('redacts all strings in nested event payloads without changing other values', () => {
    const redact = createRedactor(['s3cr3t-value']);
    const event = {
      type: 'tool_use',
      toolUseId: 't1',
      toolName: 'Bash',
      input: { command: 'echo s3cr3t-value', args: ['x', 's3cr3t-value'], n: 3 },
    };

    expect(redact.value(event)).toEqual({
      type: 'tool_use',
      toolUseId: 't1',
      toolName: 'Bash',
      input: { command: 'echo ***', args: ['x', '***'], n: 3 },
    });
  });

  it('ignores trivially short registered values to avoid destroying normal text', () => {
    const redact = createRedactor(['ab', '']);
    expect(redact.text('abc')).toBe('abc');
  });

  it('escapes regular-expression characters in secret values', () => {
    const redact = createRedactor(['p@ss.word*+?']);
    expect(redact.text('x p@ss.word*+? y p@ssXword')).toBe('x *** y p@ssXword');
  });
});
