// SPDX-License-Identifier: Apache-2.0
// Icon set (US-070 AC-4, ui_design_concept.md §5.1): Lucide (ISC). One mapping for areas and status tones; icons are
// decorative (aria-hidden) — the accompanying text carries the meaning.
import {
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Lightbulb,
  Play,
  Settings,
  SquareKanban,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon };

export const AREA_ICONS = {
  dashboard: LayoutDashboard,
  projects: FolderOpen,
  intent: Lightbulb,
  specifications: FileText,
  kanban: SquareKanban,
  executions: Play,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'review';

export const STATUS_ICONS = {
  neutral: Circle,
  info: Clock,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  review: Eye,
} satisfies Record<Tone, LucideIcon>;

export const CALLOUT_ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
} satisfies Record<string, LucideIcon>;

export interface IconProps {
  icon: LucideIcon;
  /** 16 px in controls and lists, 20 px in navigation, 24 px in empty states. */
  size?: 16 | 20 | 24;
  className?: string;
}

export function Icon({ icon: Glyph, size = 16, className }: IconProps) {
  return <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={1.75} className={className ? `icon ${className}` : 'icon'} />;
}
