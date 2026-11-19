// SPDX-License-Identifier: Apache-2.0
// Dialog (US-071 AC-1, ui_design_concept.md §5): Radix Dialog — overlay, title, description, footer actions (primary on
// the right), focus trap, Esc / overlay close (not while busy), focus back to the opener; `danger` for destructive
// confirmations. Callers mount it while it is open.
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useReturnFocus } from './focus.js';

export interface DialogProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose(): void;
  /** While busy, Esc and overlay clicks do not close the dialog. */
  busy?: boolean;
  tone?: 'default' | 'danger';
  /** `alertdialog` for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

export function Dialog({
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
  tone = 'default',
  role = 'dialog',
  className,
}: DialogProps) {
  useReturnFocus();
  return (
    <RadixDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content
          role={role}
          className={['dialog', tone === 'danger' ? 'dialog-danger' : '', className ?? ''].filter(Boolean).join(' ')}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => busy && event.preventDefault()}
        >
          <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
          {description && <RadixDialog.Description className="dialog-description">{description}</RadixDialog.Description>}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
