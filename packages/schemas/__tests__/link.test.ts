import * as pdfLib from '@pdfweave/pdf-lib';
import { BLANK_PDF } from '@pdfweave/common';
import link, { type LinkSchema } from '../src/link/index.js';

describe('link schema', () => {
  it('renders a PDF link annotation with the configured URL', async () => {
    const url = 'https://pdfweave.dev/docs';
    const pdfDoc = await pdfLib.PDFDocument.create();
    const page = pdfDoc.addPage([pdfLib.PageSizes.A4[0], pdfLib.PageSizes.A4[1]]);
    const schema: LinkSchema = {
      name: 'docs',
      type: 'link',
      position: { x: 20, y: 20 },
      width: 50,
      height: 10,
      url,
      label: 'PDFweave docs',
      color: '#0066cc',
      underline: true,
      fontSize: 12,
    };

    await link.pdf({
      value: '',
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: {},
      _cache: new Map(),
    });

    const parsedPdf = await pdfLib.PDFDocument.load(await pdfDoc.save());
    const annots = parsedPdf.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);

    const annotation = annots!.lookup(0, pdfLib.PDFDict);
    expect(annotation.lookup(pdfLib.PDFName.of('Subtype'), pdfLib.PDFName).asString()).toBe(
      '/Link',
    );

    const action = annotation.lookup(pdfLib.PDFName.of('A'), pdfLib.PDFDict);
    expect(action.lookup(pdfLib.PDFName.of('S'), pdfLib.PDFName).asString()).toBe('/URI');
    expect(action.lookup(pdfLib.PDFName.of('URI'), pdfLib.PDFString).decodeText()).toBe(url);
  });
});
