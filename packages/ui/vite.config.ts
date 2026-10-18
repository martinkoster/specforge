// SPDX-License-Identifier: Apache-2.0
// Renderer bundle, loaded by main over file:// (relative base, no crossorigin attributes).
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Module scripts with `crossorigin` fail to load from file:// URLs. */
const stripCrossorigin: Plugin = {
  name: 'specforge-strip-crossorigin',
  transformIndexHtml: (html) => html.replace(/ crossorigin(="[^"]*")?/g, ''),
};

export default defineConfig({
  base: './',
  plugins: [react(), stripCrossorigin],
  build: { outDir: 'dist/app', emptyOutDir: true, modulePreload: { polyfill: false } },
});
