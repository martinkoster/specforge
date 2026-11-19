// SPDX-License-Identifier: Apache-2.0
// Right drawer (US-071 AC-4, ui_design_concept.md §4.1): a non-modal Radix Dialog — the page behind stays usable; slides
// in (motion tokens, none with reduced motion), closes with Esc or Close, focus returns to the element that opened it.
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useReturnFocus } from './focus.js';

export interface DrawerProps {
  title: ReactNode;
  /** Accessible name when it differs from the visible title. */
  label?: string;
  children?: ReactNode;
  onClose(): void;
  className?: string;
}

export function Drawer({ title, label, children, onClose, className }: DrawerProps) {
  useReturnFocus();
  return (
    <RadixDialog.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Content
          className={className ? `drawer ${className}` : 'drawer'}
          aria-describedby={undefined}
          {...(label ? { 'aria-label': label, 'aria-labelledby': undefined } : {})}
          // Clicking the board or another card keeps the drawer; it closes with Esc or Close.
          onInteractOutside={(event) => event.preventDefault()}
        >
          <header className="drawer-header">
            <RadixDialog.Title className="drawer-title">{title}</RadixDialog.Title>
            <RadixDialog.Close className="btn btn-ghost btn-sm">Close</RadixDialog.Close>
          </header>
          <div className="drawer-body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
