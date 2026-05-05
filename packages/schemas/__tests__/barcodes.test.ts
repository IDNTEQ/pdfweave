import { describe, expect, it } from 'vitest';
import { createBarCode, createBarCodeSvg } from '../src/barcodes/helper.js';

/**
 * Regression guard against pdfme/pdfme#1427:
 *
 *   "ReferenceError: bwipp_setanycolor is not defined"
 *
 * The upstream report (@prabhjotkaur1087, v6.0.6) shows that text-bearing
 * barcodes (e.g. ean13 with includetext:true) crash when the bwip-js setanycolor
 * helper has been tree-shaken away. Below we render a couple of barcode types
 * that commonly default to includetext:true and confirm the call resolves to a
 * non-empty buffer instead of throwing.
 */
describe('barcode includetext guard (pdfme/pdfme#1427)', () => {
  it('renders ean13 with includetext:true without ReferenceError on bwipp_setanycolor', async () => {
    const buffer = await createBarCode({
      type: 'ean13',
      input: '1111111111116',
      width: 30,
      height: 15,
      includetext: true,
      // Exercise the color-setting code paths the upstream bug report names
      // (bwipp_setanycolor) by passing explicit bar/text/background colors.
      backgroundColor: 'ffffff',
      barColor: '000000',
      textColor: '000000',
    });
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('renders code128 with includetext:true', async () => {
    const buffer = await createBarCode({
      type: 'code128',
      input: 'PDFWEAVE-1427',
      width: 50,
      height: 15,
      includetext: true,
      backgroundColor: 'ffffff',
      barColor: '000000',
      textColor: '000000',
    });
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('renders code39 with includetext:true', async () => {
    const buffer = await createBarCode({
      type: 'code39',
      input: 'TEST-1427',
      width: 50,
      height: 15,
      includetext: true,
      backgroundColor: 'ffffff',
      barColor: '000000',
      textColor: '000000',
    });
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
  });
});

/**
 * Regression guard against pdfme/pdfme#702:
 *
 *   "bwip-js fails in Web Worker" — the previous helper unconditionally
 *   reached for `document.createElement('canvas')` whenever `window` was
 *   undefined-and-not-undefined (browser bundles) and crashed in a Worker
 *   where `document` doesn't exist. The dynamic-loader version detects the
 *   Worker context and either uses OffscreenCanvas or, failing that, the
 *   SVG entry point that's safe everywhere JS runs.
 *
 *   The vitest jsdom environment does expose `window` and `document`, so we
 *   can't truly simulate a Worker without spawning one. Instead we exercise
 *   the SVG path that workers fall back to via createBarCodeSvg, which the
 *   loader resolves via `bwip-js/generic` when no document is available.
 */
describe('barcode worker / SVG fallback (pdfme/pdfme#702)', () => {
  it('createBarCodeSvg returns a non-empty SVG string', async () => {
    const svg = await createBarCodeSvg({
      type: 'qrcode',
      input: 'pdfme/pdfme#702',
      width: 30,
      height: 30,
    });
    expect(typeof svg).toBe('string');
    expect(svg.length).toBeGreaterThan(0);
    // Sanity check that the output looks like SVG, not a stray error string.
    expect(svg.trim().startsWith('<')).toBe(true);
  });
});
