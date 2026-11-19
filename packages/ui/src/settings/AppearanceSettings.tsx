// SPDX-License-Identifier: Apache-2.0
// Settings → Appearance (US-077, FR-117, UF-08): System / Light / Dark as a segmented control. The main process applies
// the choice (nativeTheme.themeSource), so every area — incl. editor, graph and logs — follows through the CSS tokens.
import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export interface ThemeBridge {
  get(): Promise<Theme>;
  set(theme: Theme): Promise<Theme>;
}

const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSettings({ theme: bridge }: { theme: ThemeBridge }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    bridge.get().then(
      (current) => active && setTheme(current),
      () => active && setTheme('system'),
    );
    return () => {
      active = false;
    };
  }, [bridge]);

  const choose = async (next: Theme): Promise<void> => {
    try {
      setTheme(await bridge.set(next));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section aria-labelledby="appearance-title" className="settings-section">
      <h2 id="appearance-title">Appearance</h2>
      <div role="radiogroup" aria-label="Theme" className="segmented">
        {OPTIONS.map((option) => (
          <label key={option.value} className="segmented-option">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              disabled={theme === null}
              onChange={() => void choose(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="hint">System follows the light or dark setting of your operating system.</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
