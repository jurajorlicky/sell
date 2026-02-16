import { useEffect } from 'react';

/**
 * Hook that calls a handler when the Escape key is pressed.
 * Only fires when the modal/component is open.
 */
export function useEscapeKey(handler: () => void, isActive = true) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handler();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handler, isActive]);
}
