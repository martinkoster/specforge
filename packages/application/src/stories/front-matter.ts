// SPDX-License-Identifier: Apache-2.0
// Edits the YAML front-matter of a Markdown artifact in place, preserving comments, formatting and the body.
import { parseDocument, type Document } from 'yaml';

export class FrontMatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontMatterError';
  }
}

export function editFrontMatter(content: string, mutate: (doc: Document) => void): string {
  const text = content.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) throw new FrontMatterError('The file has no front-matter.');
  const end = text.indexOf('\n---', 4);
  if (end < 0) throw new FrontMatterError('The front-matter is not closed with ---.');
  const doc = parseDocument(text.slice(4, end + 1));
  if (doc.errors.length > 0) throw new FrontMatterError(`Invalid front-matter: ${doc.errors[0]!.message}`);
  mutate(doc);
  const closingLineEnd = text.indexOf('\n', end + 1);
  const body = closingLineEnd < 0 ? '' : text.slice(closingLineEnd + 1);
  return `---\n${doc.toString()}---\n${body}`;
}
