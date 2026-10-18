// SPDX-License-Identifier: Apache-2.0
// Electron hardening for the renderer (ADR-002, technical_decisions §4).
import { randomBytes } from 'node:crypto';

export interface SecureWebPreferences {
  preload: string;
  sandbox: true;
  contextIsolation: true;
  nodeIntegration: false;
  nodeIntegrationInWorker: false;
  webSecurity: true;
  allowRunningInsecureContent: false;
  webviewTag: false;
  spellcheck: false;
}

export function secureWebPreferences(preload: string): SecureWebPreferences {
  return {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
  };
}

/** Random per-session nonce for style elements created at runtime (CodeMirror's style-mod). */
export function createStyleNonce(): string {
  return randomBytes(18).toString('base64');
}

/** No remote content, no inline or eval'd scripts; style elements only with the session nonce. */
export function contentSecurityPolicy(styleNonce: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' 'nonce-${styleNonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function isAllowedNavigation(appUrl: string, target: string): boolean {
  return target === appUrl;
}

interface NavigationEvent {
  preventDefault(): void;
}

export interface GuardableWebContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent, url: string) => void): unknown;
}

/** Denies window.open and any navigation away from the application page. */
export function installNavigationGuards(contents: GuardableWebContents, appUrl: string): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (event: NavigationEvent, url: string) => {
    if (!isAllowedNavigation(appUrl, url)) event.preventDefault();
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
}
