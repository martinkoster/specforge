// SPDX-License-Identifier: Apache-2.0

/** Architectural layer of this package (ADR-003). */
export const LAYER = 'ipc-contract' as const;

export * from './contract.js';
export * from './protocol.js';
