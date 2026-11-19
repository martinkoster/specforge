// SPDX-License-Identifier: Apache-2.0
// US-077 AC-1/AC-2 (FR-117, ADR-023): the theme preference is owned by main and applied via nativeTheme.themeSource.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyThemeRequest, parseTheme, readThemePreference, themeBackground, writeThemePreference } from '../src/ui-preferences.js';

const file = () => join(mkdtempSync(join(tmpdir(), 'sf-uiprefs-')), 'ui-preferences.json');

describe('US-077 AC-1: theme preference file', () => {
  it('defaults to "system" when the file is missing, unreadable or holds an unknown value', () => {
    expect(readThemePreference(file())).toBe('system');

    const broken = file();
    writeFileSync(broken, '{ not json');
    expect(readThemePreference(broken)).toBe('system');

    const unknown = file();
    writeFileSync(unknown, JSON.stringify({ theme: 'purple' }));
    expect(readThemePreference(unknown)).toBe('system');
  });

  it('writes and reads the preference back', () => {
    const path = file();
    writeThemePreference(path, 'dark');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ theme: 'dark' });
    expect(readThemePreference(path)).toBe('dark');
    writeThemePreference(path, 'light');
    expect(readThemePreference(path)).toBe('light');
  });

  it('accepts only system, light and dark', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
    expect(parseTheme('Dark')).toBeUndefined();
    expect(parseTheme(42)).toBeUndefined();
  });

  it('uses the theme background for the window before the page paints', () => {
    expect(themeBackground(false)).toBe('#ffffff');
    expect(themeBackground(true)).toBe('#0c0c0e');
  });
});

describe('US-077 AC-2: theme requests from the renderer', () => {
  it('applies and persists a valid theme; ignores invalid values and other senders', () => {
    const path = file();
    const native = { themeSource: 'system' as 'system' | 'light' | 'dark' };

    expect(applyThemeRequest({ fromApp: true, value: 'dark', file: path, nativeTheme: native })).toBe('dark');
    expect(native.themeSource).toBe('dark');
    expect(readThemePreference(path)).toBe('dark');

    expect(applyThemeRequest({ fromApp: true, value: 'neon', file: path, nativeTheme: native })).toBeNull();
    expect(applyThemeRequest({ fromApp: false, value: 'light', file: path, nativeTheme: native })).toBeNull();
    expect(native.themeSource).toBe('dark');
    expect(readThemePreference(path)).toBe('dark');
  });
});
