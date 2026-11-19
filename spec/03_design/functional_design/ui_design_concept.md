# SpecForge — UI Design Concept

**Last updated:** 2026-11-18  
**Status:** Approved direction (intent D25); implemented by US-069 – US-077  
**Related:** NFR-020 (accessibility), NFR-033 (visual design system), FR-117 (theme), ADR-023 (styling technique), `user_flows.md` UF-00 – UF-19

## 1. Goals and direction

SpecForge looks and behaves like a **modern developer tool** in the style that developers already know and accept from tools like Linear, Vercel, GitHub's current UI and shadcn/ui-based apps:

- **Calm, neutral canvas, one accent colour.** Greys carry structure; colour is reserved for the primary action, focus, selection and status.
- **Content first.** Little chrome, generous whitespace, clear hierarchy through type size and weight rather than borders and boxes.
- **Compact but airy.** Dense enough for boards, logs and tables; never cramped (8 px spacing grid, 32 px default control height).
- **Consistent.** Every control, card, dialog and status looks the same everywhere; one source of truth for values (design tokens).
- **Accessible by construction.** WCAG 2.1 AA contrast in both themes, visible focus, status never by colour alone (icon + text), keyboard-first (NFR-020).
- **Native-friendly.** System font stack, OS light/dark preference, OS scaling respected; no web-page look (no underlined links in chrome, no default browser buttons).

Non-goals: brand illustrations, animations beyond subtle transitions, a custom widget toolkit, per-user colour customisation (beyond light/dark).

## 2. Design tokens

All visual values are **CSS custom properties** defined once in `packages/ui/src/styles/tokens.css` (ADR-023). Components use only tokens — no raw colour, shadow or font-size literals outside the token file (enforced by a lint check, NFR-033).

### 2.1 Colour — semantic tokens

Components use semantic names; the two themes map them to concrete values. All pairs below were checked: text tokens ≥ 4.5:1 on `--bg`, `--bg-subtle` and `--surface`; `--border-strong` and `--focus` ≥ 3:1 (non-text contrast).

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--bg` | App background (content area) | `#ffffff` | `#0c0c0e` |
| `--bg-subtle` | Sidebar, board columns, table headers | `#f7f7f8` | `#141417` |
| `--surface` | Cards, dialogs, popovers | `#ffffff` | `#18181b` |
| `--surface-hover` | Hovered rows / cards / ghost buttons | `#f4f4f5` | `#232327` |
| `--surface-selected` | Selected nav item / row | `#eef2ff` | `#1e1b4b` |
| `--border` | Hairlines, card and divider borders | `#e4e4e7` | `#27272a` |
| `--border-strong` | Input borders, checkboxes (≥ 3:1) | `#8a8a93` | `#71717a` |
| `--text` | Primary text | `#18181b` | `#f4f4f5` |
| `--text-muted` | Secondary text, labels | `#52525b` | `#a1a1aa` |
| `--text-subtle` | Hints, timestamps, placeholders | `#6b6b74` | `#8e8e98` |
| `--accent` | Primary button background, selection marker | `#4f46e5` | `#4f46e5` |
| `--accent-hover` | Primary button hover | `#4338ca` | `#6366f1`¹ |
| `--accent-text` | Links, accent text, active nav label | `#4338ca` | `#a5b4fc` |
| `--accent-subtle` | Accent-tinted backgrounds | `#eef2ff` | `#1e1b4b` |
| `--on-accent` | Text on `--accent` | `#ffffff` | `#ffffff` |
| `--focus` | Focus ring | `#4f46e5` | `#818cf8` |
| `--success` / `--success-subtle` | Done, passed, completed | `#15803d` / `#f0fdf4` | `#4ade80` / `#052e16` |
| `--warning` / `--warning-subtle` | Needs attention, non-git, limited mode | `#a16207` / `#fefce8` | `#facc15` / `#2a2006` |
| `--danger` / `--danger-subtle` | Failed, rejected, destructive | `#b91c1c` / `#fef2f2` | `#f87171` / `#2a0f0f` |
| `--info` / `--info-subtle` | Running, queued, informational | `#0369a1` / `#f0f9ff` | `#38bdf8` / `#082f49` |

