import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import * as fontkit from 'fontkit';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, type Font, type Schema, type PDFRenderProps } from '@pdfweave/common';
import { svg } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sansData = readFileSync(path.join(__dirname, `/assets/fonts/SauceHanSansJP.ttf`));

const getJapaneseFont = (): Font => ({
  SauceHanSansJP: { fallback: true, data: sansData },
});

const buildArg = async (svgValue: string, font?: Font) => {
  const pdfDoc = await PDFDocument.create();
  // @ts-expect-error registerFontkit method is not in type definitions but exists at runtime
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage();
  const _cache = new Map<string | number, unknown>();

  const schema = {
    name: 'logo',
    type: 'svg',
    content: svgValue,
    position: { x: 0, y: 0 },
    width: 50,
    height: 50,
  } as unknown as Schema;

  const arg = {
    value: svgValue,
    schema,
    basePdf: BLANK_PDF,
    pdfLib,
    pdfDoc,
    page,
    options: font ? { font } : {},
    _cache,
  } as unknown as PDFRenderProps<Schema>;

  return { arg, page, pdfDoc };
};

describe('svg plugin font forwarding (pdfme#1433)', () => {
  it('forwards options.font to page.drawSvg as embedded fonts', async () => {
    const svgValue =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">こんにちは</text></svg>';
    const { arg, page } = await buildArg(svgValue, getJapaneseFont());

    const drawSvgSpy = vi.spyOn(page, 'drawSvg').mockResolvedValue();

    await svg.pdf(arg);

    expect(drawSvgSpy).toHaveBeenCalledTimes(1);
    const callArgs = drawSvgSpy.mock.calls[0];
    expect(callArgs[0]).toBe(svgValue);
    const opts = callArgs[1] as { fonts?: Record<string, unknown> };
    expect(opts.fonts).toBeDefined();
    expect(opts.fonts && Object.keys(opts.fonts)).toContain('SauceHanSansJP');
  });

  it('omits fonts cleanly when no font is provided', async () => {
    const svgValue =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    const { arg, page } = await buildArg(svgValue);

    const drawSvgSpy = vi.spyOn(page, 'drawSvg').mockResolvedValue();

    await svg.pdf(arg);

    expect(drawSvgSpy).toHaveBeenCalledTimes(1);
    const opts = drawSvgSpy.mock.calls[0][1] as { fonts?: unknown };
    expect(opts.fonts).toBeUndefined();
  });

  it('renders an SVG with non-Latin <text> without a WinAnsi crash', async () => {
    const svgValue =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<text x="10" y="50" font-family="SauceHanSansJP" font-size="12">こんにちは</text>' +
      '</svg>';
    const { arg, pdfDoc } = await buildArg(svgValue, getJapaneseFont());

    await expect(svg.pdf(arg)).resolves.not.toThrow();
    const bytes = await pdfDoc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
