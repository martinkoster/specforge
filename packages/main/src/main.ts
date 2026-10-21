// SPDX-License-Identifier: Apache-2.0
// Electron main process entry: window, IPC broker, core supervision (ADR-002). Verified end-to-end in test/shell.e2e.test.ts.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  MessageChannelMain,
  Notification,
  app,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
  utilityProcess,
  type MessagePortMain,
} from 'electron';
import { appPaths } from './app-paths.js';
import { CloseCoordinator } from './close-coordinator.js';
import { CoreSupervisor } from './core-supervisor.js';
import { notificationContent } from './notifications.js';
import { RendererLink } from './renderer-link.js';
import { handleOpenPath } from './open-path.js';
import { handleSecretRequest } from './secret-bridge.js';
import { SecretVault } from './secret-vault.js';
import { contentSecurityPolicy, createStyleNonce, installNavigationGuards, secureWebPreferences } from './security.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEST_MODE = process.env.SPECFORGE_TEST === '1';
const STYLE_NONCE = createStyleNonce();
// Tests run against an isolated profile.
if (TEST_MODE && process.env.SPECFORGE_USER_DATA) app.setPath('userData', process.env.SPECFORGE_USER_DATA);
const paths = appPaths(here, app.isPackaged);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'SpecForge',
    webPreferences: secureWebPreferences(paths.preload),
  });
  const appUrl = pathToFileURL(paths.page).href + (TEST_MODE ? '?test=1' : '');
  installNavigationGuards(window.webContents, appUrl);
  void window.loadURL(appUrl);
  return window;
}

function startCore(link: RendererLink<MessagePortMain>, vault: SecretVault): CoreSupervisor<MessagePortMain> {
  const supervisor = new CoreSupervisor<MessagePortMain>({
    fork: () => {
      const child = utilityProcess.fork(paths.core, [], {
        serviceName: 'SpecForge Core',
        env: { ...process.env, SPECFORGE_APP_DATA: app.getPath('userData') },
      });
      // Secret requests from the core are answered from the vault (ADR-012).
      child.on('message', (message) => {
        const response = handleSecretRequest(vault, message);
        if (response) child.postMessage(response);
        // US-057: files the core resolved for "Open in editor".
        void handleOpenPath(message, (path) => shell.openPath(path)).catch(() => undefined);
      });
      return {
        postMessage: (message, transfer) => child.postMessage(message, transfer as MessagePortMain[]),
        onExit: (listener) => child.on('exit', listener),
        onMessage: (listener) => child.on('message', listener),
        kill: () => child.kill(),
      };
    },
    createChannel: () => {
      const { port1, port2 } = new MessageChannelMain();
      return { forCore: port1, forRenderer: port2 };
    },
    connectRenderer: (port) => link.port(port),
    onStatus: (status) => link.status(status),
  });
  supervisor.start();
  return supervisor;
}

void app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [contentSecurityPolicy(STYLE_NONCE)] } }),
  );
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  // The renderer tags runtime style elements (CodeMirror) with the CSP nonce.
  ipcMain.on('specforge:style-nonce', (event) => {
    event.returnValue = STYLE_NONCE;
  });
  const window = createWindow();
  // US-049 AC-2: closing with active runs asks the renderer first.
  const fromApp = (event: Electron.IpcMainEvent) => event.senderFrame?.url.split('?')[0] === pathToFileURL(paths.page).href;
  const closing = new CloseCoordinator({
    ask: () => window.webContents.send('specforge:close-requested'),
    close: () => window.close(),
    ackTimeoutMs: 5000,
  });
  window.on('close', (event) => {
    if (closing.onCloseRequested() === 'prevent') event.preventDefault();
  });
  ipcMain.on('specforge:close-guard', (event) => fromApp(event) && closing.setGuarded(true));
  window.webContents.on('did-start-navigation', (details) => details.isMainFrame && !details.isSameDocument && closing.setGuarded(false));
  window.webContents.on('render-process-gone', () => closing.setGuarded(false));
  ipcMain.on('specforge:close-ack', (event) => fromApp(event) && closing.onAcknowledged());
  ipcMain.on('specforge:close-confirmed', (event) => fromApp(event) && closing.onConfirmed());
  ipcMain.on('specforge:close-cancelled', (event) => fromApp(event) && closing.onCancelled());

  // OS notifications while the window is not focused (US-053); only from our own page.
  ipcMain.on('specforge:notify', (event, title: unknown, body: unknown) => {
    if (event.senderFrame?.url.split('?')[0] !== pathToFileURL(paths.page).href || !Notification.isSupported()) return;
    const content = notificationContent(title, body);
    if (!content) return;
    const notification = new Notification(content);
    notification.on('click', () => window.show());
    notification.show();
  });
  // Native folder picker for the start wizard (US-018, US-019); answers only our own page.
  ipcMain.handle('specforge:pick-folder', async (event, title: unknown) => {
    if (event.senderFrame?.url.split('?')[0] !== pathToFileURL(paths.page).href) return null;
    const result = await dialog.showOpenDialog(window, {
      title: typeof title === 'string' ? title : 'Choose a folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  // The core starts while the page loads (NFR-003); its port and status reach the page once it has loaded.
  const link = new RendererLink<MessagePortMain>({
    postPort: (port) => window.webContents.postMessage('core-port', null, [port]),
    sendStatus: (status) => {
      if (!window.isDestroyed()) window.webContents.send('core-status', status);
    },
  });
  window.webContents.once('did-finish-load', () => link.loaded());
  const supervisor = startCore(
    link,
    new SecretVault({ file: join(app.getPath('userData'), 'secrets.json'), safeStorage, platform: process.platform }),
  );
  window.on('closed', () => supervisor.stop());
});

app.on('window-all-closed', () => app.quit());
