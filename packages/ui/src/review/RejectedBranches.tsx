// SPDX-License-Identifier: Apache-2.0
// Rejected branches of a story (US-058 AC-2, FR-046): rejecting retains the branch and marks it rejected; a new run
// starts on a fresh branch.
import { useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';

export interface RejectedBranchesProps {
  session: CoreSession;
  projectId: string;
  storyId: string;
}

export function RejectedBranches({ session, projectId, storyId }: RejectedBranchesProps) {
  const [branches, setBranches] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    void session
      .client()
      .query('review.rejectedBranches', { projectId, storyId })
      .then((b) => current && setBranches(b))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [session, projectId, storyId]);
  if (branches.length === 0) return null;
  return (
    <section aria-label="Rejected branches">
      <h3>Rejected branches</h3>
      <p className="hint">Retained for reference; a new run starts on a fresh branch.</p>
      <ul>
        {branches.map((b) => (
          <li key={b}>
            <code>{b}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
