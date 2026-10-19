// SPDX-License-Identifier: Apache-2.0
// Rendered Markdown preview (US-025): front-matter hidden; raw HTML is not rendered (react-markdown default), so
// artifact content cannot inject markup or scripts into the renderer.
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Removes a leading YAML front-matter block. */
export function stripFrontMatter(content: string): string {
  const text = content.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return text;
  const next = text.indexOf('\n', end + 1);
  return next < 0 ? '' : text.slice(next + 1);
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-preview">
      <Markdown remarkPlugins={[remarkGfm]}>{stripFrontMatter(markdown)}</Markdown>
    </div>
  );
}
