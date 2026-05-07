import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useShiftKeyTracker } from '../../../../src/components/Designer/Canvas/hooks/useShiftKeyTracker.js';

const fireKey = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => {
  window.dispatchEvent(new KeyboardEvent(type, init));
};

describe('useShiftKeyTracker', () => {
  it('starts with shift-not-pressed and editing-off', () => {
    const { result } = renderHook(() => useShiftKeyTracker());
    expect(result.current.isPressShiftKey).toBe(false);
    expect(result.current.editing).toBe(false);
  });

  it('sets isPressShiftKey true when a key is pressed with shiftKey', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      fireKey('keydown', { key: 'A', shiftKey: true });
    });

    expect(result.current.isPressShiftKey).toBe(true);
  });

  it('clears isPressShiftKey on keyup of Shift itself', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      fireKey('keydown', { key: 'A', shiftKey: true });
      fireKey('keyup', { key: 'Shift', shiftKey: false });
    });

    expect(result.current.isPressShiftKey).toBe(false);
  });

  it('clears isPressShiftKey on any keyup if shiftKey is no longer held', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      fireKey('keydown', { key: 'A', shiftKey: true });
      fireKey('keyup', { key: 'a', shiftKey: false });
    });

    expect(result.current.isPressShiftKey).toBe(false);
  });

  it('keeps shift state when keyup fires for another key while Shift remains held', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      fireKey('keydown', { key: 'A', shiftKey: true });
      // Release "A" but Shift is still down.
      fireKey('keyup', { key: 'a', shiftKey: true });
    });

    expect(result.current.isPressShiftKey).toBe(true);
  });

  it('exits editing on Escape', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      result.current.setEditing(true);
    });
    expect(result.current.editing).toBe(true);

    act(() => {
      fireKey('keyup', { key: 'Escape' });
    });

    expect(result.current.editing).toBe(false);
  });

  it('exits editing on legacy "Esc" key value', () => {
    const { result } = renderHook(() => useShiftKeyTracker());

    act(() => {
      result.current.setEditing(true);
      fireKey('keyup', { key: 'Esc' });
    });

    expect(result.current.editing).toBe(false);
  });

  it('removes the listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useShiftKeyTracker());

    unmount();

    // After unmount the listeners must be gone, so dispatching shift-keydown
    // must not change the captured snapshot of state.
    fireKey('keydown', { key: 'A', shiftKey: true });
    expect(result.current.isPressShiftKey).toBe(false);
  });
});
