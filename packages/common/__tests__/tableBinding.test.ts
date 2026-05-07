import { describe, expect, it } from 'vitest';
import {
  buildPreviewRows,
  coerceWidthPercentage,
  fallbackColumns,
  getTableColumns,
  inferColumns,
  inferColumnWidths,
  normalizeColumnWidths,
  rebalanceColumnWidths,
  resolveTableRows,
  widthPercentages,
} from '../src/tableBinding.js';
import type { Schema, SchemaBindingColumn } from '../src/types.js';

const makeColumn = (overrides: Partial<SchemaBindingColumn> & { path: string }): SchemaBindingColumn => ({
  path: overrides.path,
  label: overrides.label ?? overrides.path,
  widthPercentage: overrides.widthPercentage,
  ...(overrides.format ? { format: overrides.format } : {}),
});

describe('inferColumnWidths', () => {
  it('returns [100] for a 1-column table', () => {
    expect(inferColumnWidths(1)).toEqual([100]);
  });

  it('produces evenly distributed widths summing to 100 for 3 columns', () => {
    const widths = inferColumnWidths(3);
    expect(widths).toHaveLength(3);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100, 4);
    // last column absorbs the remainder
    expect(widths[2]).toBeCloseTo(100 - widths[0] - widths[1], 4);
  });

  it('handles 4 columns precisely (last column compensates rounding)', () => {
    const widths = inferColumnWidths(4);
    expect(widths).toEqual([25, 25, 25, 25]);
  });

  it('returns [100] for zero / negative / non-finite counts', () => {
    expect(inferColumnWidths(0)).toEqual([100]);
    expect(inferColumnWidths(-3)).toEqual([100]);
    expect(inferColumnWidths(Number.NaN)).toEqual([100]);
  });
});

describe('inferColumns', () => {
  it('infers from object rows', () => {
    const cols = inferColumns([{ a: 1, b: 2, c: 3 }]);
    expect(cols.map((c) => c.path)).toEqual(['a', 'b', 'c']);
    expect(cols.map((c) => c.label)).toEqual(['A', 'B', 'C']);
    expect(cols.reduce((sum, c) => sum + (c.widthPercentage ?? 0), 0)).toBeCloseTo(100, 4);
  });

  it('infers from array-of-arrays as numbered Column N', () => {
    const cols = inferColumns([['a', 'b', 'c']]);
    expect(cols.map((c) => c.path)).toEqual(['0', '1', '2']);
    expect(cols.map((c) => c.label)).toEqual(['Column 1', 'Column 2', 'Column 3']);
  });

  it('falls back to a single Value column for empty / non-array samples', () => {
    expect(inferColumns([])).toEqual(fallbackColumns());
    expect(inferColumns(undefined)).toEqual(fallbackColumns());
    expect(inferColumns('not an array')).toEqual(fallbackColumns());
  });

  it('uses itemFields metadata when provided', () => {
    const cols = inferColumns(undefined, {
      sku: { type: 'string', label: 'SKU' },
      price: {
        type: 'number',
        label: 'Price',
        format: { kind: 'currency', currency: 'USD' },
      },
    });
    expect(cols).toEqual([
      { path: 'sku', label: 'SKU', format: undefined, widthPercentage: 50 },
      {
        path: 'price',
        label: 'Price',
        format: { kind: 'currency', currency: 'USD' },
        widthPercentage: 50,
      },
    ]);
  });

  it('uses titlecased keys when no field labels are provided', () => {
    const cols = inferColumns([{ first_name: 'A', lastName: 'B' }]);
    // titleFromPath only uppercases the first character — snake_case spaces
    // out (lowercase second word), camelCase splits at the boundary so the
    // second word retains its original capital.
    expect(cols.map((c) => c.label)).toEqual(['First name', 'Last Name']);
  });
});

describe('widthPercentages', () => {
  it('returns [100] for an empty column list', () => {
    expect(widthPercentages([])).toEqual([100]);
  });

  it('passes through normalised widths when total is already 100', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 25 }),
      makeColumn({ path: 'b', widthPercentage: 25 }),
      makeColumn({ path: 'c', widthPercentage: 50 }),
    ];
    expect(widthPercentages(cols)).toEqual([25, 25, 50]);
  });

  it('renormalises when total > 100', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 80 }),
      makeColumn({ path: 'b', widthPercentage: 80 }),
    ];
    const widths = widthPercentages(cols);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100, 4);
  });

  it('absorbs the remainder into the last column when total < 100', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 30 }),
      makeColumn({ path: 'b', widthPercentage: 30 }),
    ];
    const widths = widthPercentages(cols);
    expect(widths[0]).toBe(30);
    expect(widths[1]).toBe(70);
  });

  it('fills missing widths from the remaining 100 - explicit total', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 40 }),
      makeColumn({ path: 'b' }),
      makeColumn({ path: 'c' }),
    ];
    const widths = widthPercentages(cols);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100, 4);
    expect(widths[0]).toBe(40);
  });
});

