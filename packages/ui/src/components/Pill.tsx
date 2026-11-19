// SPDX-License-Identifier: Apache-2.0
// Count pill and neutral tag (US-070 AC-3, ui_design_concept.md §5).
import type { ReactNode } from 'react';

export function CountPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="pill" aria-label={`${count} ${label}`}>
      {count}
    </span>
  );
}

/** Neutral tag, e.g. the epic chip; `colour` picks one of the categorical epic colours for the marker. */
export function Tag({ children, colour, title }: { children: ReactNode; colour?: number; title?: string }) {
  return (
    <span className={colour === undefined ? 'tag' : `tag epic-colour-${colour % 8}`} {...(title ? { title } : {})}>
      {children}
    </span>
  );
}
