import { describe, expect, it } from 'vitest';
import { BLANK_A4_PDF, getTableBindingPreview } from '@pdfweave/common';
import { createSingleTable } from '../src/tables/tableHelper.js';
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