describe('coerceWidthPercentage', () => {
  it('clamps to [1, 100] and rounds', () => {
    expect(coerceWidthPercentage(0.5)).toBe(1);
    expect(coerceWidthPercentage(150)).toBe(100);
    expect(coerceWidthPercentage(33.333333)).toBe(33.3333);
  });

  it('returns undefined for non-numbers', () => {
    expect(coerceWidthPercentage(undefined)).toBeUndefined();
    expect(coerceWidthPercentage(Number.NaN)).toBeUndefined();
    expect(coerceWidthPercentage('50')).toBeUndefined();
  });
});

describe('normalizeColumnWidths', () => {
  it('overwrites widths to make them sum to 100', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 200 }),
      makeColumn({ path: 'b', widthPercentage: 200 }),
    ];
    const normalized = normalizeColumnWidths(cols);
    expect(normalized.reduce((sum, c) => sum + (c.widthPercentage ?? 0), 0)).toBeCloseTo(100, 4);
  });
});

describe('rebalanceColumnWidths', () => {
  it('reorder is invertible (round-trip restores order)', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 40 }),
      makeColumn({ path: 'b', widthPercentage: 30 }),
      makeColumn({ path: 'c', widthPercentage: 30 }),
    ];
    const reordered = rebalanceColumnWidths(cols, { kind: 'reorder', from: 0, to: 2 });
    expect(reordered.map((c) => c.path)).toEqual(['b', 'c', 'a']);
    const restored = rebalanceColumnWidths(reordered, { kind: 'reorder', from: 2, to: 0 });
    expect(restored.map((c) => c.path)).toEqual(['a', 'b', 'c']);
  });

  it('add → remove returns to a column array equivalent to the original', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 50 }),
      makeColumn({ path: 'b', widthPercentage: 50 }),
    ];
    const added = rebalanceColumnWidths(cols, {
      kind: 'add',
      column: makeColumn({ path: 'c' }),
    });
    expect(added.map((c) => c.path)).toEqual(['a', 'b', 'c']);
    expect(added.reduce((sum, c) => sum + (c.widthPercentage ?? 0), 0)).toBeCloseTo(100, 4);

    const removed = rebalanceColumnWidths(added, { kind: 'remove', atIndex: 2 });
    expect(removed.map((c) => c.path)).toEqual(['a', 'b']);
    expect(removed.reduce((sum, c) => sum + (c.widthPercentage ?? 0), 0)).toBeCloseTo(100, 4);
  });

  it('add clamps the new column width into [12, 45] when a width is requested', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 50 }),
      makeColumn({ path: 'b', widthPercentage: 50 }),
    ];
    const added = rebalanceColumnWidths(cols, {
      kind: 'add',
      column: makeColumn({ path: 'c', widthPercentage: 90 }),
    });
    const cWidth = added.find((col) => col.path === 'c')?.widthPercentage ?? 0;
    expect(cWidth).toBeLessThanOrEqual(45);
    expect(cWidth).toBeGreaterThanOrEqual(12);
  });

  it('edit clamps to [1, 100 - (n - 1)] and redistributes proportionally', () => {
    const cols = [
      makeColumn({ path: 'a', widthPercentage: 25 }),
      makeColumn({ path: 'b', widthPercentage: 25 }),
      makeColumn({ path: 'c', widthPercentage: 50 }),
    ];
    const edited = rebalanceColumnWidths(cols, {
      kind: 'edit',
      atIndex: 0,
      widthPercentage: 60,
    });
    expect(edited[0].widthPercentage).toBe(60);
    expect(edited.reduce((sum, c) => sum + (c.widthPercentage ?? 0), 0)).toBeCloseTo(100, 4);
  });

  it('add into an empty column list yields a single 100% column', () => {
    const result = rebalanceColumnWidths([], {
      kind: 'add',
      column: makeColumn({ path: 'a' }),
    });
    expect(result).toEqual([{ path: 'a', label: 'a', widthPercentage: 100 }]);
  });
});

