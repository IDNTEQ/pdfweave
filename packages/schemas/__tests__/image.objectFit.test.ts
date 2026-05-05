import { describe, it, expect } from 'vitest';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, type Schema, type PDFRenderProps, mm2pt, px2mm } from '@pdfweave/common';
import { image } from '../src/index.js';
import { computeImageFitRect } from '../src/graphics/image.js';

/**
 * 2×1 PNG (2px wide, 1px tall) — natural aspect ratio 2:1. Used as a known
 * reference image whose natural dimensions can be asserted against the
 * draw rect after applying objectFit. Generated with sharp; kept inline so
 * the test has no asset dependencies.
 */
const TWO_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAADn' +
  'EwSWAAAADklEQVQIW2P8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const renderImage = async (
  schemaOverrides: Partial<Schema> & {
    objectFit?: string;
    imagePosition?: { x: string; y: string };
  } = {},
) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const calls: Array<Record<string, unknown>> = [];
  const origDrawImage = page.drawImage.bind(page);
  page.drawImage = (img: unknown, args: Record<string, unknown>) => {
    calls.push({ ...args });
    return origDrawImage(img as never, args as never);
  };

  const schema = {
    name: 'pic',
    type: 'image',
    content: TWO_BY_ONE_PNG,
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    ...schemaOverrides,
  } as unknown as Schema;

  await image.pdf({
    value: TWO_BY_ONE_PNG,
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: {},
    _cache: new Map(),
  } as unknown as PDFRenderProps<Schema>);

  return { call: calls[0], pageHeight: page.getHeight() };
};

/**
 * Pure-function coverage for the fit/position math. Tested directly on
 * `computeImageFitRect` so the geometric semantics are pinned independent
 * of the pdf-lib drawImage call wiring. pdfme/pdfme#696.
 */
describe('computeImageFitRect (pdfme/pdfme#696)', () => {
  it('contain on a 100×50 image in a 100×100 box: letterbox vertically, centered', () => {
    const fit = computeImageFitRect(100, 50, 100, 100, 'contain', { x: 'center', y: 'middle' });
    expect(fit.width).toBe(100);
    expect(fit.height).toBe(50);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(25);
  });
  it('cover on a 100×50 image in a 100×100 box: fills box, crops horizontally', () => {
    const fit = computeImageFitRect(100, 50, 100, 100, 'cover', { x: 'center', y: 'middle' });
    expect(fit.width).toBe(200); // height-fit, width overflows 2× the box
    expect(fit.height).toBe(100);
    // Negative slack on overflow axis; center alignment splits the
    // overflow evenly to the left and right of the box.
    expect(fit.offsetX).toBe(-50);
    expect(fit.offsetY).toBe(0);
  });
  it('fill stretches to box dimensions', () => {
    const fit = computeImageFitRect(100, 50, 80, 60, 'fill', { x: 'left', y: 'top' });
    expect(fit.width).toBe(80);
    expect(fit.height).toBe(60);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(0);
  });
  it('none renders at native pixel size, anchored at the chosen position', () => {
    const fit = computeImageFitRect(40, 30, 100, 100, 'none', { x: 'right', y: 'bottom' });
    expect(fit.width).toBe(40);
    expect(fit.height).toBe(30);
    // right + bottom = full slack on both axes.
    expect(fit.offsetX).toBe(60);
    expect(fit.offsetY).toBe(70);
  });
  it('contain centers an image whose aspect ratio is taller than the box', () => {
    // 50×100 in a 100×100 box → narrower than box, fit on height, center
    // the slack horizontally.
    const fit = computeImageFitRect(50, 100, 100, 100, 'contain', { x: 'center', y: 'middle' });
    expect(fit.width).toBe(50);
    expect(fit.height).toBe(100);
    expect(fit.offsetX).toBe(25);
    expect(fit.offsetY).toBe(0);
  });
});

/**
 * End-to-end coverage that the pdf render path passes the right
 * width/height to pdf-lib's drawImage based on objectFit. The 2×1 PNG +
 * 100×100 box is the simplest case where fit modes give visibly distinct
 * results: contain keeps width=100mm and height=50mm; fill keeps
 * width=height=100mm. pdfme/pdfme#696.
 */
describe('image.pdf objectFit integration (pdfme/pdfme#696)', () => {
  it('contain (default) preserves the image aspect ratio', async () => {
    const { call } = await renderImage({ width: 100, height: 100 });
    // Image is 2px × 1px; natural mm dimensions come via px2mm.
    const naturalRatio = px2mm(2) / px2mm(1);
    expect(((call.width as number) / (call.height as number)).toFixed(3)).toBe(
      naturalRatio.toFixed(3),
    );
  });
  it('fill stretches to the schema bounds (image ratio not preserved)', async () => {
    const { call } = await renderImage({ width: 100, height: 100, objectFit: 'fill' });
    expect(call.width as number).toBeCloseTo(mm2pt(100), 5);
    expect(call.height as number).toBeCloseTo(mm2pt(100), 5);
  });
  it('cover fills the box, overflowing on the longer axis', async () => {
    const { call } = await renderImage({ width: 100, height: 100, objectFit: 'cover' });
    // Cover for a 2:1 image in a 1:1 box → fit to height, width = 2× box.
    expect(call.height as number).toBeCloseTo(mm2pt(100), 5);
    expect(call.width as number).toBeGreaterThan(call.height as number);
  });
});
