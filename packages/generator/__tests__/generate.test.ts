import generate from '../src/generate.js';
import { Template, BLANK_PDF, Schema } from '@pdfweave/common';
import { PDFDocument } from '@pdfweave/pdf-lib';
import { getFont, getImageSnapshotOptions, pdfToImages } from './utils.js';

describe('generate integrate test', () => {
  describe('basic generator', () => {
    const textObject = (x: number, y: number, name: string = 'a'): Schema => ({
      name,
      type: 'text',
      content: '',
      position: { x, y },
      width: 100,
      height: 100,
      fontSize: 13,
    });

    const singleSchemaTemplate: Template = {
      basePdf: BLANK_PDF,
      schemas: [[textObject(0, 0), textObject(25, 25, 'b')]],
    };

    const multiSchemasTemplate: Template = {
      basePdf:
        'data:application/pdf;base64,JVBERi0xLjcNJeLjz9MNCjYgMCBvYmoNPDwvTGluZWFyaXplZCAxL0wgMTg0NC9PIDgvRSAxMTEwL04gMi9UIDE1NzAvSCBbIDQyMyAxMzFdPj4NZW5kb2JqDSAgICAgICAgICAgICAgICAgICAgICAgDQoxMSAwIG9iag08PC9EZWNvZGVQYXJtczw8L0NvbHVtbnMgMy9QcmVkaWN0b3IgMTI+Pi9GaWx0ZXIvRmxhdGVEZWNvZGUvSURbPEJBMTk5MUY0MThCN0IyMTEwQTAwNjc0NThCNkJDNjIzPjxGOEE4OEZEMzMzNjQ2OTQ2QkE1ODMzM0M4MEFEMDFFNj5dL0luZGV4WzYgN10vTGVuZ3RoIDM2L1ByZXYgMTU3MS9Sb290IDcgMCBSL1NpemUgMTMvVHlwZS9YUmVmL1dbMSAyIDBdPj5zdHJlYW0NCmjeYmJkEGBiYJJiYmDQZWJgvA+k45gY/j4Aso0BAgwAISQDuA0KZW5kc3RyZWFtDWVuZG9iag1zdGFydHhyZWYNCjANCiUlRU9GDQogICAgICAgIA0KMTIgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCA1Ny9TIDQ0Pj5zdHJlYW0NCmjeYmBgYGJgYLzCwAgkbRk4GBCAAyjGxMDCwNFwiOGAQvkhJCkGZihmYIhj4GhkSGEACDAAvy4F4g0KZW5kc3RyZWFtDWVuZG9iag03IDAgb2JqDTw8L1BhZ2VzIDUgMCBSL1R5cGUvQ2F0YWxvZz4+DWVuZG9iag04IDAgb2JqDTw8L0Fubm90c1tdL0JsZWVkQm94WzAgMCA1OTUuNDQgODQxLjkyXS9Db250ZW50cyA5IDAgUi9Dcm9wQm94WzAgMCA1OTUuNDQgODQxLjkyXS9NZWRpYUJveFswIDAgNTk1LjQ0IDg0MS45Ml0vUGFyZW50IDUgMCBSL1Jlc291cmNlczw8L1hPYmplY3Q8PC9GbTAgMTAgMCBSPj4+Pi9Sb3RhdGUgMC9UcmltQm94WzAgMCA1OTUuNDQgODQxLjkyXS9UeXBlL1BhZ2U+Pg1lbmRvYmoNOSAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDI2Pj5zdHJlYW0NCkiJKlQwUAjx0XfLNVBwyVcIVAAIMAAiagP4DQplbmRzdHJlYW0NZW5kb2JqDTEwIDAgb2JqDTw8L0JCb3hbMzI3NjguMCAzMjc2OC4wIC0zMjc2OC4wIC0zMjc2OC4wXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggMTQvTWF0cml4WzEgMCAwIDEgMCAwXS9SZXNvdXJjZXM8PD4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KSIkq5ArkAggwAAKSANcNCmVuZHN0cmVhbQ1lbmRvYmoNMSAwIG9iag08PC9Bbm5vdHNbXS9CbGVlZEJveFswIDAgNTk1LjQ0IDg0MS45Ml0vQ29udGVudHMgMiAwIFIvQ3JvcEJveFswIDAgNTk1LjQ0IDg0MS45Ml0vTWVkaWFCb3hbMCAwIDU5NS40NCA4NDEuOTJdL1BhcmVudCA1IDAgUi9SZXNvdXJjZXM8PC9YT2JqZWN0PDwvRm0wIDEwIDAgUj4+Pj4vUm90YXRlIDAvVHJpbUJveFswIDAgNTk1LjQ0IDg0MS45Ml0vVHlwZS9QYWdlPj4NZW5kb2JqDTIgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAyNj4+c3RyZWFtDQpIiSpUMFAI8dF3yzVQcMlXCFQACDAAImoD+A0KZW5kc3RyZWFtDWVuZG9iag0zIDAgb2JqDTw8L0ZpbHRlci9GbGF0ZURlY29kZS9GaXJzdCA0L0xlbmd0aCA1Mi9OIDEvVHlwZS9PYmpTdG0+PnN0cmVhbQ0KaN4yVTBQsLHRd84vzStRMNL3zkwpjrYAigUpGILIWP2QyoJU/YDE9NRiOzuAAAMAETgMkw0KZW5kc3RyZWFtDWVuZG9iag00IDAgb2JqDTw8L0RlY29kZVBhcm1zPDwvQ29sdW1ucyAzL1ByZWRpY3RvciAxMj4+L0ZpbHRlci9GbGF0ZURlY29kZS9JRFs8QkExOTkxRjQxOEI3QjIxMTBBMDA2NzQ1OEI2QkM2MjM+PEY4QTg4RkQzMzM2NDY5NDZCQTU4MzMzQzgwQUQwMUU2Pl0vTGVuZ3RoIDMzL1Jvb3QgNyAwIFIvU2l6ZSA2L1R5cGUvWFJlZi9XWzEgMiAwXT4+c3RyZWFtDQpo3mJiYGBgYmQJY2JgvM/EwBAHpCcwMf56ABBgABstBBINCmVuZHN0cmVhbQ1lbmRvYmoNc3RhcnR4cmVmDQoxMTYNCiUlRU9GDQo=',
      schemas: [[textObject(0, 0)], [textObject(25, 25, 'b')]],
    };

    const singleInputs = [{ a: 'a', b: 'b' }];
    const multiInputs = [
      { a: 'a-1', b: 'b-1' },
      { a: 'a-2', b: 'b-2' },
    ];

    const testCases = [
      {
        template: singleSchemaTemplate,
        inputs: singleInputs,
        testName: 'singleSchemaTemplate with singleInputs',
      },
      {
        template: singleSchemaTemplate,
        inputs: multiInputs,
        testName: 'singleSchemaTemplate with multiInputs',
      },
      {
        template: multiSchemasTemplate,
        inputs: singleInputs,
        testName: 'multiSchemasTemplate with singleInputs',
      },
      {
        template: multiSchemasTemplate,
        inputs: multiInputs,
        testName: 'multiSchemasTemplate with multiInputs',
      },
    ];

    // testCases for
    for (let i = 0; i < testCases.length; i += 1) {
      const { template, inputs, testName } = testCases[i];
      test(testName, async () => {
        const pdf = await generate({ inputs, template });
        const images = await pdfToImages(pdf);
        for (let i = 0; i < images.length; i++) {
          await expect(images[i]).toMatchImage(getImageSnapshotOptions(`${testName}-${i + 1}`));
        }
      });
    }
  });

  describe('use fontColor template', () => {
    test(`sample`, async () => {
      const inputs = [{ name: 'here is purple color' }];
      const template: Template = {
        basePdf: BLANK_PDF,
        schemas: [
          [
            {
              name: 'name',
              type: 'text',
              content: '',
              position: { x: 30, y: 30 },
              width: 100,
              height: 20,
              fontColor: '#7d2ae8',
            },
          ],
        ],
      };
      const pdf = await generate({ inputs, template });
      const images = await pdfToImages(pdf);
      for (let i = 0; i < images.length; i++) {
        await expect(images[i]).toMatchImage(getImageSnapshotOptions(`fontColor-${i + 1}`));
      }
    });
  });

  describe('use fontSubset template', () => {
    test(`sample`, async () => {
      const inputs = [{ field1: 'NotoSansJP', field2: 'NotoSerifJP' }];
      const template: Template = {
        basePdf: BLANK_PDF,
        schemas: [
          [
            {
              name: 'field1',
              type: 'text',
              content: '',
              position: { x: 30, y: 30 },
              width: 100,
              height: 20,
              fontName: 'NotoSansJP',
            },
            {
              name: 'field2',
              type: 'text',
              content: '',
              position: { x: 60, y: 60 },
              width: 100,
              height: 20,
              fontName: 'NotoSerifJP',
            },
          ],
        ],
      };
      const font = getFont();
      const pdf = await generate({
        inputs,
        template,
        options: {
          font: {
            NotoSansJP: {
              ...font.NotoSansJP,
              fallback: true,
              subset: false,
            },
            NotoSerifJP: {
              ...font.NotoSerifJP,
              subset: false,
            },
          },
        },
      });
      const images = await pdfToImages(pdf);
      for (let i = 0; i < images.length; i++) {
        await expect(images[i]).toMatchImage(getImageSnapshotOptions(`fontSubset-${i + 1}`));
      }
      // 90s (was 30s) — full font load + subset disabled + JP image
      // diff is fast locally but exceeds 30s under coverage
      // instrumentation on shared CI runners.
    }, 90000);
  });
});

