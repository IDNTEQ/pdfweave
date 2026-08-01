import { runInNewContext } from 'node:vm';
import { vi } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFPage,
  PDFStream,
  PDFString,
  degrees,
  rgb,
} from '@pdfweave/pdf-lib';
import { impose, planImposition } from '../src/index.js';
import { addLinkAnnotation, createSourcePdf, pdfToImages } from './helpers.js';

const getFormXObjects = (document: PDFDocument): PDFStream[] =>
  document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFStream =>
        object instanceof PDFStream &&
        object.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'),
    );

const countFormXObjects = (document: PDFDocument): number => getFormXObjects(document).length;

type TestedPageBox = 'crop' | 'trim' | 'bleed' | 'art';

const setTestPageBox = (
  page: PDFPage,
  sourceBox: TestedPageBox,
  box: Readonly<{ x: number; y: number; width: number; height: number }>,
): void => {
  if (sourceBox === 'crop') page.setCropBox(box.x, box.y, box.width, box.height);
  if (sourceBox === 'trim') page.setTrimBox(box.x, box.y, box.width, box.height);
  if (sourceBox === 'bleed') page.setBleedBox(box.x, box.y, box.width, box.height);
  if (sourceBox === 'art') page.setArtBox(box.x, box.y, box.width, box.height);
};

