// SPDX-License-Identifier: Apache-2.0
// Tooltip (US-071 AC-2, ui_design_concept.md §5): Radix Tooltip on hover and keyboard focus; used for icon-only buttons
// and disabled controls that need an explanation.
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <RadixTooltip.Provider delayDuration={400}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="tooltip" sideOffset={6}>
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
