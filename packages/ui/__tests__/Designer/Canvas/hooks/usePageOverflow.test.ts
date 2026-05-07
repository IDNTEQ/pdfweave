import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BasePdf, SchemaForUI, Size } from '@pdfweave/common';
import { usePageOverflow } from '../../../../src/components/Designer/Canvas/hooks/usePageOverflow.js';

const A4: Size = { width: 210, height: 297 };

const blankPdf = (padding: [number, number, number, number] = [10, 10, 10, 10]): BasePdf =>
  ({
    width: A4.width,
    height: A4.height,
    padding,
  }) as BasePdf;

const schema = (id: string, y: number, height: number): SchemaForUI =>
  ({
    id,
    name: id,
    type: 'text',
    position: { x: 10, y },
    width: 100,
    height,
    content: '',
  }) as unknown as SchemaForUI;

describe('usePageOverflow', () => {
  it('reports zero overflow when nothing exceeds the content-bottom line', () => {
    const onPageOverflowChange = vi.fn();
    const { result } = renderHook(() =>
      usePageOverflow({
        basePdf: blankPdf([10, 10, 10, 10]),
        pageCursor: 0,
        pageSizes: [A4],
        schemasList: [[schema('a', 10, 50)]],
        renderedSchemaHeights: {},
        onPageOverflowChange,
      }),
    );

    expect(result.current.overflowingSchemaCount).toBe(0);
    expect(result.current.hasOverflow).toBe(false);
    expect(result.current.bottomPaddingMm).toBe(10);
    expect(onPageOverflowChange).toHaveBeenCalledTimes(1);
    expect(onPageOverflowChange).toHaveBeenCalledWith({ pageIndex: 0, overflowingSchemaCount: 0 });
  });

  it('counts schemas whose authored height pushes them past the bottom padding line', () => {
    const { result } = renderHook(() =>
      usePageOverflow({
        basePdf: blankPdf([10, 10, 10, 10]),
        pageCursor: 0,
        pageSizes: [A4],
        // y=280, height=20 -> bottom=300; content bottom = 297 - 10 = 287 -> overflows.
        schemasList: [[schema('a', 280, 20), schema('b', 50, 30)]],
        renderedSchemaHeights: {},
        onPageOverflowChange: vi.fn(),
      }),
    );

    expect(result.current.overflowingSchemaCount).toBe(1);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('uses rendered height when it exceeds the authored height', () => {
    const { result } = renderHook(() =>
      usePageOverflow({
        basePdf: blankPdf([10, 10, 10, 10]),
        pageCursor: 0,
        pageSizes: [A4],
        // authored height keeps schema in-bounds, but rendered height pushes it out
        schemasList: [[schema('a', 250, 10)]],
        renderedSchemaHeights: { a: 100 },
        onPageOverflowChange: vi.fn(),
      }),
    );

    expect(result.current.overflowingSchemaCount).toBe(1);
  });

  it('returns 0 overflow when the page height is unknown (zero)', () => {
    const onPageOverflowChange = vi.fn();
    const { result } = renderHook(() =>
      usePageOverflow({
        basePdf: blankPdf([10, 10, 10, 10]),
        pageCursor: 0,
        pageSizes: [{ width: 0, height: 0 }],
        schemasList: [[schema('a', 280, 20)]],
        renderedSchemaHeights: {},
        onPageOverflowChange,
      }),
    );

    expect(result.current.overflowingSchemaCount).toBe(0);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('only fires onPageOverflowChange when (page, count) changes', () => {
    const onPageOverflowChange = vi.fn();
    const { rerender } = renderHook(
      ({ schemas }: { schemas: SchemaForUI[] }) =>
        usePageOverflow({
          basePdf: blankPdf([10, 10, 10, 10]),
          pageCursor: 0,
          pageSizes: [A4],
          schemasList: [schemas],
          renderedSchemaHeights: {},
          onPageOverflowChange,
        }),
      { initialProps: { schemas: [schema('a', 50, 30)] } },
    );

    expect(onPageOverflowChange).toHaveBeenCalledTimes(1);

    // Same overflow count -> no extra call.
    rerender({ schemas: [schema('a', 50, 30), schema('b', 60, 30)] });
    expect(onPageOverflowChange).toHaveBeenCalledTimes(1);

    // Now an overflowing schema appears -> exactly one new call.
    rerender({ schemas: [schema('a', 50, 30), schema('b', 280, 30)] });
    expect(onPageOverflowChange).toHaveBeenCalledTimes(2);
    expect(onPageOverflowChange).toHaveBeenLastCalledWith({
      pageIndex: 0,
      overflowingSchemaCount: 1,
    });
  });

  it('treats a non-blank basePdf without padding as zero padding', () => {
    const { result } = renderHook(() =>
      usePageOverflow({
        // intentionally missing padding -> helper should default to [0,0,0,0]
        basePdf: { width: A4.width, height: A4.height } as unknown as BasePdf,
        pageCursor: 0,
        pageSizes: [A4],
        schemasList: [[schema('a', 250, 10)]],
        renderedSchemaHeights: {},
        onPageOverflowChange: vi.fn(),
      }),
    );

    expect(result.current.bottomPaddingMm).toBe(0);
    // y=250, height=10 -> 260 < 297; no overflow
    expect(result.current.overflowingSchemaCount).toBe(0);
  });
});
