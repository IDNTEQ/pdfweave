import { vi } from 'vitest';
import generate from '../src/generate.js';
import { Template, BLANK_A4_PDF, BLANK_PDF, Schema } from '@pdfweave/common';
import * as pdfLib from '@pdfweave/pdf-lib';
import { image, text } from '@pdfweave/schemas';
import { prepareBasePdfResources } from '../src/helper.js';

// Minimal valid 1-page custom PDF base64 — same fixture style as
// generate.test.ts's multiSchemasTemplate.basePdf.
const CUSTOM_BASE_PDF =
  'data:application/pdf;base64,JVBERi0xLjcNJeLjz9MNCjYgMCBvYmoNPDwvTGluZWFyaXplZCAxL0wgMTg0NC9PIDgvRSAxMTEwL04gMi9UIDE1NzAvSCBbIDQyMyAxMzFdPj4NZW5kb2JqDSAgICAgICAgICAgICAgICAgICAgICAgDQoxMSAwIG9iag08PC9EZWNvZGVQYXJtczw8L0NvbHVtbnMgMy9QcmVkaWN0b3IgMTI+Pi9GaWx0ZXIvRmxhdGVEZWNvZGUvSURbPEJBMTk5MUY0MThCN0IyMTEwQTAwNjc0NThCNkJDNjIzPjxGOEE4OEZEMzMzNjQ2OTQ2QkE1ODMzM0M4MEFEMDFFNj5dL0luZGV4WzYgN10vTGVuZ3RoIDM2L1ByZXYgMTU3MS9Sb290IDcgMCBSL1NpemUgMTMvVHlwZS9YUmVmL1dbMSAyIDBdPj5zdHJlYW0NCmjeYmJkEGBiYJJiYmDQZWJgvA+k45gY/j4Aso0BAgwAISQDuA0KZW5kc3RyZWFtDWVuZG9iag1zdGFydHhyZWYNCjANCiUlRU9GDQogICAgICAgIA0KMTIgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCA1Ny9TIDQ0Pj5zdHJlYW0NCmjeYmBgYGJgYLzCwAgkbRk4GBCAAyjGxMDCwNFwiOGAQvkhJCkGZihmYIhj4GhkSGEACDAAvy4F4g0KZW5kc3RyZWFtDWVuZG9iag03IDAgb2JqDTw8L1BhZ2VzIDUgMCBSL1R5cGUvQ2F0YWxvZz4+DWVuZG9iag04IDAgb2JqDTw8L0Fubm90c1tdL0JsZWVkQm94WzAgMCA1OTUuNDQgODQxLjkyXS9Db250ZW50cyA5IDAgUi9Dcm9wQm94WzAgMCA1OTUuNDQgODQxLjkyXS9NZWRpYUJveFswIDAgNTk1LjQ0IDg0MS45Ml0vUGFyZW50IDUgMCBSL1Jlc291cmNlczw8L1hPYmplY3Q8PC9GbTAgMTAgMCBSPj4+Pi9Sb3RhdGUgMC9UcmltQm94WzAgMCA1OTUuNDQgODQxLjkyXS9UeXBlL1BhZ2U+Pg1lbmRvYmoNOSAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDI2Pj5zdHJlYW0NCkiJKlQwUAjx0XfLNVBwyVcIVAAIMAAiagP4DQplbmRzdHJlYW0NZW5kb2JqDTEwIDAgb2JqDTw8L0JCb3hbMzI3NjguMCAzMjc2OC4wIC0zMjc2OC4wIC0zMjc2OC4wXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggMTQvTWF0cml4WzEgMCAwIDEgMCAwXS9SZXNvdXJjZXM8PD4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KSIkq5ArkAggwAAKSANcNCmVuZHN0cmVhbQ1lbmRvYmoNMSAwIG9iag08PC9Bbm5vdHNbXS9CbGVlZEJveFswIDAgNTk1LjQ0IDg0MS45Ml0vQ29udGVudHMgMiAwIFIvQ3JvcEJveFswIDAgNTk1LjQ0IDg0MS45Ml0vTWVkaWFCb3hbMCAwIDU5NS40NCA4NDEuOTJdL1BhcmVudCA1IDAgUi9SZXNvdXJjZXM8PC9YT2JqZWN0PDwvRm0wIDEwIDAgUj4+Pj4vUm90YXRlIDAvVHJpbUJveFswIDAgNTk1LjQ0IDg0MS45Ml0vVHlwZS9QYWdlPj4NZW5kb2JqDTIgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAyNj4+c3RyZWFtDQpIiSpUMFAI8dF3yzVQcMlXCFQACDAAImoD+A0KZW5kc3RyZWFtDWVuZG9iag0zIDAgb2JqDTw8L0ZpbHRlci9GbGF0ZURlY29kZS9GaXJzdCA0L0xlbmd0aCA1Mi9OIDEvVHlwZS9PYmpTdG0+PnN0cmVhbQ0KaN4yVTBQsLHRd84vzStRMNL3zkwpjrYAigUpGILIWP2QyoJU/YDE9NRiOzuAAAMAETgMkw0KZW5kc3RyZWFtDWVuZG9iag00IDAgb2JqDTw8L0RlY29kZVBhcm1zPDwvQ29sdW1ucyAzL1ByZWRpY3RvciAxMj4+L0ZpbHRlci9GbGF0ZURlY29kZS9JRFs8QkExOTkxRjQxOEI3QjIxMTBBMDA2NzQ1OEI2QkM2MjM+PEY4QTg4RkQzMzM2NDY5NDZCQTU4MzMzQzgwQUQwMUU2Pl0vTGVuZ3RoIDMzL1Jvb3QgNyAwIFIvU2l6ZSA2L1R5cGUvWFJlZi9XWzEgMiAwXT4+c3RyZWFtDQpo3mJiYGBgYmQJY2JgvM/EwBAHpCcwMT56ABBgABstBBINCmVuZHN0cmVhbQ1lbmRvYmoNc3RhcnR4cmVmDQoxMTYNCiUlRU9GDQo=';

