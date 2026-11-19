// SPDX-License-Identifier: Apache-2.0
// Renderer entry (sandboxed): receives core ports from the preload and renders the app. Verified end-to-end.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setNonce } from 'get-nonce';
import { App } from './App.js';
import { CoreSession, type CoreStatus } from './core/core-session.js';
import type { Theme, ThemeBridge } from './settings/AppearanceSettings.js';
import './styles/index.css';

declare global {
  interface Window {
    specforgeShell?: {
      onCoreStatus(listener: (status: string) => void): void;
      pickFolder(title: string): Promise<string | null>;
      styleNonce?: string;
      notify?(title: string, body: string): void;
      onCloseRequested?(listener: () => void): void;
      acknowledgeClose?(): void;
      confirmClose?(): void;
      cancelClose?(): void;
      getTheme?(): Promise<string>;
      setTheme?(theme: string): Promise<string | null>;
    };
  }
}

// Radix's scroll lock adds a runtime <style> element; it carries the per-session CSP nonce like CodeMirror's.
if (window.specforgeShell?.styleNonce) setNonce(window.specforgeShell.styleNonce);

const session = new CoreSession();

window.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  const [port] = event.ports;
  if (event.source !== window || data?.type !== 'specforge:core-port' || !port) return;
  port.start();
  void session.attach({
    postMessage: (message) => port.postMessage(message),
    onMessage: (listener) => port.addEventListener('message', (e) => listener(e.data)),
  });
});

// Main reports restarts and failures; "connected" is set by the session after the handshake.
window.specforgeShell?.onCoreStatus((status) => {
  if (status !== 'connected') session.setStatus(status as CoreStatus);
});

const testMode = new URLSearchParams(window.location.search).get('test') === '1';
// US-077: the theme preference lives in the main process.
const shell = window.specforgeShell;
const theme: ThemeBridge | undefined =
  shell?.getTheme && shell.setTheme
    ? {
        get: async () => (await shell.getTheme!()) as Theme,
        set: async (next) => {
          const applied = await shell.setTheme!(next);
          if (!applied) throw new Error('The theme could not be changed.');
          return applied as Theme;
        },
      }
    : undefined;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      session={session}
      testMode={testMode}
      {...(window.specforgeShell ? { pickFolder: (title: string) => window.specforgeShell!.pickFolder(title) } : {})}
      {...(theme ? { theme } : {})}
      {...(window.specforgeShell?.notify ? { notify: (title: string, body: string) => window.specforgeShell!.notify!(title, body) } : {})}
      {...(window.specforgeShell?.onCloseRequested
        ? {
            closeBridge: {
              onCloseRequested: (listener: () => void) => window.specforgeShell!.onCloseRequested!(listener),
              acknowledge: () => window.specforgeShell!.acknowledgeClose!(),
              confirm: () => window.specforgeShell!.confirmClose!(),
              cancel: () => window.specforgeShell!.cancelClose!(),
            },
          }
        : {})}
    />
  </StrictMode>,
);
