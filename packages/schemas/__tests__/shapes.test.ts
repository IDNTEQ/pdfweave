import { describe, it, expect } from 'vitest';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, mm2pt, type Schema, type PDFRenderProps } from '@pdfweave/common';
import { rectangle } from '../src/index.js';

/**
 * Regression coverage for pdfme/pdfme#382: a rotated rectangle with a thick
 * border landed in a different place in the generated PDF than the SVG-based
 * Designer preview, because the previous PDF render formula offset position
 * by `Math.tan(toRadians(rotate)) * Math.PI ** 2` — an unbounded value with
 * no geometric meaning that diverged spectacularly at any non-trivial angle
 * (Infinity at 90°).
 *
 * The corrected math draws the rectangle inset by borderWidth/2 so the outer
 * edge of pdf-lib's centered border sits on the schema's bounding box (matching
 * SVG `box-sizing: border-box`), and rotates the inset offset by the same angle
 * so the inner rectangle stays concentric with the schema box.
 */
describe('rectangle rotation + thick border (pdfme/pdfme#382)', () => {
  /**
   * Capture the call into pdf-lib's drawRectangle so we can assert on the
   * geometric arguments directly. We patch the page object (rectangle.pdf
   * calls `page.drawRectangle`) — easier than parsing the PDF content stream.
   */
  const renderRectangle = async (schemaOverrides: Partial<Schema> & { borderWidth: number }) => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const calls: Array<Record<string, unknown>> = [];
    const origDrawRectangle = page.drawRectangle.bind(page);
    page.drawRectangle = (args: Parameters<typeof origDrawRectangle>[0]) => {
      calls.push({ ...args });
      return origDrawRectangle(args);
    };

    const schema: Schema & {
      borderWidth: number;
      borderColor: string;
      color: string;
      rotate?: number;
    } = {
      name: 'rect',
      type: 'rectangle',
      content: '',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      borderWidth: 0,
      borderColor: '#000000',
      color: '#ff0000',
      rotate: 0,
      ...schemaOverrides,
    } as never;

    const arg = {
      value: '',
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: {},
      _cache: new Map(),
    } as unknown as PDFRenderProps<Schema>;

    await rectangle.pdf(arg);
    return calls[0];
  };

  it('renders the inner rectangle inset by borderWidth/2 when rotate=0', async () => {
    const call = await renderRectangle({
      borderWidth: 10, // 10mm border
      rotate: 0,
      width: 100,
      height: 50,
      position: { x: 0, y: 0 },
    });
    const half = mm2pt(10) / 2;
    // Width / height are reduced by the full borderWidth so the rectangle
    // (with its border centered) sits inside the schema box.
    expect(call.width).toBeCloseTo(mm2pt(100) - mm2pt(10), 5);
    expect(call.height).toBeCloseTo(mm2pt(50) - mm2pt(10), 5);
    // At rotate=0 the inset is just (half, half) added to the unrotated
    // bottom-left position from convertForPdfLayoutProps.
    const pageHeight = (await PDFDocument.create()).addPage().getHeight();
    // The schema position (0, 0) maps to PDF (0, pageHeight - height).
    expect(call.x).toBeCloseTo(0 + half, 4);
    expect(call.y).toBeCloseTo(pageHeight - mm2pt(50) + half, 4);
  });

  it('keeps the rotation pivot at the schema center for a 45° rotated thick-border rect', async () => {
    // Render once at rotate=0 and once at rotate=45 with an identical schema.
    // The inner rectangle's center, computed analytically from pdf-lib's
    // (x, y, width, height, rotate) call, must coincide with the schema's
    // box center in both cases — that's the property the SVG rendering
    // satisfies (transform-origin: center) and the property the buggy
    // formula violated.
    const baseSchema = {
      borderWidth: 10,
      width: 100,
      height: 50,
      position: { x: 50, y: 80 },
    };
    const expectedCenterX = mm2pt(50 + 100 / 2);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const pageHeight = page.getHeight();
    const expectedCenterY = pageHeight - mm2pt(80 + 50 / 2);

    const call0 = await renderRectangle({ ...baseSchema, rotate: 0 });
    const call45 = await renderRectangle({ ...baseSchema, rotate: 45 });

    // For rotate=0, the rectangle's center is (x + width/2, y + height/2).
    const center0 = {
      x: (call0.x as number) + (call0.width as number) / 2,
      y: (call0.y as number) + (call0.height as number) / 2,
    };
    expect(center0.x).toBeCloseTo(expectedCenterX, 3);
    expect(center0.y).toBeCloseTo(expectedCenterY, 3);

    // For rotate=45, pdf-lib rotates the rectangle around (call.x, call.y).
    // The center of the rotated rectangle = pivot + R_θ(width/2, height/2),
    // where θ is the same angle pdf-lib uses (the `rotate` arg). Schema
    // rotation 45 (CW) maps to -45° in pdf-lib's CCW convention.
    const angleRad = -45 * (Math.PI / 180);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const w2 = (call45.width as number) / 2;
    const h2 = (call45.height as number) / 2;
    const center45 = {
      x: (call45.x as number) + w2 * cos - h2 * sin,
      y: (call45.y as number) + w2 * sin + h2 * cos,
    };
    // Tolerance accounts for floating-point composition; the previous
    // formula was off by Math.PI ** 2 ≈ 9.87 *points* — an order of
    // magnitude larger than this tolerance.
    expect(center45.x).toBeCloseTo(expectedCenterX, 2);
    expect(center45.y).toBeCloseTo(expectedCenterY, 2);
  });

  it('does not produce non-finite x / y for any rotation angle', async () => {
    // The previous formula went to Infinity at rotate=90 because
    // `Math.tan(toRadians(rotate)) * Math.PI ** 2` blows up there. Sweep
    // a range of angles and assert finite output everywhere.
    for (const rot of [0, 30, 45, 60, 89, 90, 91, 135, 180, 270]) {
      const call = await renderRectangle({
        borderWidth: 5,
        rotate: rot,
        width: 80,
        height: 40,
        position: { x: 10, y: 20 },
      });
      expect(Number.isFinite(call.x)).toBe(true);
      expect(Number.isFinite(call.y)).toBe(true);
    }
  });
});
