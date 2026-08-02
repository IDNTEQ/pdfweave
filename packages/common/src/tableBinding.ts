/**
 * Table binding — single source of truth for table column inference,
 * width rebalancing, row resolution, and preview formatting.
 *
 * Two call sites used to host overlapping copies of this logic:
 *
 *  1. `packages/ui/.../DetailView/BindingWidget.tsx` — the editor's
 *     "add from data" affordance. When a user binds a table to a JSON
 *     path it computes initial column widths from sample data, rebalances
 *     when columns are added/removed/reordered, and renders a preview.
 *
 *  2. `packages/common/src/dataBinding.ts` — the runtime preview / value
 *     resolver. Computes per-row binding values when a template is
 *     hydrated with real input data (used by `resolveSchemaValue`).
 *
 * Both used the same input shape (template + sample data) but encoded
 * column inference twice. The duplicates produced subtle drift, so they
 * are unified here. Behavioural differences encountered during the
 * extraction and the choice made:
 *
 *  - Object-row column inference: both implementations used the first
 *    record's keys with even distribution and last-column adjustment so
 *    the percentages sum to 100. Identical, kept verbatim.
 *
 *  - Array-of-arrays inference: `BindingWidget` supported "the first row
 *    is an array, generate Column 1..N" — `dataBinding` did not. We adopt
 *    the more permissive `BindingWidget` behaviour: tables bound to an
 *    array-of-arrays produce numbered columns instead of a single Value
 *    column.
 *
 *  - Empty / non-array input: `dataBinding.createColumns` returned a
 *    single `{ path: '', label: 'Value', widthPercentage: 100 }` fallback.
 *    `BindingWidget.inferColumnsFromSample` returned `[]` and re-derived
 *    the same fallback at the call site. We expose a single `fallbackColumns()`
 *    helper and return it from `inferColumnWidths` / `inferColumns` callers
 *    for the empty case.
 *
 *  - Title casing for object keys: both files had near-duplicate
 *    `titleFromPath` helpers. `dataBinding`'s version is more robust
 *    (handles `[N]` indices, collapses whitespace) so it is the one we
 *    keep. The result is used unchanged for object-key columns.
 *
 *  - Width coercion: `BindingWidget` clamped widths into `[1, 100]`
 *    via `coerceWidthPercentage`. `dataBinding` only ever computed widths
 *    via even distribution (always positive). Both behaviours are kept:
 *    `inferColumnWidths` produces the even distribution; `rebalanceColumnWidths`
 *    keeps each width inside `[1, 100]` and renormalises to sum to 100.
 */

import type { DesignDataField, Schema, SchemaBinding, SchemaBindingColumn } from './types.js';
import { formatDesignDataValue, getValueByPath } from './dataBinding.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const titleFromPath = (path: string): string => {
  const last = path.split('.').pop() || path;
  return last
    .replaceAll(/\[(\d+)\]/g, ' $1')
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
};

const round4 = (value: number): number => Number(value.toFixed(4));

/**
 * The single-column fallback. Returned when there's no data to infer
 * columns from. Both former call sites used the same shape.
 */
export const fallbackColumns = (): SchemaBindingColumn[] => [
  { path: '', label: 'Value', widthPercentage: 100 },
];

/**
 * Even-distribution column widths summing to 100 (with the last entry
 * adjusted to absorb the rounding remainder). Returns one entry per
 * column. If `count <= 0`, returns `[100]` for parity with the previous
 * "single Value column" fallback.
 */
export const inferColumnWidths = (count: number): number[] => {
  if (!Number.isFinite(count) || count <= 0) return [100];
  if (count === 1) return [100];
  const width = round4(100 / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? round4(100 - width * (count - 1)) : width,
  );
};

/**
 * Coerce a possibly-broken width value into `[1, 100]` with at most 4
 * decimals. Returns `undefined` if the value isn't a finite number.
 */
export const coerceWidthPercentage = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return round4(Math.min(100, Math.max(1, value)));
};

