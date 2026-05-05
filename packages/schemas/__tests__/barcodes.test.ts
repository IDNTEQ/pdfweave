import { describe, expect, it } from 'vitest';
import { createBarCode } from '../src/barcodes/helper.js';

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