describe('buildPreviewRows', () => {
  const columns = [
    makeColumn({ path: 'sku', label: 'SKU' }),
    makeColumn({ path: 'price', label: 'Price', format: { kind: 'currency', currency: 'USD' } }),
  ];

  it('formats record rows by column path', () => {
    expect(
      buildPreviewRows({
        columns,
        sample: [{ sku: 'ENV-10', price: 0.82 }],
      }),
    ).toEqual([['ENV-10', '$0.82']]);
  });

  it('formats array rows by column index', () => {
    expect(
      buildPreviewRows({
        columns,
        sample: [['ENV-10', 0.82]],
      }),
    ).toEqual([['ENV-10', '$0.82']]);
  });

  it('parses JSON-encoded sample data', () => {
    expect(
      buildPreviewRows({
        columns,
        sample: JSON.stringify([{ sku: 'ENV-10', price: 0.82 }]),
      }),
    ).toEqual([['ENV-10', '$0.82']]);
  });

  it('returns [] for non-array samples', () => {
    expect(buildPreviewRows({ columns, sample: undefined })).toEqual([]);
    expect(buildPreviewRows({ columns, sample: null })).toEqual([]);
    expect(buildPreviewRows({ columns, sample: { not: 'an array' } })).toEqual([]);
  });

  it('returns [] for an unparseable string but does not throw', () => {
    expect(buildPreviewRows({ columns, sample: 'not-json' })).toEqual([]);
  });

  it('handles head-only schemas (sample === undefined → no body rows)', () => {
    expect(buildPreviewRows({ columns, sample: undefined })).toEqual([]);
  });
});

describe('resolveTableRows', () => {
  const tableSchema = (binding?: Record<string, unknown>): Schema => ({
    name: 'items',
    type: 'table',
    content: '[]',
    position: { x: 0, y: 0 },
    width: 100,
    height: 20,
    binding: binding as Schema['binding'],
  });

  it('resolves a simple binding ($.orders shape)', () => {
    const schema = tableSchema({
      path: 'orders',
      columns: [
        { path: 'sku', label: 'SKU' },
        { path: 'price', label: 'Price', format: { kind: 'currency', currency: 'USD' } },
      ],
    });
    expect(
      resolveTableRows(schema, {
        orders: [{ sku: 'ENV-10', price: 0.82 }],
      }),
    ).toEqual([['ENV-10', '$0.82']]);
  });

  it('returns [] for a missing binding path', () => {
    const schema = tableSchema({
      path: 'missing',
      columns: [{ path: 'sku', label: 'SKU' }],
    });
    expect(resolveTableRows(schema, { other: [{ sku: 'X' }] })).toEqual([]);
  });

  it('resolves nested binding paths', () => {
    const schema = tableSchema({
      path: 'data.orders',
      columns: [{ path: 'sku', label: 'SKU' }],
    });
    expect(
      resolveTableRows(schema, {
        data: { orders: [{ sku: 'A' }, { sku: 'B' }] },
      }),
    ).toEqual([['A'], ['B']]);
  });

  it('resolves array-of-arrays input', () => {
    const schema = tableSchema({
      path: 'rows',
      columns: [
        { path: '0', label: 'Column 1' },
        { path: '1', label: 'Column 2' },
      ],
    });
    expect(
      resolveTableRows(schema, {
        rows: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      }),
    ).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('getTableColumns', () => {
  it('prefers binding.columns when present', () => {
    const schema: Schema = {
      name: 'items',
      type: 'table',
      content: '',
      position: { x: 0, y: 0 },
      width: 100,
      height: 20,
      binding: {
        path: 'items',
        columns: [{ path: 'sku', label: 'SKU' }],
      },
    };
    const cols = getTableColumns(schema, [{ sku: 'A', price: 1 }]);
    expect(cols.map((c) => c.path)).toEqual(['sku']);
  });

  it('infers from value when binding.columns is missing', () => {
    const schema: Schema = {
      name: 'items',
      type: 'table',
      content: '',
      position: { x: 0, y: 0 },
      width: 100,
      height: 20,
    };
    const cols = getTableColumns(schema, [{ sku: 'A', price: 1 }]);
    expect(cols.map((c) => c.path)).toEqual(['sku', 'price']);
  });
});
