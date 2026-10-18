// SPDX-License-Identifier: Apache-2.0
// Bare Electron app (one window, one paragraph): the startup baseline of the test driver and machine (US-065 AC-2).
const { app, BrowserWindow } = require('electron');

void app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 400, height: 300 });
  void window.loadURL('data:text/html,<p>baseline</p>');
});
