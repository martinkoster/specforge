// SPDX-License-Identifier: Apache-2.0
// Specification root of the open project (US-078, ADR-024): areas build artifact paths from it and show paths relative
// to it. Provided by the App from the shell state; `spec` when unknown.
import { specLayout, type SpecLayout } from '@specforge/domain';
import { createContext, useContext } from 'react';

export const SpecLayoutContext = createContext<SpecLayout>(specLayout());

export function useSpecLayout(): SpecLayout {
  return useContext(SpecLayoutContext);
}