describe('impose', () => {
  afterEach(() => vi.restoreAllMocks());

  test('loads once, embeds each unique source page once, and reuses forms across sheets', async () => {
    const source = await createSourcePdf([
      { width: 100, height: 150, label: 'ONE' },
      { width: 100, height: 150, label: 'TWO' },
    ]);
    const loadSpy = vi.spyOn(PDFDocument, 'load');
    const embedSpy = vi.spyOn(PDFDocument.prototype, 'embedPages');

    const result = await impose({
      source,
      unit: 'pt',
      sheet: { size: { width: 220, height: 320 }, margins: 10, gutter: 5 },
      layout: { type: 'n-up', rows: 2, columns: 2 },
      sourceBox: 'media',
      pages: [0, 1, 0, 1],
      sequence: { copies: 3, collation: 'collated' },
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(embedSpy).toHaveBeenCalledTimes(1);
    expect(embedSpy.mock.calls[0][0]).toHaveLength(2);
    expect(result.plan).toMatchObject({ placementCount: 12, sheetCount: 3, capacity: 4 });

    const output = await PDFDocument.load(result.pdf);
    expect(output.getPageCount()).toBe(3);
    expect(countFormXObjects(output)).toBe(2);
    for (const page of output.getPages()) {
      expect(page.getMediaBox()).toMatchObject({ x: 0, y: 0, width: 220, height: 320 });
    }
  });

  test('reuses one sheet resource name for one hundred placements of the same page', async () => {
    const sourceDocument = await PDFDocument.create({ updateMetadata: false });
    const sourcePage = sourceDocument.addPage([10, 10]);
    sourcePage.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });

    const result = await impose({
      source: await sourceDocument.save(),
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 10, columns: 10 },
      sourceBox: 'media',
      pages: Array.from({ length: 100 }, () => 0),
    });

    const output = await PDFDocument.load(result.pdf);
    const resources = output.getPage(0).node.Resources();
    const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const entries = xObjects?.entries() ?? [];

    expect(result.plan).toMatchObject({ placementCount: 100, sheetCount: 1, capacity: 100 });
    expect(entries).toHaveLength(1);
    expect(new Set(entries.map(([, reference]) => reference.toString())).size).toBe(1);
    expect(countFormXObjects(output)).toBe(1);
    expect(result.pdf.byteLength).toBeLessThan(10_000);
  });

  test('preserves a source page transparency group on the embedded form', async () => {
    const sourceDocument = await PDFDocument.create({ updateMetadata: false });
    const sourcePage = sourceDocument.addPage([100, 100]);
    sourcePage.node.set(
      PDFName.of('Group'),
      sourceDocument.context.obj({ S: 'Transparency', I: true, K: false, CS: 'DeviceRGB' }),
    );
    sourcePage.drawRectangle({ x: 0, y: 0, width: 100, height: 100, opacity: 0.5 });

    const result = await impose({
      source: await sourceDocument.save(),
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    });

    const output = await PDFDocument.load(result.pdf);
    const forms = getFormXObjects(output);
    expect(forms).toHaveLength(1);
    const [form] = forms;
    const group = form.dict.lookupMaybe(PDFName.of('Group'), PDFDict);

    expect(group).toBeInstanceOf(PDFDict);
    expect(group?.get(PDFName.of('S'))).toBe(PDFName.of('Transparency'));
    expect(group?.get(PDFName.of('CS'))).toBe(PDFName.of('DeviceRGB'));
  });

  test('uses explicit nonzero source boxes and reports deterministic fallback warnings', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([200, 300]);
    page.setMediaBox(40, 30, 200, 300);
    page.setCropBox(50, 45, 170, 250);
    page.drawRectangle({ x: 40, y: 30, width: 200, height: 300 });
    const source = await sourceDocument.save();

    const crop = await planImposition({
      source,
      unit: 'pt',
      sheet: { size: { width: 300, height: 300 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'crop',
    });
    const trim = await planImposition({
      source,
      unit: 'pt',
      sheet: { size: { width: 300, height: 300 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'trim',
    });

    expect(crop.warnings).toEqual([]);
    expect(crop.sheets[0].front.placements[0].source).toEqual({
      x: 50,
      y: 45,
      width: 170,
      height: 250,
    });
    expect(trim.sheets[0].front.placements[0].source).toEqual({
      x: 50,
      y: 45,
      width: 170,
      height: 250,
    });
    expect(trim.warnings).toEqual([
      {
        code: 'page-box-fallback',
        sourcePageIndex: 0,
        message: 'Source page 0 has no trim box; using crop box',
      },
    ]);
  });

  test.each([
    {
      sourceBox: 'crop',
      authored: { x: -50, y: -25, width: 200, height: 150 },
      effective: { x: 0, y: 0, width: 100, height: 100 },
    },
    {
      sourceBox: 'trim',
      authored: { x: -20, y: 20, width: 80, height: 100 },
      effective: { x: 0, y: 20, width: 60, height: 80 },
    },
    {
      sourceBox: 'bleed',
      authored: { x: 40, y: -30, width: 90, height: 80 },
      effective: { x: 40, y: 0, width: 60, height: 50 },
    },
    {
      sourceBox: 'art',
      authored: { x: -10, y: 30, width: 140, height: 40 },
      effective: { x: 0, y: 30, width: 100, height: 40 },
    },
  ] as const)(
    'intersects an oversized $sourceBox box with the media box',
    async ({ sourceBox, authored, effective }) => {
      const sourceDocument = await PDFDocument.create({ updateMetadata: false });
      const page = sourceDocument.addPage([100, 100]);
      setTestPageBox(page, sourceBox, authored);
      page.drawRectangle({ x: 0, y: 0, width: 100, height: 100 });

      const result = await impose({
        source: await sourceDocument.save(),
        unit: 'pt',
        sheet: { size: { width: 100, height: 100 } },
        layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
        sourceBox,
      });
      const output = await PDFDocument.load(result.pdf);
      const [form] = getFormXObjects(output);
      const embeddedBox = form.dict.lookup(PDFName.of('BBox'), PDFArray).asRectangle();

      expect(result.warnings).toEqual([]);
      expect(result.plan.sheets[0].front.placements[0].source).toEqual(effective);
      expect(embeddedBox).toEqual(effective);
    },
  );

  test.each(['crop', 'trim', 'bleed', 'art'] as const)(
    'rejects a %s box that is entirely outside the media box',
    async (sourceBox) => {
      const sourceDocument = await PDFDocument.create({ updateMetadata: false });
      const page = sourceDocument.addPage([100, 100]);
      setTestPageBox(page, sourceBox, { x: 150, y: 150, width: 20, height: 20 });

      await expect(
        planImposition({
          source: await sourceDocument.save(),
          unit: 'pt',
          sheet: { size: { width: 100, height: 100 } },
          layout: { type: 'n-up', rows: 1, columns: 1 },
          sourceBox,
        }),
      ).rejects.toThrow(
        `[@pdfweave/imposition] Source page 0 has a ${sourceBox} box that does not intersect its media box`,
      );
    },
  );

  test('uses explicit trim, bleed, and art boxes without fallback warnings', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([300, 400]);
    page.setCropBox(10, 20, 280, 360);
    page.setBleedBox(20, 30, 260, 340);
    page.setTrimBox(30, 40, 240, 320);
    page.setArtBox(40, 50, 220, 300);
    page.drawRectangle({ x: 0, y: 0, width: 300, height: 400 });
    const source = await sourceDocument.save();
    const expected = {
      trim: { x: 30, y: 40, width: 240, height: 320 },
      bleed: { x: 20, y: 30, width: 260, height: 340 },
      art: { x: 40, y: 50, width: 220, height: 300 },
    } as const;

    for (const sourceBox of ['trim', 'bleed', 'art'] as const) {
      const plan = await planImposition({
        source,
        unit: 'pt',
        sheet: { size: { width: 300, height: 400 } },
        layout: { type: 'n-up', rows: 1, columns: 1 },
        sourceBox,
      });
      expect(plan.warnings).toEqual([]);
      expect(plan.sheets[0].front.placements[0].source).toEqual(expected[sourceBox]);
    }
  });

  test('preserves blank placements and warns when source annotations cannot be copied', async () => {
    const sourceDocument = await PDFDocument.create();
    sourceDocument.addPage([100, 100]);
    const annotated = sourceDocument.addPage([100, 100]);
    annotated.drawText('annotated');
    addLinkAnnotation(annotated);
    const source = await sourceDocument.save();

    const result = await impose({
      source,
      unit: 'pt',
      sheet: { size: { width: 210, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 2 },
      sourceBox: 'media',
    });

    expect(result.plan.placementCount).toBe(2);
    expect(result.warnings).toEqual([
      {
        code: 'annotations-omitted',
        sourcePageIndex: 1,
        message: 'Source page 1 has 1 annotation; annotations are not copied by n-up imposition',
      },
    ]);
    const output = await PDFDocument.load(result.pdf);
    expect(output.getPageCount()).toBe(1);
    expect(output.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  test('flattens intrinsic page rotation into placement geometry and output rendering', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([100, 200]);
    page.drawText('ROTATED', { x: 10, y: 175, size: 12 });
    page.setRotation(degrees(90));
    const source = await sourceDocument.save();
    const result = await impose({
      source,
      unit: 'pt',
      sheet: { size: { width: 220, height: 120 }, margins: 10 },
      layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
      sourceBox: 'media',
    });

    expect(result.plan.sheets[0].front.placements[0]).toMatchObject({
      intrinsicRotation: 90,
      rotation: 90,
      scale: 1,
      content: { x: 10, y: 10, width: 200, height: 100 },
    });
    const [image] = await pdfToImages(result.pdf);
    await expect(image).toMatchImage({
      name: 'intrinsic-page-rotation',
      allowedPixelRatio: 0.001,
      includeAA: false,
    });
  });

  test('normalizes source UserUnit, nonzero boxes, and rotation into physical points', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([120, 80]);
    page.setMediaBox(10, 20, 100, 50);
    page.setRotation(degrees(90));
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    page.drawRectangle({ x: 10, y: 20, width: 100, height: 50, color: rgb(0.05, 0.25, 0.32) });
    page.drawRectangle({ x: 15, y: 25, width: 90, height: 40, borderWidth: 2 });
    const source = await sourceDocument.save();

    const result = await impose({
      source,
      unit: 'pt',
      sheet: { size: { width: 120, height: 220 }, margins: 10 },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    });

    expect(result.plan.sheets[0].front.placements[0]).toMatchObject({
      source: { x: 20, y: 40, width: 200, height: 100 },
      sourceUserUnit: 2,
      intrinsicRotation: 90,
      rotation: 90,
      scale: 1,
      content: { x: 10, y: 10, width: 100, height: 200 },
    });
    const [image] = await pdfToImages(result.pdf);
    await expect(image).toMatchImage('source-user-unit-nonzero-box-rotation');
  });

  test.each([0, 75_001])('rejects invalid source UserUnit %s', async (userUnit) => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([100, 100]);
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit));

    await expect(
      planImposition({
        source: await sourceDocument.save(),
        unit: 'pt',
        sheet: { size: { width: 100, height: 100 } },
        layout: { type: 'n-up', rows: 1, columns: 1 },
        sourceBox: 'media',
      }),
    ).rejects.toThrow('expected a value greater than 0 and at most 75000');
  });

  test('rejects a non-finite final draw scale from adversarial source geometry', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([1e-309, 1e-309]);
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(75_000));

    await expect(
      impose({
        source: await sourceDocument.save(),
        unit: 'pt',
        sheet: { size: { width: 1, height: 1 } },
        layout: { type: 'n-up', rows: 1, columns: 1, allowUpscale: true },
        sourceBox: 'media',
      }),
    ).rejects.toThrow('Source page 0 produces unsupported placement geometry');
  });

  test('accepts PDF byte arrays created in another JavaScript realm', async () => {
    const source = await createSourcePdf([{ width: 100, height: 100, label: 'CROSS REALM' }]);
    const foreignSource = runInNewContext('Uint8Array.from(bytes)', {
      bytes: Array.from(source),
    }) as Uint8Array;

    expect(foreignSource).not.toBeInstanceOf(Uint8Array);
    const plan = await planImposition({
      source: foreignSource,
      unit: 'pt',
      sheet: { size: { width: 100, height: 100 } },
      layout: { type: 'n-up', rows: 1, columns: 1 },
      sourceBox: 'media',
    });
    expect(plan.sourcePageCount).toBe(1);
  });

  test('wraps malformed lazy page dictionaries in the package error contract', async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([100, 100]);
    page.node.set(PDFName.of('CropBox'), PDFString.of('not-a-box'));
    const source = await sourceDocument.save();

    await expect(
      planImposition({
        source,
        unit: 'pt',
        sheet: { size: { width: 100, height: 100 } },
        layout: { type: 'n-up', rows: 1, columns: 1 },
        sourceBox: 'crop',
      }),
    ).rejects.toThrow('[@pdfweave/imposition] Unable to inspect source PDF:');
  });

  test('clips cover-scaled content to each slot', async () => {
    const source = await createSourcePdf([{ width: 200, height: 50, label: 'WIDE SOURCE' }]);
    const result = await impose({
      source,
      unit: 'pt',
      sheet: { size: { width: 220, height: 120 }, margins: 10, gutter: 10 },
      layout: {
        type: 'n-up',
        rows: 1,
        columns: 2,
        scale: 'cover',
        allowUpscale: true,
      },
      sourceBox: 'media',
      pages: [0, 0],
    });

    const output = await PDFDocument.load(result.pdf);
    const resources = output.getPage(0).node.Resources();
    expect(resources).toBeInstanceOf(PDFDict);
    expect(result.plan.sheets[0].front.placements[0].content.height).toBeCloseTo(100, 8);
    expect(result.plan.sheets[0].front.placements[0].content.width).toBeCloseTo(400, 8);
    const [image] = await pdfToImages(result.pdf);
    await expect(image).toMatchImage('cover-mode-cell-clipping');
  });

  test('produces byte-identical output for identical inputs and options', async () => {
    const source = await createSourcePdf([
      { width: 100, height: 150, label: 'DETERMINISTIC ONE' },
      { width: 150, height: 100, label: 'DETERMINISTIC TWO' },
    ]);
    const props = {
      source,
      unit: 'pt' as const,
      sheet: { size: { width: 320, height: 220 }, margins: 10, gutter: 5 },
      layout: { type: 'n-up' as const, rows: 2, columns: 2, autoRotate: true },
      sourceBox: 'media' as const,
      pages: [1, 0, 1],
    };

    const first = await impose(props);
    const second = await impose(props);

    expect(first.plan).toEqual(second.plan);
    expect(first.pdf).toEqual(second.pdf);
  });

  test('rejects corrupt input with a stable package error', async () => {
    await expect(
      impose({
        source: new Uint8Array([1, 2, 3]),
        sheet: { size: 'A4' },
        layout: { type: 'n-up', rows: 1, columns: 1 },
      }),
    ).rejects.toThrow('[@pdfweave/imposition] Unable to load source PDF:');
  });
});
