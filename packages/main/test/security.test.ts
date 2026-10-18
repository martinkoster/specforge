// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  contentSecurityPolicy,
  createStyleNonce,
  installNavigationGuards,
  isAllowedNavigation,
  secureWebPreferences,
} from '../src/security.js';

describe('US-005 AC-1: sandboxed renderer with hardened settings', () => {
  it('enables sandbox and context isolation and disables Node integration', () => {
    expect(secureWebPreferences('/app/preload.cjs')).toEqual({
      preload: '/app/preload.cjs',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    });
  });

  it('defines a strict content security policy without remote or inline scripts', () => {
    const csp = contentSecurityPolicy('n0nce');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it('allows only nonce-tagged style elements (CodeMirror) besides the bundled stylesheet', () => {
    expect(contentSecurityPolicy('n0nce')).toContain("style-src 'self' 'nonce-n0nce'");
    const a = createStyleNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
    expect(createStyleNonce()).not.toBe(a);
  });

  it('allows navigation only to the application page', () => {
    const app = 'file:///C:/app/ui/static/index.html';
    expect(isAllowedNavigation(app, app)).toBe(true);
    expect(isAllowedNavigation(app, 'https://example.com/')).toBe(false);
    expect(isAllowedNavigation(app, 'file:///C:/Windows/system.ini')).toBe(false);
  });

  it('blocks window.open and foreign navigation', () => {
    const handlers: Record<string, (event: { preventDefault(): void }, url: string) => void> = {};
    let openHandler: ((details: { url: string }) => { action: string }) | undefined;
    const contents = {
      setWindowOpenHandler: (h: (details: { url: string }) => { action: string }) => (openHandler = h),
      on: (event: string, h: (event: { preventDefault(): void }, url: string) => void) => (handlers[event] = h),
    };

    installNavigationGuards(contents, 'file:///app/index.html');

    expect(openHandler!({ url: 'https://evil.example' })).toEqual({ action: 'deny' });
    const prevent = vi.fn();
    handlers['will-navigate']!({ preventDefault: prevent }, 'https://evil.example');
    expect(prevent).toHaveBeenCalledOnce();
    const allowed = vi.fn();
    handlers['will-navigate']!({ preventDefault: allowed }, 'file:///app/index.html');
    expect(allowed).not.toHaveBeenCalled();
    const redirect = vi.fn();
    handlers['will-redirect']!({ preventDefault: redirect }, 'https://evil.example');
    expect(redirect).toHaveBeenCalledOnce();
  });
});
