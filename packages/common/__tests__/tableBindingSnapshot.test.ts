/**
 * Snapshot baseline for table binding.
 *
 * Goal: protect against regressions in render output produced by the
 * two call sites that used to host their own copies of table column
 * inference, width rebalancing, and preview formatting (BindingWidget
 * in the editor + dataBinding at runtime). The committed JSON
 * baseline captures the resolved columns / preview rows for a small
 * but non-trivial set of templates and operations.
 *
 * If this baseline ever changes, table binding *behaviour* changed —
 * which (per the rules of the refactor that introduced this file)
 * should not happen without an intentional, reviewed update.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPreviewRows,
  getTableColumns,
  inferColumns,
  inferColumnWidths,
  rebalanceColumnWidths,
  resolveTableRows,
  widthPercentages,
} from '../src/tableBinding.js';
import type { Schema } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(__dirname, '__snapshots__', 'table-binding-baseline.json');

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const roundColumns = <T extends { widthPercentage?: number }>(columns: T[]): T[] =>
  columns.map((column) => ({
    ...column,
    widthPercentage:
      typeof column.widthPercentage === 'number' ? round(column.widthPercentage) : column.widthPercentage,
  }));

const objectRowsSample = [
  { sku: 'ENV-10', price: 0.82, qty: 100 },
  { sku: 'ENV-12', price: 1.05, qty: 250 },
];

const arrayRowsSample = [
  ['A', 1, true],
  ['B', 2, false],
];

const describedItemFields = {
  sku: { type: 'string', label: 'SKU' },
  price: {
    type: 'number',
    label: 'Price',
    format: { kind: 'currency', currency: 'USD' as const },
  },
  qty: { type: 'number', label: 'Qty' },
};

const baseTableSchema: Schema = {
  name: 'items',
  type: 'table',
  content: '[]',
  position: { x: 0, y: 0 },
  width: 100,
  height: 20,
  binding: {
    path: 'orders',
    columns: [
      { path: 'sku', label: 'SKU', widthPercentage: 30 },
      {
        path: 'price',
        label: 'Price',
        widthPercentage: 40,
        format: { kind: 'currency', currency: 'USD' },
      },
      { path: 'qty', label: 'Qty', widthPercentage: 30 },
    ],
  },
};

describe('table binding snapshot baseline', () => {
  it('matches the committed baseline (table-binding-baseline.json)', () => {
    const initialInferred = inferColumns(objectRowsSample);
    const arrayInferred = inferColumns(arrayRowsSample);
    const fromMetadata = inferColumns(undefined, describedItemFields);

    // Width primitives over a representative range of column counts.
    const widthsByCount: Record<string, number[]> = {};
    for (const count of [1, 2, 3, 4, 5, 7, 10]) {
      widthsByCount[String(count)] = inferColumnWidths(count);
    }

    // Rebalance round-trip: add → remove → reorder → edit.
    const after_add = rebalanceColumnWidths(initialInferred, {
      kind: 'add',
      column: { path: 'discount', label: 'Discount' },
    });
    const after_reorder = rebalanceColumnWidths(after_add, {
      kind: 'reorder',
      from: 0,
      to: 2,
    });
    const after_edit = rebalanceColumnWidths(after_reorder, {
      kind: 'edit',
      atIndex: 0,
      widthPercentage: 60,
    });
    const after_remove = rebalanceColumnWidths(after_edit, {
      kind: 'remove',
      atIndex: 3,
    });

    // Preview rows for representative input shapes.
    const recordPreview = buildPreviewRows({
      columns: baseTableSchema.binding!.columns!,
      sample: objectRowsSample,
    });
    const arrayPreview = buildPreviewRows({
      columns: baseTableSchema.binding!.columns!,
      sample: [
        ['ENV-10', 0.82, 100],
        ['ENV-12', 1.05, 250],
      ],
    });
    const jsonStringPreview = buildPreviewRows({
      columns: baseTableSchema.binding!.columns!,
      sample: JSON.stringify(objectRowsSample),
    });
    const emptyPreview = buildPreviewRows({
      columns: baseTableSchema.binding!.columns!,
      sample: undefined,
    });

    // Runtime row resolution.
    const runtimeRows_simple = resolveTableRows(baseTableSchema, {
      orders: objectRowsSample,
    });
    const runtimeRows_missing = resolveTableRows(baseTableSchema, { other: [] });
    const runtimeRows_nested = resolveTableRows(
      {
        ...baseTableSchema,
        binding: { ...baseTableSchema.binding!, path: 'data.orders' },
      },
      { data: { orders: objectRowsSample } },
    );

    // Column-resolution for binding/no-binding cases.
    const columns_explicit = getTableColumns(baseTableSchema, []);
    const columns_inferred = getTableColumns(
      {
        ...baseTableSchema,
        binding: { path: 'orders' },
      },
      objectRowsSample,
    );

    const actual = {
      inferColumns: {
        objectRows: roundColumns(initialInferred),
        arrayRows: roundColumns(arrayInferred),
        fromMetadata: roundColumns(fromMetadata),
      },
      inferColumnWidths: widthsByCount,
      rebalance: {
        after_add: roundColumns(after_add),
        after_reorder: roundColumns(after_reorder),
        after_edit: roundColumns(after_edit),
        after_remove: roundColumns(after_remove),
      },
      buildPreviewRows: {
        record: recordPreview,
        array: arrayPreview,
        jsonString: jsonStringPreview,
        empty: emptyPreview,
      },
      resolveTableRows: {
        simple: runtimeRows_simple,
        missing: runtimeRows_missing,
        nested: runtimeRows_nested,
      },
      getTableColumns: {
        explicit: roundColumns(columns_explicit),
        inferred: roundColumns(columns_inferred),
      },
      widthPercentages: {
        // Column widths summing to 100.
        balanced: widthPercentages([
          { path: 'a', widthPercentage: 25 },
          { path: 'b', widthPercentage: 25 },
          { path: 'c', widthPercentage: 50 },
        ]),
        // Total > 100 — must renormalise.
        over: widthPercentages([
          { path: 'a', widthPercentage: 80 },
          { path: 'b', widthPercentage: 80 },
        ]),
        // Missing widths backfilled from remainder.
        missing: widthPercentages([
          { path: 'a', widthPercentage: 40 },
          { path: 'b' },
          { path: 'c' },
        ]),
      },
    };

    if (!existsSync(baselinePath) && process.env.WRITE_TABLE_BINDING_BASELINE === '1') {
      mkdirSync(path.dirname(baselinePath), { recursive: true });
      writeFileSync(baselinePath, JSON.stringify(actual, null, 2) + '\n');
    }
    const expected: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(actual).toEqual(expected);
  });
});
