import { describe, expect, it } from 'vitest';
import {
  BLANK_A4_PDF,
  getDynamicTemplate,
  getTableBindingPreview,
  type Template,
} from '@pdfweave/common';
import { createSingleTable } from '../src/tables/tableHelper.js';
import { getBody } from '../src/tables/helper.js';
import { getDynamicHeightsForTable } from '../src/tables.js';
import type { TableSchema } from '../src/tables/types.js';

const baseTableSchema = (): TableSchema => ({
  name: 'items',
  type: 'table',
  position: { x: 0, y: 0 },
  width: 150,
  height: 20,
  showHead: true,
  head: ['SKU', 'Price'],
  headWidthPercentages: [50, 50],
  tableStyles: { borderColor: '#000000', borderWidth: 0.3 },
  headStyles: {
    fontName: undefined,
    alignment: 'left',
    verticalAlignment: 'middle',
    fontSize: 10,
    lineHeight: 1,
    characterSpacing: 0,
    fontColor: '#ffffff',
    backgroundColor: '#2980ba',
    borderColor: '#000000',
    borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  bodyStyles: {
    fontName: undefined,
    alignment: 'left',
    verticalAlignment: 'middle',
    fontSize: 10,
    lineHeight: 1,
    characterSpacing: 0,
    fontColor: '#000000',
    backgroundColor: '',
    alternateBackgroundColor: '#f5f5f5',
    borderColor: '#000000',
    borderWidth: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
    padding: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  columnStyles: {},
});

describe('table styling × binding composition', () => {
  it('applies row + cell style overrides on top of binding-derived body data', async () => {
    // Simulate PDFweave binding: data is shaped as objects + columns; binding produces string[][].
    const sampleData = [
      { sku: 'ENV-10', price: 0.82 },
      { sku: 'ENV-20', price: 1.5 },
      { sku: 'ENV-30', price: 2.4 },
    ];
    const bindingColumns = [
      { path: 'sku', label: 'SKU' },
      { path: 'price', label: 'Price', format: { kind: 'currency' as const, currency: 'USD' } },
    ];
    const body = getTableBindingPreview(sampleData, bindingColumns);

    expect(body).toEqual([
      ['ENV-10', '$0.82'],
      ['ENV-20', '$1.50'],
      ['ENV-30', '$2.40'],
    ]);

    const schema = baseTableSchema();
    schema.rowStyles = {
      // Row 1: red background for the entire row.
      1: {
        backgroundColor: '#ff0000',
        // Cell-level override on the price column of the same row.
        cells: { 1: { textColor: '#00ff00', alignment: 'right' } },
      },
    };

    const table = await createSingleTable(body, {
      schema,
      basePdf: BLANK_A4_PDF,
      options: {},
      _cache: new Map(),
    });

    // Body data flows through unchanged from binding.
    expect(table.body).toHaveLength(3);
    expect(table.body[0].raw).toEqual(['ENV-10', '$0.82']);
    expect(table.body[1].raw).toEqual(['ENV-20', '$1.50']);
    expect(table.body[2].raw).toEqual(['ENV-30', '$2.40']);

    // Row 0 (alternate row) uses bodyStyles defaults — unchanged.
    expect(table.body[0].cells[0].styles.backgroundColor).toBe('#f5f5f5');

    // Row 1 picks up the row-level background override.
    expect(table.body[1].cells[0].styles.backgroundColor).toBe('#ff0000');
    expect(table.body[1].cells[0].styles.alignment).toBe('left'); // unchanged for col 0
    // Row 1, col 1 gets BOTH the row override (background) AND the cell override (textColor + alignment).
    expect(table.body[1].cells[1].styles.backgroundColor).toBe('#ff0000');
    expect(table.body[1].cells[1].styles.textColor).toBe('#00ff00');
    expect(table.body[1].cells[1].styles.alignment).toBe('right');

    // Row 2 falls back to alternate row styling.
    expect(table.body[2].cells[0].styles.backgroundColor).toBe('#f5f5f5');
  });

  it('honours columnStyles.alignment alongside per-row overrides', async () => {
    const schema = baseTableSchema();
    schema.columnStyles = { alignment: { 1: 'right' } };
    schema.rowStyles = {
      0: { backgroundColor: '#ffff00' },
    };

    const table = await createSingleTable(
      [
        ['ENV-10', '$0.82'],
        ['ENV-20', '$1.50'],
      ],
      { schema, basePdf: BLANK_A4_PDF, options: {}, _cache: new Map() },
    );

    // Column 1 alignment from columnStyles applies on every body row.
    expect(table.body[0].cells[1].styles.alignment).toBe('right');
    expect(table.body[1].cells[1].styles.alignment).toBe('right');

    // Row 0 background override coexists with the column alignment.
    expect(table.body[0].cells[0].styles.backgroundColor).toBe('#ffff00');
    expect(table.body[0].cells[1].styles.backgroundColor).toBe('#ffff00');
  });
});

describe('table cell padding (pdfme/pdfme#1422)', () => {
  it('subtracts horizontal padding from text-fit width so wrapped rows are tall enough', async () => {
    // A narrow table (width 60mm, two equal columns => ~30mm/cell) with heavy left/right
    // padding. With the bug, splitTextToSize is given the full cell width, so a long string
    // measures as fitting on a single line and the row stays at one-line height. With the
    // fix, the available text width drops to ~10mm and the string wraps to multiple lines,
    // increasing the row height.
    const schema = baseTableSchema();
    schema.width = 60;
    schema.headWidthPercentages = [50, 50];
    schema.bodyStyles.padding = { top: 2, right: 10, bottom: 2, left: 10 };
    schema.bodyStyles.fontSize = 12;
    schema.bodyStyles.lineHeight = 1;

    const longText = 'wrap-me-please-because-of-padding';

    const table = await createSingleTable([[longText, longText]], {
      schema,
      basePdf: BLANK_A4_PDF,
      options: {},
      _cache: new Map(),
    });

    const cell = table.body[0].cells[0];
    // With padding correctly applied, the long string must wrap to >1 line.
    expect(cell.text.length).toBeGreaterThan(1);
    // Row height must accommodate wrapped lines + vertical padding.
    const minHeight = cell.text.length * (12 / 2.8346) + 4; // pt2mm(fontSize)*lineHeight*lines + vPad
    expect(table.body[0].height).toBeGreaterThanOrEqual(minHeight - 0.5);
  });
});

describe('public table height measurement', () => {
  it('measures only the bounded rows when the first fragment starts at zero', async () => {
    const schema = baseTableSchema();
    schema.__bodyRange = { start: 0, end: 2 };
    const body = Array.from({ length: 5 }, (_, index) => [
      `Item ${String(index + 1)}`,
      `${String(index + 1)}.00`,
    ]);
    const args = {
      schema,
      basePdf: BLANK_A4_PDF,
      options: {},
      _cache: new Map<string | number, unknown>(),
    };

    const measuredHeights = await getDynamicHeightsForTable(JSON.stringify(body), args);

    expect(measuredHeights).toHaveLength(3);
  });

  it('retains continuation-header height accounting for direct callers', async () => {
    const schema = baseTableSchema();
    schema.position.y = 5;
    schema.width = 60;
    schema.repeatHead = true;
    const basePdf = {
      width: 100,
      height: 60,
      padding: [5, 5, 5, 5] as [number, number, number, number],
    };
    const body = Array.from({ length: 20 }, (_, index) => [`Item ${index + 1}`, `${index + 1}.00`]);
    const args = { schema, basePdf, options: {}, _cache: new Map<string | number, unknown>() };
    const table = await createSingleTable(body, args);
    const rawHeights = table.allRows().map((row) => row.height);
    const measuredHeights = await getDynamicHeightsForTable(JSON.stringify(body), args);
    const repeatedHeight =
      measuredHeights.reduce((sum, height) => sum + height, 0) -
      rawHeights.reduce((sum, height) => sum + height, 0);

    expect(measuredHeights).toHaveLength(rawHeights.length);
    expect(repeatedHeight).toBeGreaterThan(0);
    expect(repeatedHeight / table.getHeadHeight()).toBeCloseTo(
      Math.round(repeatedHeight / table.getHeadHeight()),
      8,
    );
  });

  it('composes with the legacy dynamic-template callback without repeating page headers twice', async () => {
    const schema = baseTableSchema();
    schema.position.y = 5;
    schema.width = 60;
    schema.repeatHead = true;
    const basePdf = {
      width: 100,
      height: 60,
      padding: [5, 5, 5, 5] as [number, number, number, number],
    };
    const body = Array.from({ length: 20 }, (_, index) => [`Item ${index + 1}`, `${index + 1}.00`]);
    const value = JSON.stringify(body);
    const template: Template = { basePdf, schemas: [[schema]] };
    const args = { schema, basePdf, options: {}, _cache: new Map<string | number, unknown>() };
    const measuredHeights = await getDynamicHeightsForTable(value, args);

    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { items: value },
      options: {},
      _cache: new Map(),
      getDynamicHeights: getDynamicHeightsForTable,
    });
    const fragments = dynamicTemplate.schemas.flat().filter(({ name }) => name === schema.name);
    const ranges = fragments.map(({ __bodyRange }) => __bodyRange);

    expect(ranges[0]).toMatchObject({ start: 0 });
    expect(ranges.at(-1)).toMatchObject({ end: body.length });
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.start).toBe(ranges[index - 1]?.end);
    }
    expect(fragments.reduce((sum, fragment) => sum + fragment.height, 0)).toBeCloseTo(
      measuredHeights.reduce((sum, height) => sum + height, 0),
      8,
    );
  });

  it('uses static footer bounds when composing the legacy callback with repeated headers', async () => {
    const schema = baseTableSchema();
    schema.position = { x: 10, y: 5 };
    schema.width = 60;
    schema.repeatHead = true;
    schema.headStyles.padding = { top: 2, right: 2, bottom: 2, left: 2 };
    schema.bodyStyles.padding = { top: 2, right: 2, bottom: 2, left: 2 };
    const basePdf = {
      width: 100,
      height: 100,
      padding: [5, 5, 5, 5] as [number, number, number, number],
      staticSchema: [
        {
          name: 'footer',
          type: 'text',
          content: 'page footer',
          position: { x: 10, y: 80 },
          width: 80,
          height: 15,
        },
      ],
    };
    const body = Array.from({ length: 18 }, (_, index) => [
      `Item ${String(index + 1)}`,
      `${String(index + 1)}.00`,
    ]);
    const value = JSON.stringify(body);
    const template: Template = { basePdf, schemas: [[schema]] };

    const dynamicTemplate = await getDynamicTemplate({
      template,
      input: { items: value },
      options: {},
      _cache: new Map(),
      getDynamicHeights: getDynamicHeightsForTable,
    });
    const fragments = dynamicTemplate.schemas.flat().filter(({ name }) => name === schema.name);

    expect(fragments.map(({ __bodyRange }) => __bodyRange)).toEqual([
      { start: 0, end: 8 },
      { start: 8, end: 16 },
      { start: 16, end: 18 },
    ]);
    for (const fragment of fragments) {
      expect(fragment.position.y + fragment.height).toBeLessThanOrEqual(80.01);
      const range = fragment.__bodyRange!;
      const rendered = await createSingleTable(body.slice(range.start, range.end), {
        schema: fragment as TableSchema,
        basePdf,
        options: {},
        _cache: new Map(),
      });
      const renderedHeight = rendered.allRows().reduce((sum, row) => sum + row.height, 0);
      expect(fragment.height).toBeCloseTo(renderedHeight, 8);
    }
  });
});

