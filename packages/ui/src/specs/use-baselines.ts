// SPDX-License-Identifier: Apache-2.0
// Spec baselines for *Compare with baseline…* in the artifact editors (US-096 AC-3): the tags, newest first, and the
// comparison of one file. Projects without Git have no baselines, so the editors offer no comparison.
import { useCallback, useEffect, useState } from 'react';
import type { CoreSession } from '../core/core-session.js';

export function useBaselines(session: CoreSession, projectId: string) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    void session
      .client()
      .query('baselines.list', { projectId })
      .then(
        (list) => setTags(list.map((b) => b.tag)),
        () => setTags([]),
      );
  }, [session, projectId]);
  const compare = useCallback(
    (path: string) => (tag: string) => session.client().query('baselines.compare', { projectId, tag, path }),
    [session, projectId],
  );
  return { tags, compare };
}