¹ Hover only — the label stays readable because hover is never the only state.

Additional tokens (added with US-069): `--review` / `--review-subtle` (story state *Review*, light `#7e22ce` / `#faf5ff`, dark `#d8b4fe` / `#2e1065`), `--overlay` (dialog backdrop, `rgb(0 0 0 / 0.4)` / `0.6`), `--highlight` / `--highlight-strong` (log search match / current match), `--epic-0` … `--epic-7` (categorical epic colours, used only for borders and markers, never as text), `--weight-regular|medium|semibold`. With US-076: `--ansi-red|green|yellow|blue|magenta|cyan` (run-log ANSI colours; each ≥ 4.5:1 on `--bg-subtle` in both themes, verified by a unit test).

**Status mapping** (used by badges, board cards, run tiles, phase stepper): *Draft* neutral · *Approved / Done / Completed* success · *Ready / Queued / Running* info · *Needs attention / Waiting for decision / Limited mode / Non-git* warning · *Failed / Rejected / Cancelled with error* danger. Every status badge has an icon **and** a text label.

### 2.2 Typography

- **Font stack**: `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", Ubuntu, Cantarell, "Noto Sans", sans-serif`; monospace: `"Cascadia Code", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`. No bundled web fonts (no licence or size cost; native feel per OS).
- **Scale** (rem, base 14 px = `font-size: 87.5%` on `html`, so OS zoom and scaling still apply):

| Token | Size / line height | Use |
|---|---|---|
| `--text-xs` | 12 / 16 px | Badges, timestamps, counters |
| `--text-sm` | 13 / 20 px | Secondary text, table cells, hints |
| `--text-md` | 14 / 20 px | Body, controls (default) |
| `--text-lg` | 16 / 24 px | Card titles, dialog titles |
| `--text-xl` | 20 / 28 px | Page titles (area headings) |
| `--text-2xl` | 24 / 32 px | Start-wizard and setup headings |

- Weights: 400 regular, 500 medium (labels, buttons, nav), 600 semibold (titles). Numbers in counters and tables use `font-variant-numeric: tabular-nums`.

### 2.3 Spacing, size, radius, elevation, motion

- **Spacing** (4 px base, 8 px rhythm): `--space-1` 4 px, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 48.
- **Control heights**: `--control-sm` 28 px, `--control-md` 32 px (default), `--control-lg` 40 px (wizard primary actions). Minimum hit target 24 × 24 px.
- **Radius**: `--radius-sm` 4 px (badges, checkboxes), `--radius-md` 6 px (buttons, inputs), `--radius-lg` 8 px (cards, board cards), `--radius-xl` 12 px (dialogs, start cards), `--radius-full` (pills, avatars).
- **Elevation**: `--shadow-sm` (cards at rest: `0 1px 2px rgb(0 0 0 / 0.05)`), `--shadow-md` (hovered/dragged card, popovers), `--shadow-lg` (dialogs, toasts). Dark theme uses the same structure with higher opacity and relies more on `--border`.
- **Motion**: `--duration-fast` 120 ms, `--duration-normal` 200 ms, `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`; only opacity, transform and colour transitions. `prefers-reduced-motion: reduce` sets durations to 0.
- **Layers** (z-index tokens): `--z-sticky` 10, `--z-drawer` 20, `--z-popover` 30, `--z-dialog` 40, `--z-toast` 50.

## 3. Themes

- **Light** and **dark** are both first-class; both meet AA (NFR-020) and are covered by the automated contrast check.
- Default is **System** (follows the OS via `prefers-color-scheme`). *Settings → Appearance* offers **System / Light / Dark** (FR-117). The choice is applied immediately without restart, persists across restarts, and is applied before the first paint (no flash of the wrong theme).
- Mechanism: the main process sets Electron's `nativeTheme.themeSource` (`system` / `light` / `dark`), so `prefers-color-scheme` in the renderer, native scrollbars, form controls and title bar all follow one setting. Tokens switch with `@media (prefers-color-scheme: dark)`; `color-scheme` is set per theme.
- Third-party views use the same tokens: CodeMirror editor and merge view (theme extension reading CSS variables), React Flow (CSS variables for nodes, edges, background), log view ANSI palette (light and dark variants with AA contrast).

