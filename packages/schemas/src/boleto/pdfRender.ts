import { mm2pt, pt2mm, type PDFRenderProps } from '@pdfweave/common';
import { LineCapStyle, type PDFImage } from '@pdfweave/pdf-lib';
import type { BarcodeSchema } from '../barcodes/types.js';
import barcodes from '../barcodes/index.js';
import { computeImageFitRect } from '../graphics/image.js';
import text from '../text/index.js';
import type { TextSchema } from '../text/types.js';
import { hex2RgbColor } from '../utils.js';
import { formatDigitableLine } from './digits.js';
import { buildBoletoLayout } from './layout.js';
import {
  getBoletoLogoMemo,
  getBoletoTextValue,
  preflightBoletoLayout,
  preflightBoletoLogo,
} from './renderPreflight.js';
import type { BoletoSchema } from './schema.js';
import { validateBoletoSchema } from './schema.js';
import { BOLETO_ERROR_PREFIX } from './types.js';
import { parseBoletoData } from './validation.js';

const PAGE_BOUNDS_EPSILON_MM = 0.01;

const getPosition = (schema: BoletoSchema, x: number, y: number) => ({
  x: schema.position.x + x,
  y: schema.position.y + y,
});

const assertSchemaFitsPage = (
  schema: BoletoSchema,
  page: PDFRenderProps<BoletoSchema>['page'],
): void => {
  const mediaBox = page.getMediaBox();
  const cropBox = page.hasCropBox() ? page.getCropBox() : mediaBox;
  const visibleBox = {
    left: Math.max(mediaBox.x, cropBox.x),
    bottom: Math.max(mediaBox.y, cropBox.y),
    right: Math.min(mediaBox.x + mediaBox.width, cropBox.x + cropBox.width),
    top: Math.min(mediaBox.y + mediaBox.height, cropBox.y + cropBox.height),
  };
  if (visibleBox.right <= visibleBox.left || visibleBox.top <= visibleBox.bottom) {
    throw new Error('[@pdfweave/schemas/boleto] PDF page has no visible printable area');
  }

  const minimumX = pt2mm(visibleBox.left);
  const maximumX = pt2mm(visibleBox.right);
  const minimumY = pt2mm(page.getHeight() - visibleBox.top);
  const maximumY = pt2mm(page.getHeight() - visibleBox.bottom);
  if (
    schema.position.x < minimumX - PAGE_BOUNDS_EPSILON_MM ||
    schema.position.x + schema.width > maximumX + PAGE_BOUNDS_EPSILON_MM
  ) {
    throw new Error(
      '[@pdfweave/schemas/boleto] Ficha exceeds the PDF page width at its configured position',
    );
  }
  if (
    schema.position.y < minimumY - PAGE_BOUNDS_EPSILON_MM ||
    schema.position.y + schema.height > maximumY + PAGE_BOUNDS_EPSILON_MM
  ) {
    throw new Error(
      '[@pdfweave/schemas/boleto] Ficha exceeds the PDF page height at its configured position',
    );
  }
};

