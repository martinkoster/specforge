// SPDX-License-Identifier: Apache-2.0
// Sandboxed preload (CommonJS): forwards the core MessagePort and core status to the isolated renderer.
import electron = require('electron');

const { contextBridge, ipcRenderer } = electron;

ipcRenderer.on('core-port', (event) => {
  // MessagePorts cannot cross the context bridge; window.postMessage transfers them to the page.
  window.postMessage({ type: 'specforge:core-port' }, '*', event.ports);
});

contextBridge.exposeInMainWorld('specforgeShell', {
  /** CSP nonce for style elements created at runtime (CodeMirror). */
  styleNonce: ipcRenderer.sendSync('specforge:style-nonce') as string,
  onCoreStatus(listener: (status: string) => void): void {
    ipcRenderer.on('core-status', (_event, status: string) => listener(status));
  },
  /** Window close requested (US-049): acknowledge, then confirm (close) or cancel. */
  onCloseRequested(listener: () => void): void {
    ipcRenderer.on('specforge:close-requested', () => listener());
    ipcRenderer.send('specforge:close-guard');
  },
  acknowledgeClose(): void {
    ipcRenderer.send('specforge:close-ack');
  },
  confirmClose(): void {
    ipcRenderer.send('specforge:close-confirmed');
  },
  cancelClose(): void {
    ipcRenderer.send('specforge:close-cancelled');
  },
  /** OS notification (shown by main only for this page). */
  notify(title: string, body: string): void {
    ipcRenderer.send('specforge:notify', title, body);
  },
  /** Native folder picker; resolves to the chosen folder or null when cancelled. */
  pickFolder(title: string): Promise<string | null> {
    return ipcRenderer.invoke('specforge:pick-folder', title) as Promise<string | null>;
  },
});
