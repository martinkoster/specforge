// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';

export interface AppDataEnvironment {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homedir: string;
}

/**
 * Per-user application data directory (the same location Electron uses for `userData`):
 * Windows `%APPDATA%\SpecForge`, macOS `~/Library/Application Support/SpecForge`, Linux `$XDG_CONFIG_HOME/SpecForge` or `~/.config/SpecForge`.
 */
export function resolveAppDataDir({ platform, env, homedir }: AppDataEnvironment, appName = 'SpecForge'): string {
  if (platform === 'win32') return join(env.APPDATA ?? join(homedir, 'AppData', 'Roaming'), appName);
  if (platform === 'darwin') return join(homedir, 'Library', 'Application Support', appName);
  return join(env.XDG_CONFIG_HOME ?? join(homedir, '.config'), appName);
}