const preflightAndEmbedLogos = async (
  arg: PDFRenderProps<BoletoSchema>,
  values: string[],
): Promise<PDFImage[]> =>
  Promise.all(
    values.map(async (value) => {
      const preflight = await preflightBoletoLogo(value, arg._cache);
      const memo = getBoletoLogoMemo(value, arg._cache);
      const cached = memo.embeddedByDocument.get(arg.pdfDoc);
      if (cached) {
        return cached as Promise<PDFImage>;
      }

      const pending = Promise.resolve()
        .then(() =>
          preflight.kind === 'png' ? arg.pdfDoc.embedPng(value) : arg.pdfDoc.embedJpg(value),
        )
        .catch((error: unknown) => {
          memo.embeddedByDocument.delete(arg.pdfDoc);
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo cannot be decoded: ${detail}`);
        });
      memo.embeddedByDocument.set(arg.pdfDoc, pending);
      return pending;
    }),
  );

const getBarcodeSchema = (schema: BoletoSchema, x: number, y: number): BarcodeSchema => ({
  ...(barcodes.itf.propPanel.defaultSchema as BarcodeSchema),
  name: '__boleto-barcode',
  type: 'itf',
  content: '',
  position: getPosition(schema, x, y),
  width: 103,
  height: 13,
  rotate: 0,
  opacity: 1,
  backgroundColor: '#ffffff',
  barColor: '#000000',
  includetext: false,
  padding: 0,
  paddingtop: 0,
  paddingleft: 0,
  paddingright: 0,
  paddingbottom: 0,
  showBorder: false,
  format: 'svg',
  readOnly: true,
});

export const pdfRender = async (arg: PDFRenderProps<BoletoSchema>): Promise<void> => {
  const { schema, page } = arg;
  validateBoletoSchema(schema, { allowInternalPosition: true });
  assertSchemaFitsPage(schema, page);
  const data = parseBoletoData(arg.value);
  const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
  const resolvedTextSchemas = await preflightBoletoLayout({
    layout,
    font: arg.options.font,
    _cache: arg._cache,
  });
  const embeddedLogos = await preflightAndEmbedLogos(
    arg,
    layout.images.map(({ value }) => value),
  );

  page.drawRectangle({
    x: mm2pt(schema.position.x),
    y: page.getHeight() - mm2pt(schema.position.y + schema.height),
    width: mm2pt(schema.width),
    height: mm2pt(schema.height),
    color: hex2RgbColor('#ffffff'),
    opacity: 1,
  });

  for (const line of layout.lines) {
    page.drawLine({
      start: {
        x: mm2pt(schema.position.x + line.x1),
        y: page.getHeight() - mm2pt(schema.position.y + line.y1),
      },
      end: {
        x: mm2pt(schema.position.x + line.x2),
        y: page.getHeight() - mm2pt(schema.position.y + line.y2),
      },
      thickness: mm2pt(line.thickness),
      color: hex2RgbColor('#000000'),
      opacity: 1,
      lineCap: LineCapStyle.Butt,
    });
  }

  for (const display of layout.vectorDisplays) {
    for (const segment of display.segments) {
      page.drawLine({
        start: {
          x: mm2pt(schema.position.x + display.x + segment.x1),
          y: page.getHeight() - mm2pt(schema.position.y + display.y + segment.y1),
        },
        end: {
          x: mm2pt(schema.position.x + display.x + segment.x2),
          y: page.getHeight() - mm2pt(schema.position.y + display.y + segment.y2),
        },
        thickness: mm2pt(display.strokeWidth),
        color: hex2RgbColor('#000000'),
        opacity: 1,
        lineCap: LineCapStyle.Round,
      });
    }
  }

  for (const primitive of layout.texts) {
    const resolvedSchema = resolvedTextSchemas.get(primitive.id);
    if (!resolvedSchema) {
      throw new Error(
        `[@pdfweave/schemas/boleto] Missing resolved text schema for "${primitive.id}"`,
      );
    }
    await text.pdf({
      ...arg,
      value: getBoletoTextValue(primitive),
      schema: {
        ...resolvedSchema,
        position: getPosition(schema, primitive.x, primitive.y),
      },
    } as PDFRenderProps<TextSchema>);
  }

  for (const primitive of layout.images) {
    const pdfImage = embeddedLogos.shift();
    if (!pdfImage) {
      throw new Error('[@pdfweave/schemas/boleto] Institution logo was not preflighted');
    }
    const fit = computeImageFitRect(
      pdfImage.width,
      pdfImage.height,
      primitive.width,
      primitive.height,
      'contain',
      { x: 'center', y: 'middle' },
    );
    const top = schema.position.y + primitive.y + fit.offsetY;
    page.drawImage(pdfImage, {
      x: mm2pt(schema.position.x + primitive.x + fit.offsetX),
      y: page.getHeight() - mm2pt(top + fit.height),
      width: mm2pt(fit.width),
      height: mm2pt(fit.height),
      opacity: 1,
    });
  }

  if (layout.barcode) {
    await barcodes.itf.pdf({
      ...arg,
      value: layout.barcode.value,
      schema: getBarcodeSchema(schema, layout.barcode.x, layout.barcode.y),
    });
  }
};
