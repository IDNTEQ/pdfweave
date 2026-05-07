import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import type MoveableComponent from 'react-moveable';
import type { SchemaForUI } from '@pdfweave/common';
import { useMoveableSync } from '../../../../src/components/Designer/Canvas/hooks/useMoveableSync.js';

const schema = (id: string, x = 0): SchemaForUI =>
  ({
    id,
    name: id,
    type: 'text',
    position: { x, y: 0 },
    width: 50,
    height: 20,
    content: '',
  }) as unknown as SchemaForUI;

describe('useMoveableSync', () => {
  it('calls updateRect on first mount', () => {
    const updateRect = vi.fn();
    const moveable: React.MutableRefObject<MoveableComponent | null> = {
      current: { updateRect } as unknown as MoveableComponent,
    };

    renderHook(() =>
      useMoveableSync({
        moveable,
        pageCursor: 0,
        schemasList: [[schema('a')]],
      }),
    );

    expect(updateRect).toHaveBeenCalled();
  });

  it('does NOT crash when moveable.current is null', () => {
    const moveable: React.MutableRefObject<MoveableComponent | null> = { current: null };
    expect(() =>
      renderHook(() =>
        useMoveableSync({
          moveable,
          pageCursor: 0,
          schemasList: [[schema('a')]],
        }),
      ),
    ).not.toThrow();
  });

  it('calls updateRect again on rerender when the page schemas are stable (the fast-path for in-place mutations)', () => {
    const updateRect = vi.fn();
    const moveable: React.MutableRefObject<MoveableComponent | null> = {
      current: { updateRect } as unknown as MoveableComponent,
    };

    const initialSchemas = [[schema('a', 5)]];
    const { rerender } = renderHook(
      ({ schemas }: { schemas: SchemaForUI[][] }) =>
        useMoveableSync({
          moveable,
          pageCursor: 0,
          schemasList: schemas,
        }),
      { initialProps: { schemas: initialSchemas } },
    );
    const callsAfterMount = updateRect.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Pass a NEW reference with the same content -> the JSON-stringify
    // diff matches and the second updateRect should fire.
    rerender({ schemas: [[schema('a', 5)]] });
    expect(updateRect.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
