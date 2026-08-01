import { PDFDocument, StandardFonts, rgb } from '@pdfweave/pdf-lib';
import {
  impose,
  MM_TO_PT,
  type ImposeProps,
  type ImpositionPlan,
  type PaperSizeName,
  type Size,
} from '../../src/index.js';
import { createSourcePdf, pdfToImages, writeArtifacts } from '../helpers.js';

const mm = (value: number): number => value * MM_TO_PT;

interface CatalogEntry {
  label: string;
  pdf: Uint8Array;
}

const combineCatalog = async (entries: CatalogEntry[]): Promise<Uint8Array> => {
  const catalog = await PDFDocument.create({ updateMetadata: false });
  const font = await catalog.embedFont(StandardFonts.HelveticaBold);

  for (const entry of entries) {
    const source = await PDFDocument.load(entry.pdf);
    const copiedPages = await catalog.copyPages(source, source.getPageIndices());
    for (const copiedPage of copiedPages) {
      catalog.addPage(copiedPage);
      copiedPage.drawText(entry.label, {
        x: 10,
        y: copiedPage.getHeight() - 16,
        size: 8,
        font,
        color: rgb(0.08, 0.16, 0.2),
      });
    }
  }

  return catalog.save();
};

const writeCatalog = async (
  scenario: string,
  pdf: Uint8Array,
  manifest: Record<string, unknown>,
): Promise<void> => {
  const images = await pdfToImages(pdf);
  writeArtifacts(scenario, pdf, images, manifest);
  const document = await PDFDocument.load(pdf);

  expect(images).toHaveLength(document.getPageCount());
  for (const [index, image] of images.entries()) {
    expect(image.byteLength).toBeGreaterThan(1_500);
    await expect(image).toMatchImage({
      name: `${scenario}-page-${index + 1}`,
      allowedPixelRatio: 0.001,
      includeAA: false,
    });
  }
};

const placementSummary = (plan: ImpositionPlan) => ({
  sheet: plan.options.sheet,
  layout: plan.options.layout,
  placementCount: plan.placementCount,
  sheetCount: plan.sheetCount,
  sheets: plan.sheets,
  warnings: plan.warnings,
});

