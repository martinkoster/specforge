// SPDX-License-Identifier: Apache-2.0
// Design-token guardrail (US-069 AC-3, NFR-033, ADR-023): outside `tokens.css`, stylesheets may not contain colour
// literals, literal box shadows or literal font sizes — they use the tokens of ui_design_concept.md §2.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface TokenViolation {
  file: string;
  line: number;
  reason: string;
}

const TOKEN_FILE = 'tokens.css';
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', 'out', 'build', '.git']);
const COLOUR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;
const TOKEN_LIST = /^var\(--[\w-]+\)(\s*,\s*var\(--[\w-]+\))*$/;
const FONT_SIZE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'smaller', 'larger']);
/** CSS named colours (CSS Color 4) without `transparent` and `currentColor`; system colours stay allowed. */
const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
);

/** Replaces comments with spaces, keeping newlines so that line numbers stay correct. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function valueReason(property: string, rawValue: string): string | undefined {
  const value = rawValue
    .trim()
    .replace(/'[^']*'|"[^"]*"/g, '""')
    .replace(/\s*!important$/, '');
  const hex = HEX_COLOUR.exec(value);
  if (hex) return `colour literal "${hex[0]}"`;
  const fn = COLOUR_FUNCTION.exec(value);
  if (fn) return `colour literal "${fn[1]!.toLowerCase()}("`;
  const words = value.replace(/var\([^)]*\)/g, ' ').match(/[a-z]+/gi) ?? [];
  const named = words.find((w) => NAMED_COLOURS.has(w.toLowerCase()));
  if (named) return `colour literal "${named}"`;
  const prop = property.toLowerCase();
  if (prop === 'box-shadow' && value !== 'none' && !TOKEN_LIST.test(value)) return 'box-shadow must be "none" or tokens';
  if (prop === 'font-size' && !FONT_SIZE_KEYWORDS.has(value) && !TOKEN_LIST.test(value)) return 'font-size must be a token';
  return undefined;
}

/** Violations in one stylesheet (`file` is only used for reporting). */
export function findTokenViolations(css: string, file: string): TokenViolation[] {
  const text = stripComments(css);
  const violations: TokenViolation[] = [];
  for (const match of text.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const reason = valueReason(match[1]!, match[2]!);
    if (reason) violations.push({ file, line: text.slice(0, match.index).split('\n').length, reason });
  }
  return violations;
}

function* stylesheets(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* stylesheets(path);
    } else if (entry.name.endsWith('.css') && basename(path) !== TOKEN_FILE) {
      yield path;
    }
  }
}

/** Violations in all stylesheets below `roots` except the token files. */
export function findTokenViolationsIn(roots: string[]): TokenViolation[] {
  return roots.flatMap((root) => [...stylesheets(root)].flatMap((file) => findTokenViolations(readFileSync(file, 'utf8'), file)));
}
