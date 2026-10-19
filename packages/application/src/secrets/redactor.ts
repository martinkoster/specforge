// SPDX-License-Identifier: Apache-2.0
// Redacts secrets from every event before persistence and display (NFR-006, ADR-012).

const MASK = '***';
const MIN_SECRET_LENGTH = 6;
const PATTERNS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /sk-ant-[A-Za-z0-9_-]{10,}/g, replace: MASK },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: MASK },
  { pattern: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/g, replace: `$1 ${MASK}` },
];

export interface Redactor {
  text(value: string): string;
  /** Deep-redacts all strings in a JSON-like value (events, tool inputs). */
  value<T>(value: T): T;
}

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createRedactor(knownSecrets: readonly string[]): Redactor {
  const secrets = [...new Set(knownSecrets.filter((s) => s.length >= MIN_SECRET_LENGTH))].sort((a, b) => b.length - a.length);
  const known = secrets.length > 0 ? new RegExp(secrets.map(escape).join('|'), 'g') : undefined;

  const text = (value: string): string => {
    let out = known ? value.replace(known, MASK) : value;
    for (const { pattern, replace } of PATTERNS) out = out.replace(pattern, replace);
    return out;
  };

  const deep = (value: unknown): unknown => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(deep);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deep(v)]));
    }
    return value;
  };

  return { text, value: <T>(value: T) => deep(value) as T };
}