describe('imposition qualification artifacts', () => {
  test('renders every named paper preset and a custom millimeter sheet', async () => {
    const cases: Array<{
      label: string;
      size: PaperSizeName | Size;
      orientation: 'portrait' | 'landscape';
      expectedMm: Size;
    }> = [
      {
        label: 'A2 portrait | 420 x 594 mm',
        size: 'A2',
        orientation: 'portrait',
        expectedMm: { width: 420, height: 594 },
      },
      {
        label: 'A3 landscape | 420 x 297 mm',
        size: 'A3',
        orientation: 'landscape',
        expectedMm: { width: 420, height: 297 },
      },
      {
        label: 'A4 portrait | 210 x 297 mm',
        size: 'A4',
        orientation: 'portrait',
        expectedMm: { width: 210, height: 297 },
      },
      {
        label: 'A5 landscape | 210 x 148 mm',
        size: 'A5',
        orientation: 'landscape',
        expectedMm: { width: 210, height: 148 },
      },
      {
        label: 'A6 portrait | 105 x 148 mm',
        size: 'A6',
        orientation: 'portrait',
        expectedMm: { width: 105, height: 148 },
      },
      {
        label: 'Letter landscape | 279.4 x 215.9 mm',
        size: 'Letter',
        orientation: 'landscape',
        expectedMm: { width: 279.4, height: 215.9 },
      },
      {
        label: 'Legal portrait | 215.9 x 355.6 mm',
        size: 'Legal',
        orientation: 'portrait',
        expectedMm: { width: 215.9, height: 355.6 },
      },
      {
        label: 'Custom landscape | 240 x 180 mm',
        size: { width: 240, height: 180 },
        orientation: 'landscape',
        expectedMm: { width: 240, height: 180 },
      },
    ];
    const entries: CatalogEntry[] = [];
    const manifestCases: Array<Record<string, unknown>> = [];

    for (const item of cases) {
      const result = await impose({
        source: await createSourcePdf([{ width: 160, height: 100, label: item.label }]),
        unit: 'mm',
        sheet: { size: item.size, orientation: item.orientation, margins: 12 },
        layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
        sourceBox: 'media',
      });
      const output = await PDFDocument.load(result.pdf);
      const page = output.getPage(0);

      expect(page.getWidth()).toBeCloseTo(mm(item.expectedMm.width), 6);
      expect(page.getHeight()).toBeCloseTo(mm(item.expectedMm.height), 6);
      entries.push({ label: item.label, pdf: result.pdf });
      manifestCases.push({
        label: item.label,
        requestedSize: item.size,
        expectedMm: item.expectedMm,
        plan: placementSummary(result.plan),
      });
    }

    await writeCatalog('paper-size-catalog', await combineCatalog(entries), {
      scenario: 'paper-size-catalog',
      definition: 'Every named sheet preset plus a custom millimeter sheet',
      cases: manifestCases,
    });
  });

  test('renders contain, cover, none, alignment, upscale, and auto-rotation modes', async () => {
    const cases: Array<{ label: string; source: Size; props: Omit<ImposeProps, 'source'> }> = [
      {
        label: 'Contain centered | upscale capped',
        source: { width: 160, height: 60 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: { type: 'n-up', rows: 1, columns: 1, scale: 'contain', allowUpscale: false },
          sourceBox: 'media',
        },
      },
      {
        label: 'Contain centered | upscale enabled',
        source: { width: 160, height: 60 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: { type: 'n-up', rows: 1, columns: 1, scale: 'contain', allowUpscale: true },
          sourceBox: 'media',
        },
      },
      {
        label: 'Cover centered | cell clipping',
        source: { width: 200, height: 50 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: { type: 'n-up', rows: 1, columns: 1, scale: 'cover', allowUpscale: true },
          sourceBox: 'media',
        },
      },
      {
        label: 'None | right and top',
        source: { width: 160, height: 60 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: {
            type: 'n-up',
            rows: 1,
            columns: 1,
            scale: 'none',
            align: { horizontal: 'right', vertical: 'top' },
          },
          sourceBox: 'media',
        },
      },
      {
        label: 'None | left and bottom',
        source: { width: 160, height: 60 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: {
            type: 'n-up',
            rows: 1,
            columns: 1,
            scale: 'none',
            align: { horizontal: 'left', vertical: 'bottom' },
          },
          sourceBox: 'media',
        },
      },
      {
        label: 'Auto-rotation | portrait source on landscape sheet',
        source: { width: 100, height: 200 },
        props: {
          unit: 'pt',
          sheet: {
            size: { width: 320, height: 220 },
            margins: { top: 24, right: 20, bottom: 20, left: 20 },
          },
          layout: { type: 'n-up', rows: 1, columns: 1, autoRotate: true, allowUpscale: true },
          sourceBox: 'media',
        },
      },
    ];
    const entries: CatalogEntry[] = [];
    const manifestCases: Array<Record<string, unknown>> = [];

    for (const item of cases) {
      const result = await impose({
        source: await createSourcePdf([{ ...item.source, label: item.label }]),
        ...item.props,
      });
      const placement = result.plan.sheets[0].front.placements[0];
      entries.push({ label: item.label, pdf: result.pdf });
      manifestCases.push({ label: item.label, placement, plan: placementSummary(result.plan) });
    }

    expect(manifestCases.at(-1)?.placement).toMatchObject({ rotation: 90 });
    await writeCatalog('scale-alignment-catalog', await combineCatalog(entries), {
      scenario: 'scale-alignment-catalog',
      definition: 'Scaling, alignment, clipping, and auto-rotation modes',
      cases: manifestCases,
    });
  });

  test('renders every source page box and records a deterministic fallback warning', async () => {
    const sourceDocument = await PDFDocument.create({ updateMetadata: false });
    const page = sourceDocument.addPage([300, 400]);
    const font = await sourceDocument.embedFont(StandardFonts.HelveticaBold);
    page.setCropBox(20, 30, 260, 340);
    page.setBleedBox(30, 40, 240, 320);
    page.setTrimBox(40, 50, 220, 300);
    page.setArtBox(50, 60, 200, 280);
    const regions = [
      { label: 'MEDIA', x: 0, y: 0, width: 300, height: 400, color: rgb(0.92, 0.94, 0.95) },
      { label: 'CROP', x: 20, y: 30, width: 260, height: 340, color: rgb(0.78, 0.9, 0.88) },
      { label: 'BLEED', x: 30, y: 40, width: 240, height: 320, color: rgb(0.96, 0.88, 0.72) },
      { label: 'TRIM', x: 40, y: 50, width: 220, height: 300, color: rgb(0.9, 0.78, 0.8) },
      { label: 'ART', x: 50, y: 60, width: 200, height: 280, color: rgb(0.78, 0.84, 0.94) },
    ];
    for (const region of regions) {
      page.drawRectangle(region);
    }
    for (const region of regions) {
      page.drawText(region.label, {
        x: region.x + 6,
        y: region.y + region.height - 8,
        size: 9,
        font,
        color: rgb(0.08, 0.12, 0.16),
      });
    }
    const source = await sourceDocument.save();
    const entries: CatalogEntry[] = [];
    const manifestCases: Array<Record<string, unknown>> = [];

    for (const sourceBox of ['media', 'crop', 'bleed', 'trim', 'art'] as const) {
      const result = await impose({
        source,
        unit: 'pt',
        sheet: {
          size: { width: 320, height: 420 },
          margins: { top: 24, right: 10, bottom: 10, left: 10 },
        },
        layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
        sourceBox,
      });
      entries.push({ label: `Explicit ${sourceBox} box`, pdf: result.pdf });
      manifestCases.push({ sourceBox, plan: placementSummary(result.plan) });
    }

    const fallbackSourceDocument = await PDFDocument.create({ updateMetadata: false });
    const fallbackPage = fallbackSourceDocument.addPage([300, 400]);
    fallbackPage.setCropBox(20, 30, 260, 340);
    fallbackPage.drawRectangle({
      x: 20,
      y: 30,
      width: 260,
      height: 340,
      color: rgb(0.78, 0.9, 0.88),
    });
    const fallback = await impose({
      source: await fallbackSourceDocument.save(),
      unit: 'pt',
      sheet: {
        size: { width: 320, height: 420 },
        margins: { top: 24, right: 10, bottom: 10, left: 10 },
      },
      layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
      sourceBox: 'trim',
    });
    expect(fallback.warnings).toEqual([
      {
        code: 'page-box-fallback',
        sourcePageIndex: 0,
        message: 'Source page 0 has no trim box; using crop box',
      },
    ]);
    entries.push({ label: 'Trim requested | crop fallback', pdf: fallback.pdf });
    manifestCases.push({
      sourceBox: 'trim-fallback-to-crop',
      plan: placementSummary(fallback.plan),
    });

    await writeCatalog('source-box-catalog', await combineCatalog(entries), {
      scenario: 'source-box-catalog',
      definition: 'Media, crop, bleed, trim, art, and fallback behavior',
      cases: manifestCases,
    });
  });

  test('renders intrinsic rotations at 0, 90, 180, and 270 degrees', async () => {
    const result = await impose({
      source: await createSourcePdf([
        { width: 120, height: 80, label: 'ROTATION 0' },
        { width: 120, height: 80, label: 'ROTATION 90', rotation: 90 },
        { width: 120, height: 80, label: 'ROTATION 180', rotation: 180 },
        { width: 120, height: 80, label: 'ROTATION 270', rotation: 270 },
      ]),
      sheet: {
        size: 'A4',
        orientation: 'landscape',
        margins: { top: 12, right: 8, bottom: 8, left: 8 },
        gutter: 5,
      },
      layout: { type: 'n-up', rows: 2, columns: 2, allowUpscale: true },
      sourceBox: 'media',
    });
    const rotations = result.plan.sheets[0].front.placements.map(
      ({ intrinsicRotation }) => intrinsicRotation,
    );

    expect(rotations).toEqual([0, 90, 180, 270]);
    await writeCatalog('rotation-catalog', result.pdf, {
      scenario: 'rotation-catalog',
      definition: 'Intrinsic PDF page rotations rendered into n-up slots',
      plan: placementSummary(result.plan),
    });
  });

  test('renders row-major, column-major, collated, and uncollated page order', async () => {
    const source = await createSourcePdf(
      ['A', 'B', 'C', 'D'].map((label) => ({ width: 120, height: 80, label: `SOURCE ${label}` })),
    );
    const base: Omit<ImposeProps, 'source' | 'sequence'> = {
      unit: 'pt',
      sheet: {
        size: { width: 320, height: 240 },
        margins: { top: 24, right: 12, bottom: 12, left: 12 },
        gutter: 8,
      },
      layout: { type: 'n-up', rows: 2, columns: 2, allowUpscale: true },
      sourceBox: 'media',
    };
    const rowMajor = await impose({ source, ...base });
    const columnMajor = await impose({
      source,
      ...base,
      layout: { ...base.layout, fill: 'column-major' },
    });
    const collated = await impose({
      source,
      ...base,
      sequence: { copies: 2, collation: 'collated' },
    });
    const uncollated = await impose({
      source,
      ...base,
      sequence: { copies: 2, collation: 'uncollated' },
    });
    const sequence = (plan: ImpositionPlan): number[] =>
      plan.sheets.flatMap(({ front }) =>
        front.placements.map(({ sourcePageIndex }) => sourcePageIndex),
      );

    expect(sequence(rowMajor.plan)).toEqual([0, 1, 2, 3]);
    expect(
      columnMajor.plan.sheets[0].front.placements.map(({ sourcePageIndex, row, column }) => [
        sourcePageIndex,
        row,
        column,
      ]),
    ).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [2, 0, 1],
      [3, 1, 1],
    ]);
    expect(sequence(collated.plan)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(sequence(uncollated.plan)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);

    await writeCatalog(
      'ordering-catalog',
      await combineCatalog([
        { label: 'Row-major', pdf: rowMajor.pdf },
        { label: 'Column-major', pdf: columnMajor.pdf },
        { label: 'Collated copies', pdf: collated.pdf },
        { label: 'Uncollated copies', pdf: uncollated.pdf },
      ]),
      {
        scenario: 'ordering-catalog',
        definition: 'Fill order and copy collation sequences',
        cases: {
          rowMajor: placementSummary(rowMajor.plan),
          columnMajor: placementSummary(columnMajor.plan),
          collated: placementSummary(collated.plan),
          uncollated: placementSummary(uncollated.plan),
        },
      },
    );
  });
});
