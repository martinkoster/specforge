// SPDX-License-Identifier: Apache-2.0
// Secret references (ADR-012): configuration stores `{ secretRef }`; values are resolved just-in-time.

export interface SecretRef {
  secretRef: string;
}

/** Port implemented by the main process (OS credential store via safeStorage). */
export interface SecretResolver {
  resolve(key: string): Promise<string>;
}

export type EnvValue = string | SecretRef;

export function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === 'object' && value !== null && typeof (value as SecretRef).secretRef === 'string';
}

/** Builds the agent process environment, resolving secret references only now. */
export async function resolveAgentEnv(env: Record<string, EnvValue>, resolver: SecretResolver): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(env).map(async ([name, value]) => [name, isSecretRef(value) ? await resolver.resolve(value.secretRef) : value] as const),
  );
  return Object.fromEntries(entries);
}
