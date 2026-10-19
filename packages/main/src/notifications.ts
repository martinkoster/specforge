// SPDX-License-Identifier: Apache-2.0
// OS notifications requested by the renderer (US-053 AC-3): plain text only, length-limited.

const MAX_TITLE = 100;
const MAX_BODY = 300;

export function notificationContent(title: unknown, body: unknown): { title: string; body: string } | undefined {
  if (typeof title !== 'string' || typeof body !== 'string') return undefined;
  const t = title.trim().slice(0, MAX_TITLE);
  if (t === '') return undefined;
  return { title: t, body: body.trim().slice(0, MAX_BODY) };
}
