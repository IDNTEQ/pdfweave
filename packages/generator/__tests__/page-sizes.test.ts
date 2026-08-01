import { mm2pt, type Template } from '@pdfweave/common';
import { PDFDocument } from '@pdfweave/pdf-lib';
import { text } from '@pdfweave/schemas';
import generate from '../src/generate.js';

describe('production paper sizes', () => {
  const sizes = [
    { name: 'A3', width: 297, height: 420 },
    { name: 'A2', width: 420, height: 594 },
  ];

  test.each(sizes)(
    'renders a portrait $name page from millimetre dimensions',
    async ({ width, height }) => {
      const template: Template = {
        basePdf: { width, height, padding: [0, 0, 0, 0] },
        schemas: [
          [
            {
              name: 'paperSizeLabel',
              type: 'text',
              content: 'Production page size',
              readOnly: true,
              position: { x: 10, y: 10 },
              width: 80,
              height: 10,
            },
          ],
        ],
      };

      const bytes = await generate({ template, inputs: [{}], plugins: { text } });
      const document = await PDFDocument.load(bytes);
      const page = document.getPage(0);

      expect(document.getPageCount()).toBe(1);
      expect(page.getWidth()).toBeCloseTo(mm2pt(width), 5);
      expect(page.getHeight()).toBeCloseTo(mm2pt(height), 5);
    },
  );

  test.each(sizes)('preserves an empty portrait $name page', async ({ width, height }) => {
    const template: Template = {
      basePdf: { width, height, padding: [0, 0, 0, 0] },
      schemas: [[]],
    };

    const bytes = await generate({ template, inputs: [{}] });
    const document = await PDFDocument.load(bytes);
    const page = document.getPage(0);

    expect(document.getPageCount()).toBe(1);
    expect(page.getWidth()).toBeCloseTo(mm2pt(width), 5);
    expect(page.getHeight()).toBeCloseTo(mm2pt(height), 5);
  });

  test('preserves interior and trailing blank pages in generated output', async () => {
    const template: Template = {
      basePdf: { width: 297, height: 420, padding: [0, 0, 0, 0] },
      schemas: [
        [],
        [
          {
            name: 'middlePageLabel',
            type: 'text',
            content: 'Middle page',
            readOnly: true,
            position: { x: 10, y: 10 },
            width: 80,
            height: 10,
          },
        ],
        [],
      ],
    };

    const bytes = await generate({ template, inputs: [{}], plugins: { text } });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(3);
    for (const page of document.getPages()) {
      expect(page.getWidth()).toBeCloseTo(mm2pt(297), 5);
      expect(page.getHeight()).toBeCloseTo(mm2pt(420), 5);
    }
  });
});