/**
 * Given a column array (some of which may be missing widths), normalise
 * to an array of finite percentages that sums to 100. Used as a
 * preprocessing step by `rebalanceColumnWidths` and to expose
 * `headWidthPercentages` for table schemas.
 */
export const widthPercentages = (columns: SchemaBindingColumn[]): number[] => {
  if (columns.length === 0) return [100];

  const explicitWidths = columns.map((column) => coerceWidthPercentage(column.widthPercentage));
  const explicitTotal = explicitWidths.reduce<number>(
    (sum, width) => sum + (typeof width === 'number' ? width : 0),
    0,
  );
  const missingCount = explicitWidths.filter((width) => typeof width !== 'number').length;
  const fallbackWidth =
    missingCount > 0
      ? explicitTotal < 100
        ? (100 - explicitTotal) / missingCount
        : 100 / columns.length
      : 0;
  const widths = explicitWidths.map((width) => (typeof width === 'number' ? width : fallbackWidth));
  const total = widths.reduce((sum, width) => sum + width, 0);
  const adjustedWidths =
    total > 100
      ? widths.map((width) => (width / total) * 100)
      : missingCount === 0 && total < 100
        ? widths.map((width, index) =>
            index === widths.length - 1 ? width + (100 - total) : width,
          )
        : widths;
  let assigned = 0;

  return adjustedWidths.map((width, index) => {
    const isLast = index === adjustedWidths.length - 1;
    if (isLast) return round4(100 - assigned);
    assigned += width;
    return round4(width);
  });
};

/**
 * Apply normalised widths back onto a column array. Returns a new array
 * (does not mutate input).
 */
export const normalizeColumnWidths = (columns: SchemaBindingColumn[]): SchemaBindingColumn[] => {
  const widths = widthPercentages(columns);
  return columns.map((column, index) => ({
    ...column,
    widthPercentage: widths[index],
  }));
};

const MIN_REENABLED_COLUMN_WIDTH = 12;
const MAX_REENABLED_COLUMN_WIDTH = 45;

/**
 * Operations on a column array that need width rebalancing.
 *
 *   { kind: 'add',     column, atIndex? }     — append/insert a column
 *   { kind: 'remove',  atIndex }              — remove a column
 *   { kind: 'reorder', from,    to }          — move a column
 *   { kind: 'edit',    atIndex, widthPercentage } — change a single width
 */
export type ColumnOperation =
  | { kind: 'add'; column: SchemaBindingColumn; atIndex?: number }
  | { kind: 'remove'; atIndex: number }
  | { kind: 'reorder'; from: number; to: number }
  | { kind: 'edit'; atIndex: number; widthPercentage: number | undefined };

/**
 * Rebalance widths after a structural column change. Preserves relative
 * widths of unchanged columns wherever possible, and always returns a
 * result that sums to 100.
 *
 * The behaviour matches the editor's previous logic:
 *  - `add` clamps the new column to `[MIN, MAX]` (12..45) and shrinks the
 *    others proportionally to fit.
 *  - `remove` proportionally redistributes the removed width.
 *  - `reorder` is a pure permutation (no width math).
 *  - `edit` clamps the requested width into `[1, 100 - (n-1)]` and
 *    redistributes the remainder proportionally over the others.
 */
export const rebalanceColumnWidths = (
  columns: SchemaBindingColumn[],
  operation: ColumnOperation,
): SchemaBindingColumn[] => {
  switch (operation.kind) {
    case 'add': {
      return appendColumnWithBalancedWidth(columns, operation.column, operation.atIndex);
    }
    case 'remove': {
      return removeColumnWithRebalance(columns, operation.atIndex);
    }
    case 'reorder': {
      return reorderColumns(columns, operation.from, operation.to);
    }
    case 'edit': {
      return rebalanceEditedColumnWidth(columns, operation.atIndex, operation.widthPercentage);
    }
  }
};

