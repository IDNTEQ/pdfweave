import { describe, it, expect } from 'vitest';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, mm2pt, type Schema, type PDFRenderProps } from '@pdfweave/common';
import { rectangle, ellipse, line } from '../src/index.js';

/**
 * Tests for pdfme/pdfme#530 — dashed-stroke patterns on line / rect /
 * ellipse. The schema field `borderDashArray` (mm) is converted to PDF
 * points before being passed to pdf-lib. Line uses `dashArray`; rect /
 * ellipse use `borderDashArray` (different pdf-lib field names for the
 * same concept).
 */

const renderRect = async (overrides: Partial<Record<string, unknown>> = {}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const calls: Array<Record<string, unknown>> = [];
  const orig = page.drawRectangle.bind(page);
  page.drawRectangle = (args: Parameters<typeof orig>[0]) => {
    calls.push({ ...args });
    return orig(args);
  };
  const schema = {
    name: 'r',
    type: 'rectangle',
    content: '',
    position: { x: 0, y: 0 },
    width: 50,
    height: 30,
    borderWidth: 1,
    borderColor: '#000000',
    color: '',
    rotate: 0,
    ...overrides,
  } as unknown as Schema;
  await rectangle.pdf({
    value: '',
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: {},
    _cache: new Map(),
  } as unknown as PDFRenderProps<Schema>);
  return calls[0];
};

const renderEllipse = async (overrides: Partial<Record<string, unknown>> = {}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const calls: Array<Record<string, unknown>> = [];
  const orig = page.drawEllipse.bind(page);
  page.drawEllipse = (args: Parameters<typeof orig>[0]) => {
    calls.push({ ...args });
    return orig(args);
  };
  const schema = {
    name: 'e',
    type: 'ellipse',
    content: '',
    position: { x: 0, y: 0 },
    width: 50,
    height: 30,
    borderWidth: 1,
    borderColor: '#000000',
    color: '',
    rotate: 0,
    ...overrides,
  } as unknown as Schema;
  await ellipse.pdf({
    value: '',
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: {},
    _cache: new Map(),
  } as unknown as PDFRenderProps<Schema>);
  return calls[0];
};

const renderLine = async (overrides: Partial<Record<string, unknown>> = {}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const calls: Array<Record<string, unknown>> = [];
  const orig = page.drawLine.bind(page);
  page.drawLine = (args: Parameters<typeof orig>[0]) => {
    calls.push({ ...args });
    return orig(args);
  };
  const schema = {
    name: 'l',
    type: 'line',
    content: '',
    position: { x: 0, y: 0 },
    width: 50,
    height: 0.5,
    color: '#000000',
    rotate: 0,
    ...overrides,
  } as unknown as Schema;
  await line.pdf({
    value: '',
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: {},
    _cache: new Map(),
  } as unknown as PDFRenderProps<Schema>);
  return calls[0];
};

describe('borderDashArray on shapes (pdfme/pdfme#530)', () => {
  it('rectangle: passes mm-to-pt converted dashArray to pdf-lib', async () => {
    const call = await renderRect({ borderDashArray: [4, 2] });
    expect(call.borderDashArray).toBeDefined();
    const arr = call.borderDashArray as number[];
    expect(arr.length).toBe(2);
    expect(arr[0]).toBeCloseTo(mm2pt(4), 5);
    expect(arr[1]).toBeCloseTo(mm2pt(2), 5);
  });
  it('rectangle: omits borderDashArray when not configured (no behaviour change)', async () => {
    const call = await renderRect();
    expect(call.borderDashArray).toBeUndefined();
  });
  it('ellipse: passes mm-to-pt converted dashArray to pdf-lib', async () => {
    const call = await renderEllipse({ borderDashArray: [3, 1] });
    expect(call.borderDashArray).toBeDefined();
    const arr = call.borderDashArray as number[];
    expect(arr[0]).toBeCloseTo(mm2pt(3), 5);
    expect(arr[1]).toBeCloseTo(mm2pt(1), 5);
  });
  it('line: passes mm-to-pt converted dashArray (note: pdf-lib field is `dashArray`)', async () => {
    const call = await renderLine({ borderDashArray: [4, 2] });
    // pdf-lib's `drawLine` uses `dashArray` (not borderDashArray) for the
    // stroke pattern — we translate at the call site so the schema field
    // name stays consistent across all three shape types.
    expect(call.dashArray).toBeDefined();
    const arr = call.dashArray as number[];
    expect(arr[0]).toBeCloseTo(mm2pt(4), 5);
    expect(arr[1]).toBeCloseTo(mm2pt(2), 5);
  });
  it('line: omits dashArray when borderDashArray is undefined', async () => {
    const call = await renderLine();
    expect(call.dashArray).toBeUndefined();
  });
});
