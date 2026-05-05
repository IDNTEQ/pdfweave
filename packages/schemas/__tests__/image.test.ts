import { describe, it, expect } from 'vitest';
import { PDFDocument } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF, type Schema, type PDFRenderProps } from '@pdfweave/common';
import { image } from '../src/index.js';
import {
  getJpegExifOrientation,
  getJpegExifOrientationFromDataUri,
} from '../src/graphics/imagehelper.js';

describe('image plugin memory-safety', () => {
  it('does not pin the full base64 input as a cache key', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const _cache = new Map<string | number, unknown>();

    // A minimal but valid 1×1 PNG data URL is sufficient: we only need
    // embedPng to succeed so the render path reaches the cache; the
    // cache key is derived from `value` regardless of image size.
    const minimalPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1J' +
      'REFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=';

    const schema = {
      name: 'pic',
      type: 'image',
      content: minimalPng,
      position: { x: 0, y: 0 },
      width: 50,
      height: 50,
    } as unknown as Schema;

    const arg = {
      value: minimalPng,
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: {},
      _cache,
    } as unknown as PDFRenderProps<Schema>;

    await image.pdf(arg);

    const keys = [...(_cache.keys() as Iterable<string>)];
    // Exactly one cache entry should have been created by the one pdf() call.
    expect(keys.length).toBe(1);
    // Regression guard: the cache key MUST be a fingerprint, not the raw
    // input. Before the fix, the key was `${schema.type}${value}` and its
    // byte length matched the input byte length. A tight bound of 100
    // chars catches any regression back to that behaviour — the current
    // fingerprint format (`${type}:${len}:${fnv1a-hex}`) stays well under
    // 40 even for huge inputs.
    expect(keys[0].length).toBeLessThan(100);
    // Schema type must still be part of the key so different plugins
    // can't collide on the same shared cache Map.
    expect(keys[0].startsWith('image')).toBe(true);
    // Same input hitting the cache a second time must be a cache hit, not
    // a new entry — proves the fingerprint is deterministic.
    await image.pdf(arg);
    expect([...(_cache.keys() as Iterable<string>)].length).toBe(1);
  });

  it('distinguishes different images via the fingerprint', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const _cache = new Map<string | number, unknown>();

    const pngA =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1J' +
      'REFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=';
    // Same size/header/trailer shape as pngA but different middle bytes —
    // the fingerprint must still distinguish them. Because the key is a
    // hash over every byte, any differing byte flips the hash with
    // overwhelming probability.
    const pngB =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAD8S7TTAAAAAXNSR0IArs4c6QAAAA1J' +
      'REFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=';

    const base = {
      name: 'pic',
      type: 'image',
      position: { x: 0, y: 0 },
      width: 50,
      height: 50,
    };

    const argA = {
      value: pngA,
      schema: { ...base, content: pngA } as unknown as Schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: {},
      _cache,
    } as unknown as PDFRenderProps<Schema>;

    const argB = { ...argA, value: pngB, schema: { ...base, content: pngB } as unknown as Schema };

    await image.pdf(argA);
    await image.pdf(argB);

    // Two different images must produce two distinct cache entries.
    expect([...(_cache.keys() as Iterable<string>)].length).toBe(2);
  });
});

/**
 * Building-block coverage for the EXIF Orientation parser added for
 * pdfme/pdfme#1183. The full geometric application of the orientation in
 * the pdf render path is deferred (see PR body) — composing EXIF rotation
 * with schema rotation, the bounding-box centering, and pdf-lib's
 * corner-pivot drawImage requires more geometry than fits in this batch.
 * The parser is shipped now so the follow-up only needs to wire it up.
 */
describe('getJpegExifOrientation (pdfme/pdfme#1183 building block)', () => {
  it('returns 1 for non-JPEG inputs', () => {
    expect(getJpegExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(getJpegExifOrientation(new Uint8Array([]))).toBe(1);
  });
  it('returns 1 for a JPEG with no EXIF', () => {
    // Minimal JPEG: SOI + a JFIF APP0 + EOI.
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xd9, // EOI
    ]);
    expect(getJpegExifOrientation(jpeg)).toBe(1);
  });
  // Build a minimal JPEG with an APP1/Exif segment carrying a single
  // Orientation IFD entry. Reusable factory keeps the per-orientation tests
  // narrowly focused on the value being asserted.
  const buildJpegWithOrientation = (orientation: number, little = true): Uint8Array => {
    // Layout of the APP1 payload (after the 2-byte length):
    //   [Exif\0\0]       6 bytes
    //   [BOM][0x002a][ifdOffset]  TIFF header (8 bytes)
    //   [numEntries:2]
    //   [entry: tag=0x0112, type=0x0003, count=1, value(2)+pad(2)]
    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    const bom = little ? [0x49, 0x49] : [0x4d, 0x4d];
    const u16 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff] : [(n >> 8) & 0xff, n & 0xff]);
    const u32 = (n: number) =>
      little
        ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
        : [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    const tiff = [
      ...bom,
      ...u16(0x002a), // magic
      ...u32(8), // ifd0 offset relative to TIFF start
    ];
    const ifd = [
      ...u16(1), // numEntries
      ...u16(0x0112), // tag: Orientation
      ...u16(0x0003), // type: SHORT
      ...u32(1), // count
      ...u16(orientation), // value
      0x00, 0x00, // pad
    ];
    const app1Payload = [...exifHeader, ...tiff, ...ifd];
    const app1Length = app1Payload.length + 2; // +2 for the length bytes themselves
    const out = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, // APP1 marker
      (app1Length >> 8) & 0xff,
      app1Length & 0xff,
      ...app1Payload,
      0xff, 0xd9, // EOI
    ]);
    return out;
  };
  it('reads Orientation = 1 (identity) from a little-endian APP1', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(1))).toBe(1);
  });
  it('reads Orientation = 3 (rotate 180°)', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(3))).toBe(3);
  });
  it('reads Orientation = 6 (rotate 90° CW)', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(6))).toBe(6);
  });
  it('reads Orientation = 8 (rotate 270° CW)', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(8))).toBe(8);
  });
  it('reads big-endian (Motorola) APP1 segments', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(6, false))).toBe(6);
  });
  it('rejects out-of-range Orientation values as identity', () => {
    expect(getJpegExifOrientation(buildJpegWithOrientation(0))).toBe(1);
    expect(getJpegExifOrientation(buildJpegWithOrientation(99))).toBe(1);
  });
  it('returns 1 for non-JPEG data URIs and empty / malformed input', () => {
    expect(getJpegExifOrientationFromDataUri('data:image/png;base64,iVBORw0K')).toBe(1);
    expect(getJpegExifOrientationFromDataUri('not a data uri')).toBe(1);
    expect(getJpegExifOrientationFromDataUri('')).toBe(1);
  });
  it('reads Orientation through the data-URI helper', () => {
    const jpegBytes = buildJpegWithOrientation(6);
    const base64 = Buffer.from(jpegBytes).toString('base64');
    expect(getJpegExifOrientationFromDataUri(`data:image/jpeg;base64,${base64}`)).toBe(6);
  });
});