const appendColumnWithBalancedWidth = (
  columns: SchemaBindingColumn[],
  columnToAdd: SchemaBindingColumn,
  atIndex?: number,
): SchemaBindingColumn[] => {
  if (columns.length === 0) return normalizeColumnWidths([{ ...columnToAdd }]);

  const nextColumnCount = columns.length + 1;
  const defaultWidth = Math.max(MIN_REENABLED_COLUMN_WIDTH, 100 / nextColumnCount);
  const requestedWidth = coerceWidthPercentage(columnToAdd.widthPercentage);
  const targetAddedWidth =
    typeof requestedWidth === 'number' && requestedWidth < 100
      ? Math.min(MAX_REENABLED_COLUMN_WIDTH, Math.max(MIN_REENABLED_COLUMN_WIDTH, requestedWidth))
      : defaultWidth;
  const currentWidths = widthPercentages(columns);
  const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0) || 100;
  const remainingWidth = Math.max(0, 100 - targetAddedWidth);
  const shrunk = columns.map((column, index) => ({
    ...column,
    widthPercentage: round4((currentWidths[index] / currentTotal) * remainingWidth),
  }));
  const inserted = { ...columnToAdd, widthPercentage: targetAddedWidth };

  if (typeof atIndex === 'number' && atIndex >= 0 && atIndex < shrunk.length) {
    const nextColumns = [...shrunk];
    nextColumns.splice(atIndex, 0, inserted);
    return normalizeColumnWidths(nextColumns);
  }

  return normalizeColumnWidths([...shrunk, inserted]);
};

const removeColumnWithRebalance = (
  columns: SchemaBindingColumn[],
  atIndex: number,
): SchemaBindingColumn[] => {
  if (atIndex < 0 || atIndex >= columns.length) return columns;
  const nextColumns = columns.filter((_, index) => index !== atIndex);
  if (nextColumns.length === 0) return [];
  return normalizeColumnWidths(nextColumns);
};

const reorderColumns = (
  columns: SchemaBindingColumn[],
  from: number,
  to: number,
): SchemaBindingColumn[] => {
  if (from < 0 || from >= columns.length) return columns;
  if (to < 0 || to >= columns.length) return columns;
  if (from === to) return columns;
  const nextColumns = [...columns];
  const [moved] = nextColumns.splice(from, 1);
  nextColumns.splice(to, 0, moved);
  return nextColumns;
};

const rebalanceEditedColumnWidth = (
  columns: SchemaBindingColumn[],
  editedIndex: number,
  requestedWidth: number | undefined,
): SchemaBindingColumn[] => {
  if (columns.length === 0) return [];
  if (columns.length === 1) return [{ ...columns[0], widthPercentage: 100 }];

  const normalizedColumns = normalizeColumnWidths(columns);
  const currentWidths = widthPercentages(normalizedColumns);
  const otherIndexes = normalizedColumns
    .map((_, index) => index)
    .filter((index) => index !== editedIndex);
  const maxEditedWidth = Math.max(1, 100 - otherIndexes.length);
  const editedWidth = Math.min(maxEditedWidth, requestedWidth ?? 100 / normalizedColumns.length);
  const remainingWidth = 100 - editedWidth;
  const otherTotal = otherIndexes.reduce((sum, index) => sum + currentWidths[index], 0) || 1;
  let assignedOtherWidth = 0;

  return normalizedColumns.map((column, index) => {
    if (index === editedIndex) return { ...column, widthPercentage: editedWidth };

    const isLastOther = index === otherIndexes.at(-1);
    const width = isLastOther
      ? round4(remainingWidth - assignedOtherWidth)
      : round4((currentWidths[index] / otherTotal) * remainingWidth);
    assignedOtherWidth += width;
    return { ...column, widthPercentage: width };
  });
};

/**
 * Infer columns (path + label + width) from sample data.
 *
 *  - `Record<string, DesignDataField>`: use the field metadata. Field
 *    labels override the auto-generated title.
 *  - First row is an object: use its keys as paths and titlecased keys
 *    as labels.
 *  - First row is an array (array-of-arrays): generate `Column 1..N`.
 *  - Otherwise: `fallbackColumns()`.
 */