describe('table getBody recovery (pdfme/pdfme#1299)', () => {
  it('parses canonical JSON-string bodies as before', () => {
    expect(getBody('[["a","b"],["c","d"]]')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('returns the array as-is when already a string[][]', () => {
    expect(
      getBody([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('returns [] for empty/blank string', () => {
    expect(getBody('')).toEqual([]);
    expect(getBody('   ')).toEqual([]);
  });
  // The actual #1299 regression: replacePlaceholders evaluates {tableData}
  // against an array variable and concatenates via String(arr). For
  // [["a","b"],["c","d"]] that produces "a,b,c,d". Without the column-count
  // hint we have no way to know the row width, so the recovery emits a
  // single row. With the hint, we reshape into the expected rows.
  it('reshapes a comma-flattened string when given a column count', () => {
    expect(getBody('a,b,c,d', 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(getBody('a,b,c,d,e,f', 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });
  it('emits a single-row recovery when no column count fits', () => {
    expect(getBody('a,b,c')).toEqual([['a', 'b', 'c']]);
    // Mismatched column count falls through to single-row recovery.
    expect(getBody('a,b,c', 2)).toEqual([['a', 'b', 'c']]);
  });
  it('tolerates a single-row JSON array (string[]) by wrapping it', () => {
    expect(getBody('["a","b"]')).toEqual([['a', 'b']]);
  });

  it('normalizes numeric, boolean, null, and object cells from JSON', () => {
    expect(getBody('[[1,true,null,{"code":"A-1"}]]')).toEqual([
      ['1', 'true', '', '{"code":"A-1"}'],
    ]);
  });

  it('renders ragged rows without calling string methods on missing cells', async () => {
    const table = await createSingleTable([['complete', 'row'], ['missing']], {
      schema: baseTableSchema(),
      basePdf: BLANK_A4_PDF,
      options: {},
      _cache: new Map(),
    });

    expect(table.body[1].cells[0].raw).toBe('missing');
    expect(table.body[1].cells[1].raw).toBe('');
  });
});
