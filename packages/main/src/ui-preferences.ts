// SPDX-License-Identifier: Apache-2.0
// Colour theme preference (US-077, FR-117, ADR-023): owned by main, stored in `<userData>/ui-preferences.json`, applied
// via `nativeTheme.themeSource` before the window exists, so CSS media queries, native controls and the title bar follow.
import { readFileSync, writeFileSync } from 'node:fs';

export type Theme = 'system' | 'light' | 'dark';

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
/** Window background before the page paints; mirrors `--bg` in packages/ui/src/styles/tokens.css. */
const BACKGROUND = { light: '#ffffff', dark: '#0c0c0e' } as const;

export function parseTheme(value: unknown): Theme | undefined {
  return THEMES.find((theme) => theme === value);
}

/** The stored preference; missing, unreadable or unknown values mean `system`. */
export function readThemePreference(file: string): Theme {
  try {
    return parseTheme((JSON.parse(readFileSync(file, 'utf8')) as { theme?: unknown } | null)?.theme) ?? 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(file: string, theme: Theme): void {
  writeFileSync(file, JSON.stringify({ theme }));
}

export function themeBackground(dark: boolean): string {
  return dark ? BACKGROUND.dark : BACKGROUND.light;
}

/** Applies a theme chosen in the renderer: only from the app page and only valid values; returns the applied theme. */
export function applyThemeRequest(request: {
  fromApp: boolean;
  value: unknown;
  file: string;
  nativeTheme: { themeSource: Theme };
}): Theme | null {
  const theme = parseTheme(request.value);
  if (!request.fromApp || !theme) return null;
  request.nativeTheme.themeSource = theme;
  writeThemePreference(request.file, theme);
  return theme;
}
