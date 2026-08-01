import { PDFDocument, degrees } from '@pdfweave/pdf-lib';
import { MM_TO_PT, PAPER_SIZES_MM, planImposition, type ImposeProps } from '../src/index.js';
import { normalizeOptions } from '../src/paperSizes.js';
import { createSourcePdf } from './helpers.js';

const createPages = (count: number, width = 40, height = 80) =>
  createSourcePdf(
    Array.from({ length: count }, (_, index) => ({ width, height, label: `P${index}` })),
  );

describe('planImposition', () => {
  test('exposes immutable named paper-size presets', () => {
    expect(Object.isFrozen(PAPER_SIZES_MM)).toBe(true);
    expect(Object.values(PAPER_SIZES_MM).every((size) => Object.isFrozen(size))).toBe(true);
  });

  test('calculates exact top-to-bottom cells with asymmetric margins and gutters', async () => {
    const source = await createPages(4);
    const plan = await planImposition({
      source,
      unit: 'pt',
      sheet: {
        size: { width: 220, height: 320 },
        margins: { top: 10, right: 20, bottom: 30, left: 40 },
        gutter: { horizontal: 10, vertical: 20 },
      },
      layout: { type: 'n-up', rows: 2, columns: 2, allowUpscale: true },
      sourceBox: 'media',
    });

    expect(plan).toMatchObject({
      version: 1,
      sourcePageCount: 4,
      selectedPageCount: 4,
      placementCount: 4,
      capacity: 4,
      sheetCount: 1,
      warnings: [],
    });
    expect(
      plan.sheets[0].front.placements.map(({ row, column, cell }) => ({ row, column, cell })),
    ).toEqual([
      { row: 0, column: 0, cell: { x: 40, y: 180, width: 75, height: 130 } },
      { row: 0, column: 1, cell: { x: 125, y: 180, width: 75, height: 130 } },
      { row: 1, column: 0, cell: { x: 40, y: 30, width: 75, height: 130 } },
      { row: 1, column: 1, cell: { x: 125, y: 30, width: 75, height: 130 } },
    ]);
    expect(plan.sheets[0].front.placements[0]).toMatchObject({
      scale: 1.625,
      content: { x: 45, y: 180, width: 65, height: 130 },
    });
  });

  test('supports column-major ordering and exposes all slots on a partial final sheet', async () => {
    const plan = await planImposition({
      source: await createPages(5),
      unit: 'pt',
      sheet: { size: { width: 200, height: 300 } },
      layout: { type: 'n-up', rows: 2, columns: 2, fill: 'column-major' },
      sourceBox: 'media',
    });

    expect(plan.sheetCount).toBe(2);
    expect(plan.sheets[0].front.placements.map(({ row, column }) => [row, column])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(plan.sheets[1].front.placements).toHaveLength(1);
    expect(
      plan.sheets[1].front.emptySlots.map(({ slotIndex, row, column }) => ({
        slotIndex,
        row,
        column,
      })),
    ).toEqual([
      { slotIndex: 1, row: 1, column: 0 },
      { slotIndex: 2, row: 0, column: 1 },
      { slotIndex: 3, row: 1, column: 1 },
    ]);
  });

  test('expands collated and uncollated copies without mutating caller options', async () => {
    const source = await createPages(3);
    const pages = [2, 0, 1];
    const sheet = { size: { width: 200, height: 100 }, margins: 4 };
    const base: Omit<ImposeProps, 'sequence'> = {
      source,
      unit: 'pt',
      sheet,
      layout: { type: 'n-up', rows: 1, columns: 6 },
      sourceBox: 'media',
      pages,
    };

    const collated = await planImposition({
      ...base,
      sequence: { copies: 2, collation: 'collated' },
    });
    const uncollated = await planImposition({
      ...base,
      sequence: { copies: 2, collation: 'uncollated' },
    });

    const sequence = (plan: typeof collated) =>
      plan.sheets.flatMap(({ front }) =>
        front.placements.map(({ sourcePageIndex, copyIndex }) => [sourcePageIndex, copyIndex]),
      );
    expect(sequence(collated)).toEqual([
      [2, 0],
      [0, 0],
      [1, 0],
      [2, 1],
      [0, 1],
      [1, 1],
    ]);
    expect(sequence(uncollated)).toEqual([
      [2, 0],
      [2, 1],
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(pages).toEqual([2, 0, 1]);
    expect(sheet).toEqual({ size: { width: 200, height: 100 }, margins: 4 });
  });

  test('selects a strictly better auto-rotation and keeps ties unrotated', async () => {
    const source = await createPages(2, 100, 200);
    const rotated = await planImposition({
      source,
      unit: 'pt',
      sheet: { size: { width: 200, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1, autoRotate: true, allowUpscale: true },
      sourceBox: 'media',
      pages: [0],
    });
    const tie = await planImposition({
      source,
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1, autoRotate: true, allowUpscale: true },
      sourceBox: 'media',
      pages: [1],
    });

    expect(rotated.sheets[0].front.placements[0]).toMatchObject({
      intrinsicRotation: 0,
      rotation: 90,
      scale: 1,
      content: { x: 0, y: 0, width: 200, height: 100 },
    });
    expect(tie.sheets[0].front.placements[0]).toMatchObject({ rotation: 0, scale: 0.5 });
  });

  test('keeps point dimensions at scale one and honors right/top alignment in none mode', async () => {
    const plan = await planImposition({
      source: await createPages(1, 120, 80),
      unit: 'pt',
      sheet: { size: { width: 100, height: 60 } },
      layout: {
        type: 'n-up',
        rows: 1,
        columns: 1,
        scale: 'none',
        align: { horizontal: 'right', vertical: 'top' },
      },
      sourceBox: 'media',
    });

    expect(plan.sheets[0].front.placements[0]).toMatchObject({
      scale: 1,
      cell: { x: 0, y: 0, width: 100, height: 60 },
      content: { x: -20, y: -20, width: 120, height: 80 },
    });
  });

  test('positions unscaled content for every horizontal and vertical alignment', async () => {
    const source = await createPages(1, 20, 10);
    const horizontalPositions = { left: 10, center: 40, right: 70 } as const;
    const verticalPositions = { bottom: 10, middle: 25, top: 40 } as const;

    for (const [horizontal, x] of Object.entries(horizontalPositions)) {
      for (const [vertical, y] of Object.entries(verticalPositions)) {
        const plan = await planImposition({
          source,
          unit: 'pt',
          sheet: { size: { width: 100, height: 60 }, margins: 10 },
          layout: {
            type: 'n-up',
            rows: 1,
            columns: 1,
            scale: 'none',
            align: {
              horizontal: horizontal as keyof typeof horizontalPositions,
              vertical: vertical as keyof typeof verticalPositions,
            },
          },
          sourceBox: 'media',
        });

        expect(plan.sheets[0].front.placements[0].content).toEqual({
          x,
          y,
          width: 20,
          height: 10,
        });
      }
    }
  });

  test('caps contain scaling unless allowUpscale is enabled', async () => {
    const source = await createPages(1, 20, 10);
    const props: ImposeProps = {
      source,
      unit: 'pt',
      sheet: { size: { width: 100, height: 60 }, margins: 10 },
      layout: { type: 'n-up', rows: 1, columns: 1, scale: 'contain' },
      sourceBox: 'media',
    };

    const capped = await planImposition(props);
    const enlarged = await planImposition({
      ...props,
      layout: { ...props.layout, allowUpscale: true },
    });

    expect(capped.sheets[0].front.placements[0]).toMatchObject({
      scale: 1,
      content: { x: 40, y: 25, width: 20, height: 10 },
    });
    expect(enlarged.sheets[0].front.placements[0]).toMatchObject({
      scale: 4,
      content: { x: 10, y: 10, width: 80, height: 40 },
    });
  });

  test('normalizes negative intrinsic rotations and returns deterministic plans', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([100, 200]);
    page.drawRectangle({ x: 0, y: 0, width: 100, height: 200 });
    page.setRotation(degrees(-90));
    const source = await sourceDocument.save();
    const props: ImposeProps = {
      source,
      unit: 'pt',
      sheet: { size: { width: 220, height: 120 }, margins: 10 },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    };
    const first = await planImposition(props);
    const second = await planImposition(props);

    expect(first).toEqual(second);
    expect(first.sheets[0].front.placements[0]).toMatchObject({
      intrinsicRotation: 270,
      rotation: 270,
      content: { x: 10, y: 10, width: 200, height: 100 },
    });
  });

  test.each([
    ['A2', 'portrait', 420, 594],
    ['A3', 'landscape', 420, 297],
    ['A4', 'portrait', 210, 297],
    ['A5', 'landscape', 210, 148],
    ['A6', 'portrait', 105, 148],
    ['Letter', 'landscape', 279.4, 215.9],
    ['Legal', 'portrait', 215.9, 355.6],
  ] as const)(
    'normalizes %s %s physical sheet dimensions',
    async (size, orientation, width, height) => {
      const plan = await planImposition({
        source: await createPages(1),
        sheet: { size, orientation },
        layout: { type: 'n-up', rows: 1, columns: 1 },
        sourceBox: 'media',
      });

      expect(plan.options.sheet.width).toBeCloseTo(width * MM_TO_PT, 8);
      expect(plan.options.sheet.height).toBeCloseTo(height * MM_TO_PT, 8);
    },
  );

  test('normalizes a custom millimeter sheet and applies its requested orientation', async () => {
    const plan = await planImposition({
      source: await createPages(1),
      unit: 'mm',
      sheet: { size: { width: 240, height: 180 }, orientation: 'portrait' },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    });

    expect(plan.options.sheet).toMatchObject({ name: 'custom', orientation: 'portrait' });
    expect(plan.options.sheet.width).toBeCloseTo(180 * MM_TO_PT, 8);
    expect(plan.options.sheet.height).toBeCloseTo(240 * MM_TO_PT, 8);
  });

  test.each([
    ['negative', -1],
    ['fractional', 0.5],
    ['NaN', Number.NaN],
    ['undefined', undefined as unknown as number],
  ])('rejects %s page indices at the internal normalization boundary', (_label, pageIndex) => {
    const props: ImposeProps = {
      source: new Uint8Array(),
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
      pages: [pageIndex],
    };

    expect(() => normalizeOptions(props, 1)).toThrow(
      `[@pdfweave/imposition] Invalid pages: page index ${String(pageIndex)} is outside the source page range 0-0`,
    );
  });

  test.each([
    {
      name: 'multiple non-union fields in first-error order',
      mutate: (props: ImposeProps) => ({
        ...props,
        unit: 'px' as ImposeProps['unit'],
        layout: { type: 'n-up' as const, rows: 0, columns: 1 },
      }),
      message: 'Invalid unit: expected "mm" or "pt"',
    },
    {
      name: 'out-of-range page',
      mutate: (props: ImposeProps) => ({ ...props, pages: [2] }),
      message: 'Invalid pages: page index 2 is outside the source page range 0-0',
    },
    {
      name: 'negative page at the public schema boundary',
      mutate: (props: ImposeProps) => ({ ...props, pages: [-1] }),
      message: 'Invalid pages.0: expected a non-negative integer',
    },
    {
      name: 'negative custom sheet width',
      mutate: (props: ImposeProps) => ({
        ...props,
        sheet: { size: { width: -1, height: 100 } },
      }),
      message: 'Invalid sheet.size.width: expected a finite number greater than 0',
    },
    {
      name: 'invalid custom sheet width type',
      mutate: (props: ImposeProps) => ({
        ...props,
        sheet: {
          size: { width: 'wide' as unknown as number, height: 100 },
        },
      }),
      message: 'Invalid sheet.size.width: expected a finite number greater than 0',
    },
    {
      name: 'invalid source value',
      mutate: (props: ImposeProps) => ({
        ...props,
        source: 'not PDF bytes' as unknown as Uint8Array,
      }),
      message: 'Invalid source: expected an ArrayBuffer or Uint8Array',
    },
    {
      name: 'impossible gutters',
      mutate: (props: ImposeProps) => ({
        ...props,
        sheet: { size: { width: 100, height: 100 }, gutter: 101 },
        layout: { type: 'n-up' as const, rows: 1, columns: 2 },
      }),
      message: 'Invalid sheet: horizontal margins and gutters leave no printable width',
    },
    {
      name: 'non-positive cells in unscaled rendering',
      mutate: (props: ImposeProps) => ({
        ...props,
        sheet: { size: { width: 100, height: 100 }, gutter: 101 },
        layout: { type: 'n-up' as const, rows: 1, columns: 2, scale: 'none' as const },
      }),
      message: 'Invalid sheet: horizontal margins and gutters leave no printable width',
    },
    {
      name: 'placement limit',
      mutate: (props: ImposeProps) => ({
        ...props,
        pages: [0, 0, 0],
        limits: { maxPlacements: 2 },
      }),
      message: 'Placement count 3 exceeds limit 2',
    },
    {
      name: 'sheet limit',
      mutate: (props: ImposeProps) => ({
        ...props,
        pages: [0, 0],
        limits: { maxSheets: 1 },
      }),
      message: 'Sheet count 2 exceeds limit 1',
    },
    {
      name: 'excessive grid capacity',
      mutate: (props: ImposeProps) => ({
        ...props,
        sheet: { size: { width: 1000, height: 1000 } },
        layout: { type: 'n-up' as const, rows: 101, columns: 1000 },
      }),
      message: 'Invalid layout: rows * columns must not exceed 100,000',
    },
    {
      name: 'overflowing normalized dimensions',
      mutate: (props: ImposeProps) => ({
        ...props,
        unit: 'mm' as const,
        sheet: { size: { width: Number.MAX_VALUE, height: 100 } },
      }),
      message: 'Invalid sheet.size: normalized dimensions must be between 0.01 and 14400 points',
    },
    {
      name: 'overflowing normalized margins',
      mutate: (props: ImposeProps) => ({
        ...props,
        unit: 'mm' as const,
        sheet: { size: { width: 100, height: 100 }, margins: Number.MAX_VALUE },
      }),
      message: 'Invalid sheet: normalized margins and gutters must be finite',
    },
  ])('rejects $name with a stable package error', async ({ mutate, message }) => {
    const base: ImposeProps = {
      source: await createPages(1),
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    };
    await expect(planImposition(mutate(base))).rejects.toThrow(`[@pdfweave/imposition] ${message}`);
  });
});
