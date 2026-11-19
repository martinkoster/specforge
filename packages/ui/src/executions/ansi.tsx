// SPDX-License-Identifier: Apache-2.0
// ANSI colours in run logs (US-076 AC-2): SGR colour and bold codes become styled segments (palette from the design
// tokens, AA on the log background in both themes); other escape sequences are dropped.
const COLOURS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
// eslint-disable-next-line no-control-regex
const ESCAPE = /\u001b\[([0-9;]*)([A-Za-z])/g;

export interface AnsiSegment {
  text: string;
  classes: string[];
}

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let colour: string | null = null;
  let bold = false;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const classes = [...(bold ? ['ansi-bold'] : []), ...(colour ? [`ansi-${colour}`] : [])];
    const previous = segments[segments.length - 1];
    if (previous && previous.classes.join(' ') === classes.join(' ')) previous.text += text;
    else segments.push({ text, classes });
  };
  for (const match of input.matchAll(ESCAPE)) {
    push(input.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[2] !== 'm') continue;
    for (const code of (match[1] || '0').split(';').map(Number)) {
      if (code === 0) {
        colour = null;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) colour = null;
      else if (code >= 30 && code <= 37) colour = COLOURS[code - 30]!;
      else if (code >= 90 && code <= 97) colour = COLOURS[code - 90]!;
    }
  }
  push(input.slice(last));
  return segments.length > 0 ? segments : [{ text: '', classes: [] }];
}

export function AnsiText({ text }: { text: string }) {
  return (
    <>
      {parseAnsi(text).map((segment, i) =>
        segment.classes.length > 0 ? (
          <span key={i} className={segment.classes.join(' ')}>
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