describe('check validation', () => {
  test(`inputs length is 0`, async () => {
    const inputs: { [key: string]: string }[] = [];
    const template: Template = {
      basePdf: BLANK_PDF,
      schemas: [
        [
          {
            name: 'a',
            type: 'text',
            content: '',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
          },
        ],
      ],
    };
    try {
      await generate({ inputs, template, options: { font: getFont() } });
      fail();
    } catch (e: any) {
      expect(e.message).toEqual(`[@pdfweave/common] Invalid argument:
--------------------------
ERROR POSITION: inputs
ERROR MESSAGE: Too small: expected array to have >=1 items
--------------------------`);
    }
  });
  test(`missing fallback font`, async () => {
    const inputs = [{ a: 'test' }];
    const template: Template = {
      basePdf: BLANK_PDF,
      schemas: [
        [
          {
            name: 'a',
            type: 'text',
            content: '',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
          },
        ],
      ],
    };
    const font = getFont();
    font.Roboto.fallback = false;
    try {
      await generate({ inputs, template, options: { font } });
      fail();
    } catch (e: any) {
      expect(e.message).toEqual(
        `[@pdfweave/common] fallback flag is not found in font. true fallback flag must be only one.
Check this document: https://pdfme.com/docs/custom-fonts#about-font-type`,
      );
    }
  });
  test(`too many fallback font`, async () => {
    const inputs = [{ a: 'test' }];
    const template: Template = {
      basePdf: BLANK_PDF,
      schemas: [
        [
          {
            name: 'a',
            type: 'text',
            content: '',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
          },
        ],
      ],
    };
    const font = getFont();
    // Set multiple fonts to have fallback = true to test the error
    font.Roboto.fallback = true;
    font.NotoSansJP = { ...font.NotoSansJP, fallback: true };
    try {
      await generate({ inputs, template, options: { font } });
      fail();
    } catch (e: any) {
      expect(e.message).toEqual(
        `[@pdfweave/common] 2 fallback flags found in font. true fallback flag must be only one.
Check this document: https://pdfme.com/docs/custom-fonts#about-font-type`,
      );
    }
  });
  describe('basePdf with custom CropBox (pdfme/pdfme#623)', () => {
    /**
     * Builds an in-memory base PDF whose MediaBox and CropBox differ. The
     * CropBox is inset 50pt on every side, simulating a print PDF with bleed
     * in the MediaBox but only the trim area meant to be visible.
     */
    const buildBasePdfWithCropBox = async (): Promise<string> => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([612, 792]);
      page.setMediaBox(0, 0, 612, 792);
      page.setCropBox(50, 50, 512, 692);
      // pdf-lib refuses to embed pages without a Contents stream, so draw a
      // marker rectangle just to give the page something to embed.
      page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 });
      const bytes = await doc.save();
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      return `data:application/pdf;base64,${Buffer.from(binary, 'binary').toString('base64')}`;
    };

    test('preserves the source CropBox on the rendered page', async () => {
      const basePdf = await buildBasePdfWithCropBox();
      const template: Template = {
        basePdf,
        schemas: [
          [
            {
              name: 'a',
              type: 'text',
              content: 'hello',
              position: { x: 0, y: 0 },
              width: 50,
              height: 20,
              fontSize: 12,
            },
          ],
        ],
      };

      const out = await generate({ inputs: [{ a: 'hello' }], template });
      const outDoc = await PDFDocument.load(out);
      const outPage = outDoc.getPages()[0];
      const cropBox = outPage.getCropBox();
      expect(outPage.hasCropBox()).toBe(true);
      expect(cropBox.x).toBeCloseTo(50, 5);
      expect(cropBox.y).toBeCloseTo(50, 5);
      expect(cropBox.width).toBeCloseTo(512, 5);
      expect(cropBox.height).toBeCloseTo(692, 5);
      // MediaBox should remain the source MediaBox.
      const mediaBox = outPage.getMediaBox();
      expect(mediaBox.x).toBeCloseTo(0, 5);
      expect(mediaBox.y).toBeCloseTo(0, 5);
      expect(mediaBox.width).toBeCloseTo(612, 5);
      expect(mediaBox.height).toBeCloseTo(792, 5);
    });

    test('translates top-left schema coordinates into asymmetric CropBox and MediaBox space', async () => {
      const { getPageContentOffset } = await import('../src/helper.js');
      const offsetWithExplicitCrop = getPageContentOffset({
        mediaBox: { x: -40, y: 30, width: 600, height: 800 },
        bleedBox: { x: -40, y: 30, width: 600, height: 800 },
        trimBox: { x: -10, y: 90, width: 500, height: 620 },
        cropBox: { x: -10, y: 90, width: 500, height: 620 },
      });
      // CropBox top is 710pt, while page.getHeight() is 800pt. Schema y is
      // top-down, so its additive offset is 800 - 710 = 90pt.
      expect(offsetWithExplicitCrop).toEqual({ x: -10, y: 90 });

      // With no explicit CropBox, x is the absolute MediaBox x coordinate.
      // The renderer's page.getHeight() excludes MediaBox.y, hence -30pt.
      const offsetNoCrop = getPageContentOffset({
        mediaBox: { x: -40, y: 30, width: 600, height: 800 },
        bleedBox: { x: -40, y: 30, width: 600, height: 800 },
        trimBox: { x: -40, y: 30, width: 600, height: 800 },
      });
      expect(offsetNoCrop).toEqual({ x: -40, y: -30 });
    });
  });

  test(`missing font in template.schemas`, async () => {
    const inputs = [{ a: 'test' }];
    const template: Template = {
      basePdf: BLANK_PDF,
      schemas: [
        [
          {
            name: 'a',
            type: 'text',
            content: '',
            fontName: 'DUMMY_FONT',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
          },
          {
            name: 'b',
            type: 'text',
            content: '',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
          },
        ],
      ],
    };
    try {
      await generate({ inputs, template, options: { font: getFont() } });
      fail();
    } catch (e: any) {
      expect(e.message).toEqual(
        `[@pdfweave/common] DUMMY_FONT of template.schemas is not found in font.
Check this document: https://pdfme.com/docs/custom-fonts`,
      );
    }
  });
});
