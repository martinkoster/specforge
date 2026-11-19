---
id: US-077
title: Choose the colour theme (System / Light / Dark)
status: done
size: S
epic: UI design system
---

## Business Value
Some users prefer a dark UI regardless of their OS setting, others the opposite. An explicit theme choice, applied instantly and without a flash on start, is expected from modern tools (FR-117).

## Description
As a **SpecForge user**, I want **to choose whether SpecForge follows my OS theme or is always light or dark** so that **it is comfortable for my eyes and environment**.

## Acceptance Criteria
- [x] AC-1: The main process keeps the preference in `<userData>/ui-preferences.json` (`system` by default; a missing, unreadable or unknown value means `system`) and sets `nativeTheme.themeSource` before the window is created. Unit tests cover read, write and fallback.
- [x] AC-2: *Settings → Appearance* offers *System / Light / Dark* as a segmented control. Selecting a value changes the whole UI immediately (incl. CodeMirror, React Flow and logs) through a validated shell bridge call (`specforgeShell.setTheme`, answered only for the app page) and persists it.
- [x] AC-3: After a restart the chosen theme is active from the first paint: the E2E test checks the window background colour of the first frame and finds no flash of the other theme. With *System*, the app follows a change of the OS setting (emulated `nativeTheme.themeSource`/colour scheme in the E2E test).
- [x] AC-4: The setting control is keyboard-operable, has an accessible name ("Theme") and passes the contrast check in both themes.

## Technical Notes
- Related design document: `spec/03_design/functional_design/ui_design_concept.md` §3; `spec/03_design/technical_design/data_model.md` §2.1 (UI preferences); ADR-023 (5)
- Related requirements: FR-117, NFR-020; D25; `user_flows.md` UF-08 (Appearance)
- Release: R1
- Set the window's `backgroundColor` to the theme background (from `nativeTheme.shouldUseDarkColors`) to avoid a white flash before the page loads.

## Dependencies
- US-069 Design tokens, CSS architecture and light/dark foundation

## Implementation Details
Files created / modified:
- `packages/main/src/ui-preferences.ts` — `parseTheme`, `readThemePreference` (missing / unreadable / unknown → `system`), `writeThemePreference`, `themeBackground` (mirrors `--bg`), `applyThemeRequest` (only from the app page, only valid values; sets `nativeTheme.themeSource` and persists)
- `packages/main/src/main.ts` — reads `<userData>/ui-preferences.json` and sets `nativeTheme.themeSource` before the window is created; `BrowserWindow` `backgroundColor` from the theme; background follows `nativeTheme` `updated`; IPC `specforge:get-theme` / `specforge:set-theme`
- `packages/main/src/preload.cts` — `specforgeShell.getTheme()` / `setTheme(theme)`
- `packages/ui/src/settings/AppearanceSettings.tsx` — *Appearance* section: radio group "Theme" (System / Light / Dark) as a segmented control, error shown on refusal, fallback to System when the preference cannot be read
- `packages/ui/src/settings/SettingsArea.tsx`, `packages/ui/src/App.tsx`, `packages/ui/src/main.tsx` — `ThemeBridge` passed from the shell to Settings (refused changes become an error)
- `packages/ui/src/styles/components/segmented.css` — segmented control (native radios, arrow keys, focus ring)

Decisions / deviations:
- All token-based styles (shell, areas, logs, components) switch immediately with `prefers-color-scheme`, driven by `nativeTheme.themeSource`; no re-render logic. CodeMirror inherits text and background from tokens; its full token theme (selection, gutter, highlighting) follows in US-075, and React Flow's own light defaults are replaced by token styles in US-074.
- Playwright emulates a light colour scheme by default; the theme E2E test turns emulation off (`emulateMedia({ colorScheme: null })`) so the page follows `nativeTheme`, and uses emulation only to simulate an OS change under *System*.

## Test Coverage
- Coverage: `ui-preferences.ts` 100 % (lines, branches), `AppearanceSettings.tsx` 100 % lines / 87.5 % branches
- Test files: `packages/main/test/ui-preferences.test.ts` (5), `packages/ui/test/appearance-settings.test.tsx` (4), `packages/main/test/theme.e2e.test.ts` (1, Electron: switch, restart without flash — window background `#0c0c0e` and dark page from the first frame —, System follows the colour scheme)
- Full suite: 1017 passed
- 10 new tests