## 4. Layout

### 4.1 Application shell (UF-00)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◆ SpecForge │ Task Manager ▾ │ ● Git · main      2 running · 1 queued  🔔 3 │  top bar 48 px, --bg, bottom --border
├────────────┬─────────────────────────────────────────────────────────┤
│ ▣ Dashboard│  Page title (--text-xl)                 [secondary] [Primary] │
│ ✎ Intent   │  ─ phase stepper (when in a phase area) ─                     │
│ ☰ Specs    │                                                          │
│ ▦ Kanban   │  content: max-width 1200 px for documents and forms;     │
│ ▶ Runs     │  full width for board, graph, logs, diffs                 │
│            │                                                          │
│ ⚙ Settings │                                                          │
└────────────┴─────────────────────────────────────────────────────────┘
   sidebar 220 px (collapsible to 56 px icons-only), --bg-subtle, right --border
```

- **Sidebar**: icon + label per area (Lucide), 32 px rows, `--radius-md`; active item `--surface-selected` + `--accent-text` + 2 px accent marker; disabled items (Kanban without stories) at muted text with a tooltip explaining why. Settings pinned to the bottom. Collapse state remembered (per viewer, local).
- **Top bar**: app mark, project switcher (dropdown with recent projects), VCS badge, run indicator and pending-decisions bell with counter (pill), *n spec files changed → Commit* as a subtle button.
- **Page header**: title, optional description, actions right-aligned (one primary at most).
- **Banners** (limited mode, non-git warning) sit full-width under the top bar as callouts, not as plain text.
- **Right drawer** (trace panel, story drawer): 400 px, `--surface`, `--shadow-lg`, slides in (motion tokens), closes with Esc.
- Minimum window 1024 × 640; below 1280 px width the sidebar collapses to icons automatically.

### 4.2 Content patterns

- **Cards** for dashboard widgets, start-wizard choices and run tiles: `--surface`, `--border`, `--radius-lg`, `--shadow-sm`, padding `--space-4`; header row (title + action), body, optional footer.
- **Tables / lists** (recent projects, rules, runs): no vertical lines, `--border` row dividers, header row `--bg-subtle` + `--text-muted` `--text-xs` uppercase-free medium labels, hover `--surface-hover`, row actions appear on hover/focus (and are always reachable by keyboard).
- **Empty states**: icon (24 px, muted), one-line title, one-line explanation, primary action (e.g. "No stories yet — Generate stories").
- **Forms**: label above control, hint below in `--text-subtle`, errors in `--danger` with icon; one column, max 560 px wide; primary action bottom-right, secondary left of it.
- **Kanban**: columns on `--bg-subtle` with header (name + count pill); story cards on `--surface` with ID (mono, muted), title (medium), epic chip, dependency badge, status icon; drag shows `--shadow-md` and slight scale (1.02); drop targets highlighted with `--accent-subtle`; swimlane headers as sticky rows.
- **Logs and diffs**: monospace `--text-sm`, `--bg-subtle` gutter, search highlights `--warning-subtle`, line numbers `--text-subtle`.

## 5. Components

Implemented as plain CSS classes in `@layer components` plus small React components where behaviour is needed (ADR-023). Every interactive component has hover, active, focus-visible, disabled and (where relevant) loading states.

| Component | Variants / notes |
|---|---|
| **Button** | `primary` (accent, max one per view), `secondary` (surface + border), `ghost` (transparent, toolbar/row actions), `danger` (destructive confirmations); sizes sm/md/lg; optional leading icon; icon-only buttons need `aria-label` + tooltip; loading shows a spinner and keeps width |
| **Input / Textarea / Select** | 32 px, `--border-strong`, `--radius-md`; focus = 2 px `--focus` ring; invalid = `--danger` border + message; read-only styled distinct from disabled |
| **Checkbox / Radio / Switch** | Native inputs restyled via `accent-color: var(--accent)` and size tokens; switch for on/off settings |
| **Segmented control / Tabs** | View toggles (board / graph, side-by-side / unified diff), settings sections |
| **Badge / Pill** | Status badge (icon + label, status colours from §2.1), count pill, neutral tag (epic chip) |
| **Callout / Banner** | info / success / warning / danger; icon, title, text, optional action; replaces ad-hoc warning paragraphs |
| **Card** | See §4.2; interactive cards (start wizard) get hover elevation and focus ring |
| **Dialog** | Radix Dialog: overlay (`rgb(0 0 0 / 0.4)`, dark 0.6), `--radius-xl`, `--shadow-lg`, title + description, actions bottom-right, focus trap, Esc closes; destructive dialogs use `danger` primary |
| **Dropdown menu / Popover / Tooltip** | Radix primitives (project switcher, row "⋯" menus, icon-button tooltips); keyboard navigable |
| **Toast** | Bottom-right stack, `--surface` + status icon + left status stripe, auto-dismiss 5 s (errors stay), action button optional |
| **Phase stepper** | Horizontal steps with status icon (done ✓ success, current accent, blocked muted lock), labels below |
| **Progress / Spinner** | Indeterminate spinner for runs/health checks; progress bar for snapshots and indexing |
| **Kbd** | Keyboard hint chips in tooltips and menus |
| **Skeleton** | Loading placeholders for dashboard widgets and lists (instead of "Loading…" text) |

### 5.1 Icons

**Lucide** (`lucide-react`, ISC licence): 16 px in controls and lists, 20 px in navigation, 24 px in empty states; stroke width 1.75; colour inherits `currentColor`. Decorative icons are `aria-hidden`; icon-only buttons have an accessible name. Fixed mapping, e.g. Dashboard `LayoutDashboard`, Intent `Lightbulb`, Specifications `FileText`, Kanban `KanbanSquare`, Executions `Play`, Settings `Settings`, pending decisions `Bell`, Git `GitBranch`, done `CircleCheck`, failed `CircleX`, running `LoaderCircle` (spinning), queued `Clock`, warning `TriangleAlert`, info `Info`, approve `Check`, reject `X`.

## 6. CSS architecture (ADR-023)

```
packages/ui/src/styles/
  index.css        @layer reset, tokens, base, components, areas, utilities; imports below
  reset.css        modern minimal reset (box-sizing, margins, media, form font inheritance)
  tokens.css       :root tokens (light) + @media (prefers-color-scheme: dark) overrides
  base.css         html/body, typography, links, focus-visible, scrollbars, selection
  components/*.css button, field, badge, callout, card, dialog, menu, toast, table, tabs, stepper, skeleton
  areas/*.css      shell, start, setup, dashboard, intent, specs, kanban, graph, executions, review, settings
  utilities.css    few helpers: visually-hidden, stack/cluster/row gap helpers, truncate, mono
```

- **Cascade layers** keep specificity flat: areas may adapt components only through tokens or documented modifiers; no `!important` except in `utilities` and reduced-motion.
- **Naming**: component classes with variant modifiers (`.btn .btn-primary .btn-sm`, `.badge .badge-success`, `.callout .callout-warning`); area classes prefixed by area (`.kanban-card`, `.run-tile`). State via ARIA/data attributes where possible (`[aria-current='page']`, `[aria-selected]`, `[data-state='open']` from Radix, `[aria-invalid]`) rather than extra classes.
- **CSP**: the renderer CSP stays `style-src 'self'` plus the per-session nonce for CodeMirror; static CSS only, no CSS-in-JS runtime, no inline `style` attributes in markup (React `style` props are applied via the CSSOM and may be used by libraries such as Radix positioning and React Flow).
- **Guardrails** (NFR-033): a lint check (stylelint or a small repository check) rejects colour, shadow and font-size literals outside `tokens.css`; the E2E contrast check (axe `color-contrast`) runs in **both** themes for all primary areas; component styles are demonstrated on an internal, test-only gallery page used for visual smoke checks.

## 7. Accessibility checklist (applies to every story of this concept)

- Contrast AA in light and dark (text 4.5:1, large text and UI components 3:1).
- Focus always visible (`:focus-visible` ring 2 px `--focus`, offset 2 px), never removed.
- Status = icon + text; colour only reinforces.
- Hit targets ≥ 24 × 24 px; keyboard paths unchanged or improved (US-065 keyboard workflow stays green).
- Respects OS scaling (rem-based), reduced motion, high-contrast mode (`forced-colors: active` keeps borders and focus visible).
