// SPDX-License-Identifier: Apache-2.0
// Dropdown menu (US-071 AC-2, ui_design_concept.md §5): Radix DropdownMenu for row "⋯" menus and switchers; fully
// keyboard-operable (Enter/Space opens, arrows move, Enter selects, Esc closes).
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icons.js';

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger (e.g. "Actions for Task Manager"). */
  label: string;
  items: readonly MenuItem[];
  /** Visible trigger content; defaults to a "⋯" icon. */
  trigger?: ReactNode;
}

export function Menu({ label, items, trigger }: MenuProps) {
  return (
    <RadixMenu.Root modal={false}>
      <RadixMenu.Trigger className={trigger ? 'btn btn-ghost btn-sm' : 'btn btn-ghost btn-sm btn-icon'} aria-label={label}>
        {trigger ?? <Icon icon={MoreHorizontal} />}
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="menu" align="end" sideOffset={4}>
          {items.map((item) => (
            <RadixMenu.Item
              key={item.label}
              className={item.danger ? 'menu-item menu-item-danger' : 'menu-item'}
              disabled={item.disabled ?? false}
              onSelect={() => item.onSelect()}
            >
              {item.label}
            </RadixMenu.Item>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