const textObject = (x: number, y: number, name = 'a'): Schema => ({
  name,
  type: 'text',
  content: '',
  position: { x, y },
  width: 100,
  height: 20,
  fontSize: 13,
});

describe('pdfme#729 — embed basePdf once across the inputs loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('PDFDocument.load is called exactly once for a custom-PDF basePdf with N inputs', async () => {
    const loadSpy = vi.spyOn(pdfLib.PDFDocument, 'load');

    const template: Template = {
      basePdf: CUSTOM_BASE_PDF,
      schemas: [[textObject(40, 40, 'a')]],
    };
    const inputs = Array.from({ length: 10 }, (_, i) => ({ a: `row-${i}` }));

    await generate({ inputs, template });

    // Before the fix this was 10 (one parse per input); after the fix it's
    // 1, because the basePdf bytes are parsed and embedded once and the
    // resulting PDFEmbeddedPage instances are reused for every input row.
    const basePdfLoads = loadSpy.mock.calls.filter((call) => Boolean(call[0]));

    expect(basePdfLoads.length).toBe(1);
  });

  test('output remains a valid non-empty PDF for N inputs after the embed-once optimisation', async () => {
    const template: Template = {
      basePdf: CUSTOM_BASE_PDF,
      schemas: [[textObject(40, 40, 'a')]],
    };
    const inputs = [{ a: 'first' }, { a: 'second' }, { a: 'third' }];

    const pdf = await generate({ inputs, template });
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);

    const header = Buffer.from(pdf.slice(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  });

  test('blank basePdf still works (no custom-PDF embed needed)', async () => {
    const template: Template = {
      basePdf: BLANK_PDF,
      schemas: [[textObject(20, 20, 'a')]],
    };
    const pdf = await generate({ inputs: [{ a: 'hello' }, { a: 'world' }], template });
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
  });

  test('shares constant image and font resources across 100 output documents', async () => {
    const minimalPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1J' +
      'REFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=';
    const embedPngSpy = vi.spyOn(pdfLib.PDFDocument.prototype, 'embedPng');
    const embedFontSpy = vi.spyOn(pdfLib.PDFDocument.prototype, 'embedFont');
    const renderedClientNames: string[] = [];
    const renderedLogoValues: string[] = [];
    const template: Template = {
      basePdf: BLANK_A4_PDF,
      schemas: [
        [
          textObject(30, 30, 'clientName'),
          {
            name: 'constantLogo',
            type: 'image',
            content: minimalPng,
            readOnly: true,
            position: { x: 160, y: 20 },
            width: 20,
            height: 20,
          },
        ],
      ],
    };
    const inputs = Array.from({ length: 100 }, (_, index) => ({
      clientName: `Client ${String(index + 1).padStart(3, '0')}`,
    }));
    const recordingText = {
      ...text,
      pdf: async (arg: Parameters<typeof text.pdf>[0]) => {
        renderedClientNames.push(arg.value);
        await text.pdf(arg);
      },
    };
    const recordingImage = {
      ...image,
      pdf: async (arg: Parameters<typeof image.pdf>[0]) => {
        renderedLogoValues.push(arg.value);
        await image.pdf(arg);
      },
    };

    const pdf = await generate({
      inputs,
      template,
      plugins: { text: recordingText, image: recordingImage },
    });

    expect(embedPngSpy).toHaveBeenCalledTimes(1);
    expect(embedFontSpy).toHaveBeenCalledTimes(1);
    expect(renderedClientNames).toEqual(inputs.map(({ clientName }) => clientName));
    expect(renderedLogoValues).toEqual(Array.from({ length: 100 }, () => minimalPng));
    const outputDocument = await pdfLib.PDFDocument.load(pdf);
    expect(outputDocument.getPageCount()).toBe(100);
    expect(pdf.byteLength).toBeLessThan(1_000_000);

    const indirectObjects = outputDocument.context
      .enumerateIndirectObjects()
      .map(([, object]) => object);
    const imageStreams = indirectObjects.filter(
      (object) =>
        object instanceof pdfLib.PDFStream &&
        object.dict.get(pdfLib.PDFName.of('Subtype')) === pdfLib.PDFName.of('Image'),
    );
    const fontDictionaries = indirectObjects.filter(
      (object) =>
        object instanceof pdfLib.PDFDict &&
        object.get(pdfLib.PDFName.of('Type')) === pdfLib.PDFName.of('Font'),
    );
    expect(imageStreams.length).toBeGreaterThan(0);
    expect(imageStreams.length).toBeLessThanOrEqual(2);
    expect(fontDictionaries.length).toBeGreaterThan(0);
    expect(fontDictionaries.length).toBeLessThanOrEqual(2);
  });

  test('embeds the full MediaBox when a custom base PDF has a nonzero origin', async () => {
    const sourceDocument = await pdfLib.PDFDocument.create();
    const sourcePage = sourceDocument.addPage([612, 792]);
    sourcePage.setMediaBox(40, 30, 612, 792);
    sourcePage.drawRectangle({ x: 40, y: 30, width: 612, height: 792 });
    const sourceBytes = await sourceDocument.save();
    const outputDocument = await pdfLib.PDFDocument.create();

    const resources = await prepareBasePdfResources({
      basePdf: sourceBytes,
      pdfDoc: outputDocument,
    });

    expect(resources.kind).toBe('custom');
    if (resources.kind !== 'custom') return;
    expect(resources.basePages[0].width).toBeCloseTo(612, 5);
    expect(resources.basePages[0].height).toBeCloseTo(792, 5);
    expect(resources.embedPdfBoxes[0].mediaBox).toEqual({
      x: 40,
      y: 30,
      width: 612,
      height: 792,
    });
  });
});
