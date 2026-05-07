import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks whether the Shift key is currently held and exposes a setter for
 * the Designer's `editing` mode that the Escape key shortcut also clears.
 *
 * Shift-state powers two Canvas behaviours:
 *   1. Selecto's `continueSelect` (additive marquee select while Shift is held)
 *   2. Moveable's `keepRatio` (constrain proportions while resizing)
 *
 * Escape exits inline editing on a focused schema. This is intentionally
 * separate from the global keyboard shortcut layer in `hooks.ts` because
 * Canvas needs to drive both `editing` state and Shift state from the same
 * key-event surface.
 */
export const useShiftKeyTracker = () => {
  const [isPressShiftKey, setIsPressShiftKey] = useState(false);
  const [editing, setEditing] = useState(false);

  const onKeydown = useCallback((e: KeyboardEvent) => {
    if (e.shiftKey) setIsPressShiftKey(true);
  }, []);

  const onKeyup = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift' || !e.shiftKey) setIsPressShiftKey(false);
    if (e.key === 'Escape' || e.key === 'Esc') setEditing(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
    };
  }, [onKeydown, onKeyup]);

  return {
    isPressShiftKey,
    setIsPressShiftKey,
    editing,
    setEditing,
  };
};
