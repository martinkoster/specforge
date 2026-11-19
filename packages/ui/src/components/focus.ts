// SPDX-License-Identifier: Apache-2.0
// Focus return for overlays that are mounted while open (US-071): Radix returns focus only to a Dialog.Trigger, so the
// element that had the focus when the overlay mounted gets it back when the overlay unmounts.
import { useEffect, useRef } from 'react';

export function useReturnFocus(): void {
  // Read during the first render — before Radix moves the focus into the overlay.
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  useEffect(() => {
    const element = opener.current;
    return () => {
      // After Radix's own unmount handling; never steals the focus from an element the user moved to meanwhile.
      setTimeout(() => {
        const lost = document.activeElement === null || document.activeElement === document.body;
        if (lost && element instanceof HTMLElement && element !== document.body && element.isConnected) element.focus();
      }, 0);
    };
  }, []);
}
