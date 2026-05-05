import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, mm2pt, type Font, type PDFRenderProps } from '@pdfweave/common';
import { pdfRender } from '../src/text/pdfRender.js';
import type { TextSchema } from '../src/text/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, `/assets/fonts/SauceHanSansJP.ttf`));

const getFont = (): Font => ({
  SauceHanSansJP: { fallback: true, data: sansData },
});

const baseSchema = (overrides: Partial<TextSchema> = {}): TextSchema =>
  ({
    name: 't',
    type: 'text',
    content: 'hello world',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    alignment: 'left',
    verticalAlignment: 'top',
    fontColor: '#000000',
    backgroundColor: '',
    lineHeight: 1.3,
    characterSpacing: 0,
    fontSize: 12,
    ...overrides,
  }) as TextSchema;

/**
 * Capture pdf-lib draw calls so we can assert on the resulting geometry
 * without parsing the PDF content stream. Same approach as shapes.test.ts.
 */
const renderText = async (
  schema: TextSchema,
  value: string,
): Promise<{
  rectangleCalls: Array<Record<string, unknown>>;
  textCalls: Array<Record<string, unknown>>;
}> => {
  const pdfDoc = await PDFDocument.create();
  // @ts-expect-error registerFontkit method is not in type definitions but exists at runtime
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage();
  const rectangleCalls: Array<Record<string, unknown>> = [];
  const textCalls: Array<Record<string, unknown>> = [];

  const origDrawRectangle = page.drawRectangle.bind(page);
  page.drawRectangle = (args: Parameters<typeof origDrawRectangle>[0]) => {
    rectangleCalls.push({ ...args });
    return origDrawRectangle(args);
  };
  const origDrawText = page.drawText.bind(page);
  page.drawText = (text: string, args: Parameters<typeof origDrawText>[1]) => {
    textCalls.push({ text, ...args });
    return origDrawText(text, args);
  };

  await pdfRender({
    value,
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: { font: getFont() },
    _cache: new Map(),
  } as unknown as PDFRenderProps<TextSchema>);

  return { rectangleCalls, textCalls };
};

/**
 * Padding shrinks the inner text rect; the schema's outer bounds stay the
 * same so background and border still fill the original schema box. The
 * background draw call captures the outer rect; we assert the text x/y
 * shifts by exactly the padding amount.
 *
 * Padding of [5,5,5,5] on a 100×50mm schema at position (0,0) should:
 *   - keep the background at the full 100×50mm (mm2pt-converted)
 *   - shift the text's x rightward by 5mm
 *   - shift the text down by 5mm (the text yLine subtracts padTop)
 *
 * pdfme/pdfme#851.
 */
describe('text pdfRender padding (pdfme/pdfme#851)', () => {
  it('shrinks the text rect by padding while keeping background bounds', async () => {
    const schemaNoPad = baseSchema({
      backgroundColor: '#eeeeee',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
    });
    const schemaPad = baseSchema({
      backgroundColor: '#eeeeee',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      padding: [5, 5, 5, 5],
    });
    const noPad = await renderText(schemaNoPad, 'hello');
    const pad = await renderText(schemaPad, 'hello');

    // Background rect comes first: outer bounds must be IDENTICAL (padding
    // is purely an inner inset — the schema box is unchanged).
    expect(pad.rectangleCalls[0].width).toBeCloseTo(noPad.rectangleCalls[0].width as number, 5);
    expect(pad.rectangleCalls[0].height).toBeCloseTo(noPad.rectangleCalls[0].height as number, 5);
    expect(pad.rectangleCalls[0].x).toBeCloseTo(noPad.rectangleCalls[0].x as number, 5);
    expect(pad.rectangleCalls[0].y).toBeCloseTo(noPad.rectangleCalls[0].y as number, 5);

    // Text x shifts right by exactly mm2pt(5).
    expect((pad.textCalls[0].x as number) - (noPad.textCalls[0].x as number)).toBeCloseTo(
      mm2pt(5),
      4,
    );
    // Text y shifts DOWN (smaller PDF y) by mm2pt(5) — same magnitude,
    // negative sign because PDF y grows up while padTop pushes the text
    // toward the bottom of the box.
    expect((noPad.textCalls[0].y as number) - (pad.textCalls[0].y as number)).toBeCloseTo(
      mm2pt(5),
      4,
    );
  });
});

/**
 * Border draws a stroked rectangle just inside the schema bounds. We assert
 * the resulting drawRectangle call has `borderWidth` and `borderColor`,
 * and that it's positioned inset by half the border width (matches the
 * existing rectangle-shape `box-sizing: border-box` convention).
 * pdfme/pdfme#851.
 */
describe('text pdfRender border (pdfme/pdfme#851)', () => {
  it('emits a stroked rectangle with the requested borderWidth/Color', async () => {
    const schema = baseSchema({
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      border: { width: 1, color: '#ff0000' },
    });
    const { rectangleCalls } = await renderText(schema, 'hi');

    // The border rect is the only drawRectangle call (no backgroundColor in
    // this schema). It must carry a non-zero borderWidth.
    const borderRect = rectangleCalls.find(
      (call) => typeof call.borderWidth === 'number' && (call.borderWidth as number) > 0,
    );
    expect(borderRect).toBeTruthy();
    expect(borderRect!.borderWidth).toBeCloseTo(mm2pt(1), 5);
    // Inner width = outer width − full border width (matches CSS
    // `box-sizing: border-box`, same convention as the rectangle shape).
    expect(borderRect!.width).toBeCloseTo(mm2pt(100) - mm2pt(1), 5);
    expect(borderRect!.height).toBeCloseTo(mm2pt(50) - mm2pt(1), 5);
  });
  it('does not emit a border rect when border is omitted (no behaviour change)', async () => {
    const schema = baseSchema({ position: { x: 0, y: 0 }, width: 100, height: 50 });
    const { rectangleCalls } = await renderText(schema, 'hi');
    // No background, no border → no rectangle calls at all.
    expect(rectangleCalls.length).toBe(0);
  });
});
