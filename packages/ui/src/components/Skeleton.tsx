// SPDX-License-Identifier: Apache-2.0
// Loading placeholder (US-073 AC-4, ui_design_concept.md §5): shimmering lines instead of "Loading…" text; announced as
// a busy status with an accessible name.
export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="skeleton">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
