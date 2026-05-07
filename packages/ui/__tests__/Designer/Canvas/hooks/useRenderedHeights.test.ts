import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRenderedHeights } from '../../../../src/components/Designer/Canvas/hooks/useRenderedHeights.js';

describe('useRenderedHeights', () => {
  it('starts with an empty map', () => {
    const { result } = renderHook(() => useRenderedHeights());
    expect(result.current.renderedSchemaHeights).toEqual({});
  });

  it('records a height change for a schema id', () => {
    const { result } = renderHook(() => useRenderedHeights());

    act(() => {
      result.current.onRenderedHeightChange('schema-1', 42);
    });

    expect(result.current.renderedSchemaHeights).toEqual({ 'schema-1': 42 });
  });

  it('records heights for multiple schemas independently', () => {
    const { result } = renderHook(() => useRenderedHeights());

    act(() => {
      result.current.onRenderedHeightChange('a', 10);
      result.current.onRenderedHeightChange('b', 20);
    });

    expect(result.current.renderedSchemaHeights).toEqual({ a: 10, b: 20 });
  });

  it('keeps the same map reference when reporting an unchanged height (memo stability)', () => {
    const { result } = renderHook(() => useRenderedHeights());

    act(() => {
      result.current.onRenderedHeightChange('a', 10);
    });
    const firstSnapshot = result.current.renderedSchemaHeights;

    act(() => {
      result.current.onRenderedHeightChange('a', 10);
    });

    expect(result.current.renderedSchemaHeights).toBe(firstSnapshot);
  });

  it('produces a new map reference when a height changes (so memo consumers re-run)', () => {
    const { result } = renderHook(() => useRenderedHeights());

    act(() => {
      result.current.onRenderedHeightChange('a', 10);
    });
    const firstSnapshot = result.current.renderedSchemaHeights;

    act(() => {
      result.current.onRenderedHeightChange('a', 11);
    });

    expect(result.current.renderedSchemaHeights).not.toBe(firstSnapshot);
    expect(result.current.renderedSchemaHeights).toEqual({ a: 11 });
  });
});