export const inferColumns = (
  sample: unknown,
  itemFields?: Record<string, DesignDataField>,
): SchemaBindingColumn[] => {
  if (itemFields) {
    const entries = Object.entries(itemFields);
    if (entries.length === 0) return fallbackColumns();
    const widths = inferColumnWidths(entries.length);
    return entries.map(([path, field], index) => ({
      path,
      label: field.label || titleFromPath(path),
      format: field.format,
      widthPercentage: widths[index],
    }));
  }

  if (!Array.isArray(sample)) return fallbackColumns();

  const firstRecord = sample.find(isRecord);
  if (firstRecord) {
    const keys = Object.keys(firstRecord);
    if (keys.length === 0) return fallbackColumns();
    const widths = inferColumnWidths(keys.length);
    return keys.map((path, index) => ({
      path,
      label: titleFromPath(path),
      widthPercentage: widths[index],
    }));
  }

  const firstArray = sample.find(Array.isArray) as unknown[] | undefined;
  if (firstArray && firstArray.length > 0) {
    const widths = inferColumnWidths(firstArray.length);
    return firstArray.map((_, index) => ({
      path: String(index),
      label: `Column ${index + 1}`,
      widthPercentage: widths[index],
    }));
  }

  return fallbackColumns();
};

/**
 * Resolve a table schema's row data from the input JSON via the binding
 * path. Returns the raw cell values as a 2D array (string-stringified).
 *
 * If the binding path is missing, returns `[]`. Accepts JSON-encoded
 * arrays as well as native arrays.
 */
export const resolveTableRows = (schema: Schema, input: Record<string, unknown>): string[][] => {
  const binding = schema.binding as SchemaBinding | undefined;
  const value = binding?.path ? getValueByPath(input, binding.path) : undefined;
  const columns = getTableColumns(schema, value);
  return buildPreviewRows({ columns, sample: value });
};

/**
 * Build a preview row set when sample data is the source. The sample
 * may be:
 *  - a native 2D array
 *  - an array of records (mapped via `columns[i].path`)
 *  - a JSON-encoded version of either of the above
 *  - anything else, in which case `[]`.
 */
export const buildPreviewRows = (options: {
  columns: SchemaBindingColumn[];
  sample: unknown;
}): string[][] => {
  const { columns, sample } = options;
  const tableValue =
    typeof sample === 'string'
      ? (() => {
          try {
            return JSON.parse(sample) as unknown;
          } catch {
            return sample;
          }
        })()
      : sample;

  if (!Array.isArray(tableValue)) return [];

  return tableValue.map((row) => {
    if (Array.isArray(row)) {
      return row.map((cell, index) => formatDesignDataValue(cell, columns[index]?.format));
    }

    if (!isRecord(row)) {
      return [formatDesignDataValue(row)];
    }

    return columns.map((column) =>
      formatDesignDataValue(column.path ? getValueByPath(row, column.path) : row, column.format),
    );
  });
};

/**
 * Resolve the columns to use for a schema. Prefers `binding.columns`
 * when present, otherwise infers from the sample value.
 */
export const getTableColumns = (schema: Schema, value: unknown): SchemaBindingColumn[] => {
  const binding = schema.binding as SchemaBinding | undefined;
  if (binding?.columns?.length) return binding.columns;
  return inferColumns(Array.isArray(value) ? value : []);
};

/**
 * @deprecated Use `buildPreviewRows({ columns, sample })`.
 *
 * Retained as a thin alias only because public consumers (e.g.
 * downstream apps) may import `getTableBindingPreview` from
 * `@pdfweave/common`. Internal call sites use `buildPreviewRows`
 * directly.
 */
export const getTableBindingPreview = (
  value: unknown,
  columns: SchemaBindingColumn[],
): string[][] => buildPreviewRows({ columns, sample: value });

// Re-export shared helpers for callers that previously imported them
// alongside the old preview function.
export { titleFromPath };

// Re-export DataFormatHint convenience for column format coercion.
export type { DataFormatHint, SchemaBindingColumn } from './types.js';
