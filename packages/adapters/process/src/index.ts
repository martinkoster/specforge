// SPDX-License-Identifier: Apache-2.0

/** Architectural layer of this package (ADR-003). */
export const LAYER = 'adapter' as const;
export * from './kill-tree.js';
export * from './orphans.js';
export * from './process-tree.js';
