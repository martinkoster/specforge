// SPDX-License-Identifier: Apache-2.0
// ResultParser (US-051, ADR-008, FR-036): extracts the fenced `specforge-result` JSON from the agent's final message
// and validates it; a missing or invalid block means "result unavailable" — the computed changes stay authoritative.
import { z } from 'zod';

const RunResultSchema = z.object({
  outcome: z.enum(['success', 'partial', 'failed']),
  summary: z.string().min(1),
  tests: z
    .object({ run: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() })
    .optional(),
  coverage: z.number().min(0).max(100).optional(),
  changedFiles: z.array(z.string()).default([]),
  openIssues: z.array(z.string()).default([]),
  recommendations: z.array(z.object({ type: z.string(), text: z.string() })).default([]),
});

export type RunResult = z.infer<typeof RunResultSchema>;
export type ParsedResult = { available: true; result: RunResult } | { available: false; reason: string };

/** Appended to the system prompt of implementation runs. */
export const RESULT_INSTRUCTION = [
  'When you are done, end your final message with a fenced block in exactly this format:',
  '```specforge-result',
  '{"outcome": "success" | "partial" | "failed", "summary": "<what you did>", "tests": {"run": 0, "passed": 0, "failed": 0},',
  ' "coverage": <percent, optional>, "changedFiles": ["<path>"], "openIssues": ["<issue>"], "recommendations": [{"type": "<kind>", "text": "<text>"}]}',
  '```',
].join('\n');

const BLOCK = /```specforge-result[^\n]*\n([\s\S]*?)```/g;

export function parseRunResult(finalText: string): ParsedResult {
  const blocks = [...finalText.matchAll(BLOCK)];
  const last = blocks.at(-1)?.[1];
  if (last === undefined) return { available: false, reason: 'The agent did not report a structured result.' };
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch {
    return { available: false, reason: 'The structured result is not valid JSON.' };
  }
  const parsed = RunResultSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { available: false, reason: `The structured result is invalid: ${issue.path.join('.') || 'value'} — ${issue.message}` };
  }
  return { available: true, result: parsed.data };
}
