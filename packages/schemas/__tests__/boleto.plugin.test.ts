// @vitest-environment jsdom

import * as fontkit from 'fontkit';
import jpeg from 'jpeg-js';
import { BLANK_PDF, getDefaultFont, mm2pt, type PDFRenderProps } from '@pdfweave/common';
import { JpegEmbedder, PDFDocument, PngEmbedder, toUint8Array } from '@pdfweave/pdf-lib';
import * as pdfLib from '@pdfweave/pdf-lib';
import boleto from '../src/boleto/index.js';
import imagePlugin from '../src/graphics/image.js';
import {
  BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
  BOLETO_BARCODE_HEIGHT_MM,
  BOLETO_BARCODE_LEFT_MM,
  BOLETO_BARCODE_WIDTH_MM,
  BOLETO_GRID_STROKE_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
  BOLETO_PIX_QR_SIZE_MM,
  buildBoletoLayout,
} from '../src/boleto/layout.js';
import {
  assertBoletoLogoDimensions,
  BOLETO_LOGO_MAX_DIMENSION_PX,
  BOLETO_LOGO_MAX_JPEG_DECODE_MEMORY_MB,
  BOLETO_LOGO_MAX_PIXELS,
  getBoletoLogoCacheKey,
  getBoletoLogoMemo,
  preflightBoletoLayout,
  preflightBoletoLogo,
} from '../src/boleto/renderPreflight.js';
import { BOLETO_FICHA_MIN_WIDTH_MM } from '../src/boleto/schema.js';
import { formatDigitableLine } from '../src/boleto/digits.js';
import type { BoletoSchema } from '../src/boleto/schema.js';
import type { BoletoData } from '../src/boleto/types.js';

const ITAU_BARCODE = '34196166700000123451101234567880057123457000';
const VALID_PIX_PAYLOAD =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
const OVER_DENSE_VALID_PIX_PAYLOAD =
  '00020101021226990014br.gov.bcb.pix2577pix.example.test/cobv/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5204000053039865502015802BR5925aaaaaaaaaaaaaaaaaaaaaaaaa6015aaaaaaaaaaaaaaa61080131010062290525aaaaaaaaaaaaaaaaaaaaaaaaa6304CC48';
const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TWO_FRAME_APNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAACGFjVEwAAAACAAAAAPONk3AAAAAGUExURf8AAAAA/2yh/Y4AAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAGQD6AAAs35jzQAAAApJREFUeJxjYAAAAAIAAUivpHEAAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAGQD6AABXwq5jwAAAA5mZEFUAAAAAnicY2gAAACCAIEF0jlmAAAAAElFTkSuQmCC';
const TRUNCATED_AFTER_PNG_HEADER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC';
const toJpegDataUri = (bytes: Uint8Array): string =>
  `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
const ONE_PIXEL_JPEG_BYTES = Uint8Array.from(
  jpeg.encode(
    {
      width: 1,
      height: 1,
      data: Uint8Array.from([25, 100, 200, 255]),
    },
    90,
  ).data,
);
const ONE_PIXEL_JPEG = toJpegDataUri(ONE_PIXEL_JPEG_BYTES);
const TRUNCATED_JPEG_SCAN = toJpegDataUri(ONE_PIXEL_JPEG_BYTES.slice(0, -4));
const SOI_APP_SOF_ONLY_JPEG = toJpegDataUri(
  Uint8Array.from([
    255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 192, 0, 11, 8, 0,
    1, 0, 1, 1, 1, 17, 0,
  ]),
);
const toPngHeaderDataUri = (width: number, height: number): string => {
  const bytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
};

const measureQrQuietZoneModules = (svgSource: string) => {
  const svgDocument = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
  const svg = svgDocument.documentElement;
  const viewBox = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const pathData = svg.querySelector('path')?.getAttribute('d') ?? '';
  const coordinates = pathData
    .split(/[MLZ]/)
    .filter(Boolean)
    .map((command) => {
      const [x, y] = command.trim().split(' ');
      return { x: Number(x), y: Number(y) };
    });
  const [viewX, viewY, viewWidth, viewHeight] = viewBox;
  const finderStart = coordinates.at(0);
  const finderEnd = coordinates.at(1);
  if (
    viewBox.length !== 4 ||
    [viewX, viewY, viewWidth, viewHeight].some((value) => !Number.isFinite(value)) ||
    !finderStart ||
    !finderEnd ||
    finderStart.y !== finderEnd.y
  ) {
    throw new Error('Expected a measurable bwip-js QR SVG');
  }

  // bwip-js begins the QR path with the seven-module outer edge of the lower-left finder.
  const moduleSize = Math.abs(finderEnd.x - finderStart.x) / 7;
  const xValues = coordinates.map(({ x }) => x);
  const yValues = coordinates.map(({ y }) => y);
  return {
    left: (Math.min(...xValues) - viewX) / moduleSize,
    right: (viewX + viewWidth - Math.max(...xValues)) / moduleSize,
    top: (Math.min(...yValues) - viewY) / moduleSize,
    bottom: (viewY + viewHeight - Math.max(...yValues)) / moduleSize,
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createData = (): BoletoData => ({
  version: 1,
  kind: 'cobranca',
  registrationStatus: 'test',
  institution: { name: 'Itau Unibanco S.A.', code: '341', codeDigit: '7' },
  beneficiaryMode: 'direct',
  beneficiary: {
    name: 'Empresa Exemplo Ltda.',
    taxId: { type: 'cnpj', number: '04.252.011/0001-10' },
    address: {
      street: 'Avenida Paulista',
      number: '1000',
      city: 'Sao Paulo',
      state: 'SP',
      postalCode: '01310-100',
    },
  },
  payer: {
    name: 'Maria da Silva',
    taxId: { type: 'cpf', number: '529.982.247-25' },
    address: {
      street: 'Rua das Flores',
      number: '42',
      city: 'Curitiba',
      state: 'PR',
      postalCode: '80000-000',
    },
  },
  paymentLocation: 'Pagavel em qualquer banco ate o vencimento.',
  dueDate: '2026-12-21',
  amountMode: 'fixed',
  documentValueCents: 12_345,
  barcode: ITAU_BARCODE,
});

const withData = (overrides: Partial<BoletoData>): BoletoData =>
  ({ ...createData(), ...overrides }) as BoletoData;

const schema: BoletoSchema = {
  name: 'boleto',
  type: 'boleto',
  variant: 'ficha-compensacao',
  content: '',
  position: { x: 5, y: 20 },
  width: 200,
  height: 95,
  rotate: 0,
  opacity: 1,
};

describe('boleto PDF plugin', () => {
  it('preflights minimum-width line text with the configured font and fixed vertical size', async () => {
    const minimumSchema = { ...schema, width: BOLETO_FICHA_MIN_WIDTH_MM };
    const data = withData({ registrationStatus: 'registered' });
    const layout = buildBoletoLayout(data, minimumSchema, formatDigitableLine(data.barcode));
    const line = layout.texts.find(({ id }) => id === 'digitable-line');
    if (!line) throw new Error('Expected a minimum-width digitable line');

    const resolved = await preflightBoletoLayout({
      layout,
      font: getDefaultFont(),
      _cache: new Map(),
    });
    const lineSchema = resolved.get('digitable-line');

    expect(line.horizontalScale).toBeLessThan(1);
    expect(lineSchema).toMatchObject({ fontName: 'Roboto', fontSize: 14 });
    expect(lineSchema?.width).toBeCloseTo(line.width / (line.horizontalScale ?? 1), 10);
    expect(resolved.get('mechanical-authentication')?.fontName).toBe('Roboto');
  });

  it('wraps minimum-width PDF line text in an anchored horizontal transform', async () => {
    const minimumSchema = { ...schema, width: BOLETO_FICHA_MIN_WIDTH_MM };
    const data = withData({ registrationStatus: 'registered' });
    const layout = buildBoletoLayout(data, minimumSchema, formatDigitableLine(data.barcode));
    const line = layout.texts.find(({ id }) => id === 'digitable-line');
    if (!line?.horizontalScale) throw new Error('Expected a scaled minimum-width digitable line');
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const pushOperators = vi.spyOn(page, 'pushOperators');

    try {
      await boleto.pdf({
        value: JSON.stringify(data),
        schema: minimumSchema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>);

      const operatorCalls = pushOperators.mock.calls.map((operators) =>
        operators.map((operator) => operator.toString()),
      );
      const transformCallIndex = operatorCalls.findIndex(
        (operators) => operators[0] === 'q' && operators[1]?.endsWith(' cm'),
      );
      expect(transformCallIndex).toBeGreaterThanOrEqual(0);
      const transform = operatorCalls[transformCallIndex]?.[1]?.split(' ').map(Number);
      expect(transform).toBeDefined();
      if (!transform) throw new Error('Expected a PDF transformation matrix');
      const [scaleX, skewX, skewY, scaleY, translateX, translateY] = transform;
      const anchorX = mm2pt(minimumSchema.position.x + line.x);
      expect(scaleX).toBeCloseTo(line.horizontalScale, 8);
      expect(skewX).toBe(0);
      expect(skewY).toBe(0);
      expect(scaleY).toBe(1);
      expect(translateX).toBeCloseTo(anchorX * (1 - line.horizontalScale), 8);
      expect(translateY).toBe(0);
      const restoreCallIndex = operatorCalls.findIndex(
        (operators, index) =>
          index > transformCallIndex && operators.length === 1 && operators[0] === 'Q',
      );
      expect(restoreCallIndex).toBeGreaterThan(transformCallIndex);
    } finally {
      pushOperators.mockRestore();
    }
  });

  it('draws one exact 103 x 13 mm SVG barcode and saves a reloadable PDF', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawLine = vi.spyOn(page, 'drawLine');
    const svgCalls: Array<{ svg: string; options: Record<string, number> }> = [];
    const originalDrawSvg = page.drawSvg.bind(page);
    page.drawSvg = async (svg, options = {}) => {
      svgCalls.push({ svg, options: options as Record<string, number> });
      await originalDrawSvg(svg, options);
    };

    const data = withData({ registrationStatus: 'registered' });
    await boleto.pdf({
      value: JSON.stringify(data),
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: { font: getDefaultFont() },
      _cache: new Map(),
    } as PDFRenderProps<BoletoSchema>);

    expect(svgCalls).toHaveLength(1);
    expect(svgCalls[0]?.svg).toContain('<svg');
    expect(svgCalls[0]?.options.width).toBeCloseTo(mm2pt(BOLETO_BARCODE_WIDTH_MM), 5);
    expect(svgCalls[0]?.options.height).toBeCloseTo(mm2pt(BOLETO_BARCODE_HEIGHT_MM), 5);
    expect(svgCalls[0]?.options.x).toBeCloseTo(
      mm2pt(schema.position.x + BOLETO_BARCODE_LEFT_MM),
      5,
    );
    const barcodeTop =
      schema.position.y +
      schema.height -
      BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM -
      BOLETO_BARCODE_HEIGHT_MM / 2;
    expect(svgCalls[0]?.options.y).toBeCloseTo(page.getHeight() - mm2pt(barcodeTop), 5);

    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
    expect(drawLine).toHaveBeenCalledTimes(layout.lines.length);
    const gridCalls = drawLine.mock.calls;
    expect(gridCalls.every(([options]) => options.lineCap === pdfLib.LineCapStyle.Butt)).toBe(true);
    expect(gridCalls[0]?.[0].start.x).toBeCloseTo(mm2pt(schema.position.x), 5);
    expect(gridCalls[0]?.[0].start.y).toBeCloseTo(
      page.getHeight() - mm2pt(schema.position.y + BOLETO_GRID_STROKE_MM / 2),
      5,
    );
    expect(layout.texts.find(({ id }) => id === 'institution-code')?.value).toBe('341-7');
    expect(layout.texts.find(({ id }) => id === 'digitable-line')?.value).toBe(
      formatDigitableLine(data.barcode),
    );
    expect(layout.texts.find(({ id }) => id === 'mechanical-authentication')?.value).toBe(
      BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
    );

    const bytes = await pdfDoc.save();
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getPage(0).getSize()).toEqual({ width: mm2pt(210), height: mm2pt(297) });
  });

  it('omits payable identifiers from test-mode PDF output', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const data = createData();

    await boleto.pdf({
      value: JSON.stringify(data),
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: { font: getDefaultFont() },
      _cache: new Map(),
    } as PDFRenderProps<BoletoSchema>);

    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
    expect(layout.barcode).toBeUndefined();
    expect(layout.texts.find(({ id }) => id === 'digitable-line')).toBeUndefined();
    expect(drawSvg).not.toHaveBeenCalled();
    expect((await PDFDocument.load(await pdfDoc.save())).getPageCount()).toBe(1);
  });

  it('renders a validated Pix payload with four quiet modules in one fixed-size QR code', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const data = withData({
      testPaymentIdentifiers: 'render',
      pix: { emvPayload: VALID_PIX_PAYLOAD, placement: 'instructions-right' },
    });

    await boleto.pdf({
      value: JSON.stringify(data),
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: { font: getDefaultFont() },
      _cache: new Map(),
    } as PDFRenderProps<BoletoSchema>);

    expect(drawSvg).toHaveBeenCalledTimes(2);
    const qrCodeCall = drawSvg.mock.calls.find(
      ([, options]) => options?.width === mm2pt(BOLETO_PIX_QR_SIZE_MM),
    );
    expect(qrCodeCall?.[1]).toMatchObject({
      width: mm2pt(BOLETO_PIX_QR_SIZE_MM),
      height: mm2pt(BOLETO_PIX_QR_SIZE_MM),
    });
    const quietZoneModules = measureQrQuietZoneModules(qrCodeCall?.[0] ?? '');
    expect(Object.values(quietZoneModules).every((modules) => modules >= 4)).toBe(true);
    expect((await PDFDocument.load(await pdfDoc.save())).getPageCount()).toBe(1);
  });

  it('rejects an over-dense Pix QR before drawing PDF content', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawRectangle = vi.spyOn(page, 'drawRectangle');
    const data = withData({
      testPaymentIdentifiers: 'render',
      pix: { emvPayload: OVER_DENSE_VALID_PIX_PAYLOAD, placement: 'instructions-right' },
    });

    await expect(
      boleto.pdf({
        value: JSON.stringify(data),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow('Pix payload requires a 61 x 61 QR symbol');
    expect(drawRectangle).not.toHaveBeenCalled();
  });

  it.each([
    ['without Pix', undefined],
    ['with Pix', { emvPayload: VALID_PIX_PAYLOAD, placement: 'instructions-right' } as const],
  ])(
    'preflights three maximum-length unbroken instruction lanes at minimum width %s',
    async (_case, pix) => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
      const minimumSchema: BoletoSchema = {
        ...schema,
        width: 170,
        height: 95,
      };
      const data = withData({
        registrationStatus: 'registered',
        instructions: Array.from(
          { length: 3 },
          (_, index) => `${String(index + 1)}${'W'.repeat(179)}`,
        ),
        pix,
      });

      await expect(
        boleto.pdf({
          value: JSON.stringify(data),
          schema: minimumSchema,
          basePdf: BLANK_PDF,
          pdfLib,
          pdfDoc,
          page,
          options: { font: getDefaultFont() },
          _cache: new Map(),
        } as PDFRenderProps<BoletoSchema>),
      ).resolves.toBeUndefined();
      expect((await pdfDoc.save()).byteLength).toBeGreaterThan(1000);
    },
  );

  it('fails closed before drawing anything when structured data is invalid', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');

    await expect(
      boleto.pdf({
        value: '{not valid json',
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow('[@pdfweave/schemas/boleto] boleto data must be an object or valid JSON');
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
  });

  it.each([
    ['width', { x: 11, y: 20 }],
    ['height', { x: 5, y: 203 }],
  ])(
    'rejects a ficha outside the physical page %s before drawing anything',
    async (edge, position) => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
      const drawLine = vi.spyOn(page, 'drawLine');
      const drawSvg = vi.spyOn(page, 'drawSvg');

      await expect(
        boleto.pdf({
          value: JSON.stringify(createData()),
          schema: { ...schema, position },
          basePdf: BLANK_PDF,
          pdfLib,
          pdfDoc,
          page,
          options: { font: getDefaultFont() },
          _cache: new Map(),
        } as PDFRenderProps<BoletoSchema>),
      ).rejects.toThrow(`Ficha exceeds the PDF page ${edge}`);
      expect(drawLine).not.toHaveBeenCalled();
      expect(drawSvg).not.toHaveBeenCalled();
    },
  );

  it('renders generator-adjusted negative positions when the ficha fits the CropBox', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(230), mm2pt(140)]);
    page.setMediaBox(mm2pt(-25.4), mm2pt(25.4), mm2pt(230), mm2pt(140));
    page.setCropBox(mm2pt(-13.4), mm2pt(32.4), mm2pt(210), mm2pt(120));
    const internalPosition = {
      x: -13.4 + 5,
      y: 140 - 32.4 - 120 + 10,
    };
    const drawRectangle = vi.spyOn(page, 'drawRectangle');

    expect(internalPosition.x).toBeLessThan(0);
    expect(internalPosition.y).toBeLessThan(0);
    await boleto.pdf({
      value: JSON.stringify(createData()),
      schema: { ...schema, position: internalPosition },
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: { font: getDefaultFont() },
      _cache: new Map(),
    } as PDFRenderProps<BoletoSchema>);

    const backing = drawRectangle.mock.calls.at(0)?.[0];
    expect(backing?.x).toBeCloseTo(mm2pt(internalPosition.x), 5);
    expect(backing?.y).toBeCloseTo(page.getHeight() - mm2pt(internalPosition.y + schema.height), 5);
    expect(backing?.width).toBeCloseTo(mm2pt(schema.width), 5);
    expect(backing?.height).toBeCloseTo(mm2pt(schema.height), 5);
    expect((await pdfDoc.save()).byteLength).toBeGreaterThan(1_000);
  });

  it('rejects a ficha clipped by CropBox even when it remains inside MediaBox', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(230), mm2pt(140)]);
    page.setMediaBox(mm2pt(-25.4), mm2pt(25.4), mm2pt(230), mm2pt(140));
    page.setCropBox(mm2pt(-13.4), mm2pt(32.4), mm2pt(210), mm2pt(120));
    const internalPosition = {
      x: -13.4 + 11,
      y: 140 - 32.4 - 120 + 10,
    };
    const drawRectangle = vi.spyOn(page, 'drawRectangle');
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');

    await expect(
      boleto.pdf({
        value: JSON.stringify(createData()),
        schema: { ...schema, position: internalPosition },
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow('Ficha exceeds the PDF page width');
    expect(drawRectangle).not.toHaveBeenCalled();
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
  });

  it.each([
    ['an overlong edge', BOLETO_LOGO_MAX_DIMENSION_PX + 1, 1],
    ['an excessive pixel count', 2001, 2000],
  ])('rejects a logo with %s before decode or drawing', async (_case, width, height) => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const decode = vi.spyOn(PngEmbedder, 'for');
    const embedPng = vi.spyOn(pdfDoc, 'embedPng');
    const drawRectangle = vi.spyOn(page, 'drawRectangle');
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const data = createData();
    data.institution = {
      ...data.institution,
      logo: toPngHeaderDataUri(width, height),
    };

    try {
      await expect(
        boleto.pdf({
          value: JSON.stringify(data),
          schema,
          basePdf: BLANK_PDF,
          pdfLib,
          pdfDoc,
          page,
          options: { font: getDefaultFont() },
          _cache: new Map(),
        } as PDFRenderProps<BoletoSchema>),
      ).rejects.toThrow(/dimensions are invalid or exceed the safe rendering limit/i);
      expect(decode).not.toHaveBeenCalled();
      expect(embedPng).not.toHaveBeenCalled();
      expect(drawRectangle).not.toHaveBeenCalled();
      expect(drawLine).not.toHaveBeenCalled();
      expect(drawSvg).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('rejects data that cannot fit at the minimum font size before drawing', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const payer = createData().payer;
    const oversizedPayer = {
      ...payer,
      name: 'A'.repeat(150),
      address: {
        ...payer.address,
        street: 'R'.repeat(150),
        complement: 'C'.repeat(100),
        district: 'D'.repeat(100),
        city: 'M'.repeat(100),
      },
    };

    await expect(
      boleto.pdf({
        value: JSON.stringify(withData({ payer: oversizedPayer })),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow('Text field "payer-value" does not fit');
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
  });

  it('fully decodes logos before drawing and fails closed after a valid PNG header', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const embedPng = vi.spyOn(pdfDoc, 'embedPng');
    const decode = vi.spyOn(PngEmbedder, 'for');
    const data = createData();
    data.institution = {
      ...data.institution,
      logo: TRUNCATED_AFTER_PNG_HEADER,
    };

    await expect(
      boleto.pdf({
        value: JSON.stringify(data),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow(/Institution logo/i);
    expect(embedPng).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
    decode.mockRestore();
  });

  it('rejects animated PNG logos before structural decode or drawing', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const decode = vi.spyOn(PngEmbedder, 'for');
    const embedPng = vi.spyOn(pdfDoc, 'embedPng');
    const drawRectangle = vi.spyOn(page, 'drawRectangle');
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const data = createData();
    data.institution = { ...data.institution, logo: TWO_FRAME_APNG };

    await expect(
      boleto.pdf({
        value: JSON.stringify(data),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow(
      '[@pdfweave/schemas/boleto] Institution logo cannot be decoded: Animated PNGs are not supported',
    );
    expect(decode).not.toHaveBeenCalled();
    expect(embedPng).not.toHaveBeenCalled();
    expect(drawRectangle).not.toHaveBeenCalled();
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
    decode.mockRestore();
  });

  it.each([
    ['truncated scan data', TRUNCATED_JPEG_SCAN],
    ['SOI/APP/SOF metadata without scan data', SOI_APP_SOF_ONLY_JPEG],
  ])('fully decodes JPEG logos and rejects %s before drawing', async (_case, logo) => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const drawRectangle = vi.spyOn(page, 'drawRectangle');
    const drawLine = vi.spyOn(page, 'drawLine');
    const drawSvg = vi.spyOn(page, 'drawSvg');
    const embedJpg = vi.spyOn(pdfDoc, 'embedJpg');
    const data = createData();
    data.institution = { ...data.institution, logo };

    await expect(
      boleto.pdf({
        value: JSON.stringify(data),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: new Map(),
      } as PDFRenderProps<BoletoSchema>),
    ).rejects.toThrow(/Institution logo cannot be decoded/i);
    expect(embedJpg).not.toHaveBeenCalled();
    expect(drawRectangle).not.toHaveBeenCalled();
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawSvg).not.toHaveBeenCalled();
  });

  it('fully decodes and embeds a valid JPEG logo', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const embedJpg = vi.spyOn(pdfDoc, 'embedJpg');
    const data = createData();
    data.institution = { ...data.institution, logo: ONE_PIXEL_JPEG };

    await boleto.pdf({
      value: JSON.stringify(data),
      schema,
      basePdf: BLANK_PDF,
      pdfLib,
      pdfDoc,
      page,
      options: { font: getDefaultFont() },
      _cache: new Map(),
    } as PDFRenderProps<BoletoSchema>);

    expect(embedJpg).toHaveBeenCalledTimes(1);
    expect((await PDFDocument.load(await pdfDoc.save())).getPageCount()).toBe(1);
  });

  it('embeds one shared logo resource across repeated boleto renders', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const firstPage = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const secondPage = pdfDoc.addPage([mm2pt(210), mm2pt(297)]);
    const embedPng = vi.spyOn(pdfDoc, 'embedPng');
    const cache = new Map<string | number, unknown>();
    const data = createData();
    data.institution = { ...data.institution, logo: ONE_PIXEL_PNG };

    for (const page of [firstPage, secondPage]) {
      await boleto.pdf({
        value: JSON.stringify(data),
        schema,
        basePdf: BLANK_PDF,
        pdfLib,
        pdfDoc,
        page,
        options: { font: getDefaultFont() },
        _cache: cache,
      } as PDFRenderProps<BoletoSchema>);
    }

    expect(embedPng).toHaveBeenCalledTimes(1);
    const logoCacheKeys = [...cache.keys()].filter(
      (key): key is string => typeof key === 'string' && key.startsWith('boleto-logo:'),
    );
    expect(logoCacheKeys).toHaveLength(1);
    expect(logoCacheKeys[0]?.length).toBeLessThan(80);
    expect(logoCacheKeys[0]).not.toContain(ONE_PIXEL_PNG);
    const bytes = await pdfDoc.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

describe('boleto logo preflight cache', () => {
  it.each([
    ['the maximum edge', BOLETO_LOGO_MAX_DIMENSION_PX, 1953],
    ['the maximum pixel count', 2000, BOLETO_LOGO_MAX_PIXELS / 2000],
  ])('accepts %s boundary', (_case, width, height) => {
    expect(() => assertBoletoLogoDimensions({ width, height })).not.toThrow();
  });

  it.each([
    ['a zero edge', 0, 1],
    ['a non-finite edge', Number.POSITIVE_INFINITY, 1],
    ['a fractional edge', 1.5, 1],
    ['an edge above the limit', BOLETO_LOGO_MAX_DIMENSION_PX + 1, 1],
    ['a pixel count above the limit', 2001, 2000],
  ])('rejects %s', (_case, width, height) => {
    expect(() => assertBoletoLogoDimensions({ width, height })).toThrow(
      'dimensions are invalid or exceed the safe rendering limit',
    );
  });

  it('uses a compact key and decodes a valid logo once per shared cache', async () => {
    const cache = new Map<string | number, unknown>();
    const decode = vi.spyOn(PngEmbedder, 'for');
    try {
      await preflightBoletoLogo(ONE_PIXEL_PNG, cache);
      await preflightBoletoLogo(ONE_PIXEL_PNG, cache);

      expect(decode).toHaveBeenCalledTimes(1);
      const cacheKey = getBoletoLogoCacheKey(ONE_PIXEL_PNG);
      expect(cacheKey.length).toBeLessThan(80);
      expect(cacheKey).not.toContain(ONE_PIXEL_PNG);
      expect(cache.has(cacheKey)).toBe(true);
    } finally {
      decode.mockRestore();
    }
  });

  it('coalesces concurrent structural validation and clears the pending operation', async () => {
    const cache = new Map<string | number, unknown>();
    const decoded = await PngEmbedder.for(toUint8Array(ONE_PIXEL_PNG));
    const deferred = createDeferred<typeof decoded>();
    const decode = vi.spyOn(PngEmbedder, 'for').mockReturnValue(deferred.promise);
    try {
      const first = preflightBoletoLogo(ONE_PIXEL_PNG, cache);
      const second = preflightBoletoLogo(ONE_PIXEL_PNG, cache);

      expect(decode).toHaveBeenCalledTimes(1);
      deferred.resolve(decoded);
      await expect(Promise.all([first, second])).resolves.toEqual([
        { kind: 'png', width: 1, height: 1 },
        { kind: 'png', width: 1, height: 1 },
      ]);

      const memo = getBoletoLogoMemo(ONE_PIXEL_PNG, cache);
      expect(memo.structural).toEqual({ kind: 'png', width: 1, height: 1 });
      expect(memo.pendingStructural).toBeUndefined();
      expect(memo.pendingStructuralToken).toBeUndefined();
    } finally {
      decode.mockRestore();
    }
  });

  it('coalesces concurrent failures, clears them, and permits a retry', async () => {
    const cache = new Map<string | number, unknown>();
    const decoded = await PngEmbedder.for(toUint8Array(ONE_PIXEL_PNG));
    const deferred = createDeferred<typeof decoded>();
    const decode = vi.spyOn(PngEmbedder, 'for').mockReturnValue(deferred.promise);
    try {
      const first = preflightBoletoLogo(ONE_PIXEL_PNG, cache);
      const second = preflightBoletoLogo(ONE_PIXEL_PNG, cache);
      const results = Promise.allSettled([first, second]);

      expect(decode).toHaveBeenCalledTimes(1);
      deferred.reject(new Error('synthetic decode failure'));
      await expect(results).resolves.toEqual([
        expect.objectContaining({ status: 'rejected' }),
        expect.objectContaining({ status: 'rejected' }),
      ]);

      const memo = getBoletoLogoMemo(ONE_PIXEL_PNG, cache);
      expect(memo.structural).toBeUndefined();
      expect(memo.pendingStructural).toBeUndefined();
      expect(memo.pendingStructuralToken).toBeUndefined();

      decode.mockResolvedValue(decoded);
      await expect(preflightBoletoLogo(ONE_PIXEL_PNG, cache)).resolves.toEqual({
        kind: 'png',
        width: 1,
        height: 1,
      });
      expect(decode).toHaveBeenCalledTimes(2);
    } finally {
      decode.mockRestore();
    }
  });

  it('does not cache failed PNG structural validation', async () => {
    const cache = new Map<string | number, unknown>();
    const decode = vi.spyOn(PngEmbedder, 'for');
    try {
      await expect(preflightBoletoLogo(TRUNCATED_AFTER_PNG_HEADER, cache)).rejects.toThrow(
        /Institution logo/i,
      );
      await expect(preflightBoletoLogo(TRUNCATED_AFTER_PNG_HEADER, cache)).rejects.toThrow(
        /Institution logo/i,
      );

      expect(decode).not.toHaveBeenCalled();
      const memo = getBoletoLogoMemo(TRUNCATED_AFTER_PNG_HEADER, cache);
      expect(memo.structural).toBeUndefined();
      expect(memo.pendingStructural).toBeUndefined();
    } finally {
      decode.mockRestore();
    }
  });

  it('fully decodes a valid JPEG once per shared cache', async () => {
    const cache = new Map<string | number, unknown>();
    const decode = vi.spyOn(jpeg, 'decode');
    try {
      await expect(preflightBoletoLogo(ONE_PIXEL_JPEG, cache)).resolves.toEqual({
        kind: 'jpeg',
        width: 1,
        height: 1,
      });
      await preflightBoletoLogo(ONE_PIXEL_JPEG, cache);

      expect(decode).toHaveBeenCalledTimes(1);
      expect(decode).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
          maxMemoryUsageInMB: BOLETO_LOGO_MAX_JPEG_DECODE_MEMORY_MB,
          maxResolutionInMP: BOLETO_LOGO_MAX_PIXELS / 1_000_000,
          tolerantDecoding: false,
        }),
      );
    } finally {
      decode.mockRestore();
    }
  });

  it('rejects SOI/APP/SOF-only JPEG data that passes the PDF embedder metadata parser', async () => {
    const metadata = await JpegEmbedder.for(toUint8Array(SOI_APP_SOF_ONLY_JPEG));
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 1, height: 1 });

    await expect(preflightBoletoLogo(SOI_APP_SOF_ONLY_JPEG, new Map())).rejects.toThrow(
      /Institution logo cannot be decoded/i,
    );
  });

  it('does not cache a failed full JPEG decode', async () => {
    const cache = new Map<string | number, unknown>();
    const decode = vi.spyOn(jpeg, 'decode');
    try {
      await expect(preflightBoletoLogo(TRUNCATED_JPEG_SCAN, cache)).rejects.toThrow(
        /Institution logo cannot be decoded/i,
      );
      await expect(preflightBoletoLogo(TRUNCATED_JPEG_SCAN, cache)).rejects.toThrow(
        /Institution logo cannot be decoded/i,
      );

      expect(decode).toHaveBeenCalledTimes(2);
    } finally {
      decode.mockRestore();
    }
  });

  it('bounds collision buckets without reusing a different source', () => {
    const cache = new Map<string | number, unknown>();
    const cacheKey = getBoletoLogoCacheKey(ONE_PIXEL_PNG);
    const collisionEntries = Array.from({ length: 4 }, (_, index) => ({
      source: `different-logo-${String(index)}`,
      embeddedByDocument: new WeakMap<object, Promise<unknown>>(),
    }));
    cache.set(cacheKey, {
      marker: 'pdfweave-boleto-logo-v1',
      entries: collisionEntries,
    });

    const memo = getBoletoLogoMemo(ONE_PIXEL_PNG, cache);

    expect(memo.source).toBe(ONE_PIXEL_PNG);
    expect(memo).not.toBe(collisionEntries.at(0));
    expect(collisionEntries).toHaveLength(4);
    expect(collisionEntries).not.toContain(memo);
  });

  it('reuses one exact-source memo throughout a large repeated-record batch', () => {
    const cache = new Map<string | number, unknown>();
    const codePointAt = vi.spyOn(String.prototype, 'codePointAt');
    try {
      const first = getBoletoLogoMemo(ONE_PIXEL_PNG, cache);
      const hashCallCount = codePointAt.mock.calls.length;

      const repeated = Array.from({ length: 100 }, () => getBoletoLogoMemo(ONE_PIXEL_PNG, cache));

      expect(codePointAt).toHaveBeenCalledTimes(hashCallCount);
      expect(repeated.every((memo) => memo === first)).toBe(true);
      expect(
        [...cache.keys()].filter(
          (key) => typeof key === 'string' && key.startsWith('boleto-logo:v1:'),
        ),
      ).toHaveLength(1);
    } finally {
      codePointAt.mockRestore();
    }
  });

  it('bounds the exact-source fingerprint fast path', () => {
    const cache = new Map<string | number, unknown>();
    const codePointAt = vi.spyOn(String.prototype, 'codePointAt');
    try {
      for (let index = 0; index < 9; index += 1) {
        getBoletoLogoMemo(`source-${String(index)}`, cache);
      }
      const hashCallCount = codePointAt.mock.calls.length;

      getBoletoLogoMemo('source-0', cache);

      expect(codePointAt.mock.calls.length).toBeGreaterThan(hashCallCount);
    } finally {
      codePointAt.mockRestore();
    }
  });
});

describe('boleto UI plugin', () => {
  type UiMode = Parameters<typeof boleto.ui>[0]['mode'];
  type OnChange = NonNullable<Parameters<typeof boleto.ui>[0]['onChange']>;

  const render = async (
    value: string,
    options: {
      mode?: UiMode;
      onChange?: OnChange;
      rootElement?: HTMLDivElement;
      schema?: BoletoSchema;
    } = {},
  ): Promise<HTMLDivElement> => {
    const rootElement = options.rootElement ?? document.createElement('div');
    await boleto.ui({
      value,
      schema: options.schema ?? schema,
      rootElement,
      mode: options.mode ?? 'viewer',
      onChange: options.onChange,
      options: { font: getDefaultFont() },
      _cache: new Map(),
      theme: { colorPrimary: '#1677ff' },
    } as Parameters<typeof boleto.ui>[0]);
    return rootElement;
  };

  it('redacts payable identifiers from test-mode browser output', async () => {
    const rootElement = await render(JSON.stringify(createData()));
    const formattedLine = formatDigitableLine(ITAU_BARCODE);

    expect(rootElement.querySelector('[data-boleto-error]')).toBeNull();
    expect(rootElement.querySelectorAll('svg')).toHaveLength(0);
    expect(rootElement.textContent).toContain('AMOSTRA - NÃO PAGÁVEL');
    expect(rootElement.textContent).toContain('LINHA DIGITÁVEL SUPRIMIDA - AMOSTRA');
    expect(rootElement.textContent).toContain('CÓDIGO DE BARRAS SUPRIMIDO - AMOSTRA');
    expect(rootElement.textContent).toContain('Autenticação Mecânica');
    expect(rootElement.querySelector('[data-boleto-primitive="test-watermark"]')).not.toBeNull();
    expect(rootElement.querySelector('[data-boleto-primitive="digitable-line"]')).toBeNull();
    expect(rootElement.querySelector('[data-boleto-primitive="barcode"]')).toBeNull();
    const mechanicalAuthentication = rootElement.querySelector(
      '[data-boleto-primitive="mechanical-authentication"]',
    );
    expect(mechanicalAuthentication?.textContent).toContain('Autenticação Mecânica');
    expect(rootElement.outerHTML).not.toContain(ITAU_BARCODE);
    expect(rootElement.outerHTML).not.toContain(formattedLine);
    expect(rootElement.outerHTML).not.toContain(formattedLine.replace(/\D/g, ''));
  });

  it('renders registered payment identifiers as normal browser text', async () => {
    const rootElement = await render(
      JSON.stringify(withData({ registrationStatus: 'registered' })),
    );

    expect(rootElement.querySelector('[data-boleto-error]')).toBeNull();
    expect(rootElement.querySelectorAll('svg')).toHaveLength(1);
    expect(rootElement.textContent).not.toContain('AMOSTRA - NÃO PAGÁVEL');
    expect(rootElement.querySelector('[data-boleto-primitive="test-watermark"]')).toBeNull();
    expect(rootElement.querySelector('[data-boleto-primitive="barcode"]')).not.toBeNull();
    expect(
      rootElement.querySelector('[data-boleto-primitive="final-beneficiary-label"]'),
    ).not.toBeNull();
    const institutionCode = rootElement.querySelector('[data-boleto-primitive="institution-code"]');
    const digitableLine = rootElement.querySelector('[data-boleto-primitive="digitable-line"]');
    const mechanicalAuthentication = rootElement.querySelector(
      '[data-boleto-primitive="mechanical-authentication"]',
    );
    expect(institutionCode?.textContent).toContain('341-7');
    expect(digitableLine?.textContent).toContain(formatDigitableLine(ITAU_BARCODE));
    expect(mechanicalAuthentication?.textContent).toContain('Autenticação Mecânica');
    expect(digitableLine?.querySelector<HTMLElement>('div[id^="text-"]')?.style.fontFamily).toBe(
      '"Roboto"',
    );
    expect(
      mechanicalAuthentication?.querySelector<HTMLElement>('div[id^="text-"]')?.style.fontFamily,
    ).toBe('"Roboto"');
    const mechanicalLeft = Number.parseFloat(
      (mechanicalAuthentication as HTMLElement | null)?.style.left ?? 'NaN',
    );
    const mechanicalWidth = Number.parseFloat(
      (mechanicalAuthentication as HTMLElement | null)?.style.width ?? 'NaN',
    );
    expect(mechanicalLeft + mechanicalWidth).toBeCloseTo(((schema.width - 1) / schema.width) * 100);

    const gridLines = [...rootElement.querySelectorAll<HTMLElement>('[data-boleto-line]')];
    const topGridLine = gridLines.find(
      ({ dataset }) =>
        dataset.boletoLineOrientation === 'horizontal' &&
        dataset.boletoLineX1 === '0' &&
        dataset.boletoLineX2 === String(schema.width) &&
        dataset.boletoLineY1 === String(BOLETO_GRID_STROKE_MM / 2),
    );
    const leftGridLine = gridLines.find(
      ({ dataset }) =>
        dataset.boletoLineOrientation === 'vertical' &&
        dataset.boletoLineX1 === String(BOLETO_GRID_STROKE_MM / 2) &&
        dataset.boletoLineY1 === '0',
    );
    expect(topGridLine).toBeDefined();
    expect(leftGridLine).toBeDefined();
    expect(topGridLine?.style.left).toBe('0%');
    expect(topGridLine?.style.width).toBe('100%');
    expect(topGridLine?.style.transform).toBe('translateY(-0.15mm)');
    expect(leftGridLine?.style.top).toBe('0%');
    expect(leftGridLine?.style.width).toBe('0.3mm');
    expect(leftGridLine?.style.transform).toBe('translateX(-0.15mm)');
  });

  it('applies the preflighted line scale at minimum width in the browser', async () => {
    const minimumSchema = { ...schema, width: BOLETO_FICHA_MIN_WIDTH_MM };
    const rootElement = await render(
      JSON.stringify(withData({ registrationStatus: 'registered' })),
      { schema: minimumSchema },
    );
    const line = rootElement.querySelector('[data-boleto-primitive="digitable-line"]');
    const scaledRoot = line?.querySelector<HTMLElement>('[data-boleto-horizontal-scale]');
    const horizontalScale = Number(scaledRoot?.dataset.boletoHorizontalScale);

    expect(rootElement.querySelector('[data-boleto-error]')).toBeNull();
    expect(horizontalScale).toBeGreaterThan(0);
    expect(horizontalScale).toBeLessThan(1);
    expect(scaledRoot?.style.transform).toBe(`scaleX(${String(horizontalScale)})`);
    expect(scaledRoot?.style.transformOrigin).toBe('left top');
    expect(scaledRoot?.querySelector<HTMLElement>('div[id^="text-"]')?.style.fontFamily).toBe(
      '"Roboto"',
    );
  });

  it('renders a validated Pix QR beside fixed instruction lanes in the browser', async () => {
    const rootElement = await render(
      JSON.stringify(
        withData({
          testPaymentIdentifiers: 'render',
          instructions: [
            'Primeira instrucao longa que pode quebrar sem deslocar a segunda instrucao.',
            'Segunda instrucao.',
          ],
          pix: { emvPayload: VALID_PIX_PAYLOAD, placement: 'instructions-right' },
        }),
      ),
    );
    const qrCode = rootElement.querySelector('[data-boleto-primitive="pix-qrcode"]');
    const lanes = rootElement.querySelectorAll('[data-boleto-primitive^="instructions-value-"]');

    expect(rootElement.querySelector('[data-boleto-error]')).toBeNull();
    expect(qrCode).not.toBeNull();
    const qrSvg = qrCode?.querySelector('svg');
    expect(qrSvg).not.toBeNull();
    expect(
      Object.values(measureQrQuietZoneModules(qrSvg?.outerHTML ?? '')).every(
        (modules) => modules >= 4,
      ),
    ).toBe(true);
    expect(lanes).toHaveLength(2);
  });

  it('replaces invalid input with a stable error marker and no barcode', async () => {
    const rootElement = document.createElement('div');
    rootElement.innerHTML = '<span data-existing-content="true">previous render</span>';
    await render('{}', { rootElement });
    const error = rootElement.querySelector('[data-boleto-error]');

    expect(error).not.toBeNull();
    expect(rootElement.children).toHaveLength(1);
    expect(rootElement.querySelector('[data-existing-content]')).toBeNull();
    expect(error?.getAttribute('title')).toContain('[@pdfweave/schemas/boleto]');
    expect(rootElement.querySelector('svg')).toBeNull();
  });

  it('atomically replaces prior content with only an error for a corrupt logo', async () => {
    const data = createData();
    data.institution = { ...data.institution, logo: TRUNCATED_AFTER_PNG_HEADER };
    const rootElement = document.createElement('div');
    rootElement.innerHTML = '<span data-existing-content="true">previous render</span>';
    const imageUi = vi.spyOn(imagePlugin, 'ui');

    try {
      await render(JSON.stringify(data), { rootElement });

      expect(imageUi).not.toHaveBeenCalled();
      expect(rootElement.children).toHaveLength(1);
      expect(rootElement.firstElementChild?.hasAttribute('data-boleto-error')).toBe(true);
      expect(rootElement.querySelector('[data-existing-content]')).toBeNull();
      expect(rootElement.querySelector('[data-boleto-primitive]')).toBeNull();
      expect(rootElement.querySelector('[data-boleto-line]')).toBeNull();
      expect(rootElement.querySelector('img, svg')).toBeNull();
    } finally {
      imageUi.mockRestore();
    }
  });

  it.each([
    ['truncated JPEG scan data', TRUNCATED_JPEG_SCAN],
    ['SOI/APP/SOF-only JPEG data', SOI_APP_SOF_ONLY_JPEG],
  ])('rejects %s before staging any UI primitives', async (_case, logo) => {
    const data = createData();
    data.institution = { ...data.institution, logo };
    const rootElement = document.createElement('div');
    rootElement.innerHTML = '<span data-existing-content="true">previous render</span>';
    const imageUi = vi.spyOn(imagePlugin, 'ui');

    try {
      await render(JSON.stringify(data), { rootElement });

      expect(imageUi).not.toHaveBeenCalled();
      expect(rootElement.children).toHaveLength(1);
      expect(rootElement.firstElementChild?.hasAttribute('data-boleto-error')).toBe(true);
      expect(rootElement.querySelector('[data-existing-content]')).toBeNull();
      expect(rootElement.querySelector('[data-boleto-primitive], [data-boleto-line]')).toBeNull();
      expect(rootElement.querySelector('img, svg')).toBeNull();
    } finally {
      imageUi.mockRestore();
    }
  });

  it('renders a fully decoded JPEG after browser image decoding succeeds', async () => {
    const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    const decode = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
      writable: true,
    });
    const data = createData();
    data.institution = { ...data.institution, logo: ONE_PIXEL_JPEG };

    try {
      const rootElement = await render(JSON.stringify(data));

      expect(decode).toHaveBeenCalledTimes(1);
      expect(rootElement.querySelector('[data-boleto-error]')).toBeNull();
      expect(rootElement.querySelector('img')?.getAttribute('src')).toBe(ONE_PIXEL_JPEG);
    } finally {
      if (originalDecode) {
        Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode);
      } else {
        Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
      }
    }
  });

  it('waits for browser logo decoding before atomically committing the UI', async () => {
    const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    const decode = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('decode failed'));
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
      writable: true,
    });
    const data = createData();
    data.institution = { ...data.institution, logo: ONE_PIXEL_PNG };
    const rootElement = document.createElement('div');
    rootElement.innerHTML = '<span data-existing-content="true">previous render</span>';

    try {
      await render(JSON.stringify(data), { rootElement });

      expect(decode).toHaveBeenCalledTimes(1);
      expect(rootElement.children).toHaveLength(1);
      expect(rootElement.firstElementChild?.hasAttribute('data-boleto-error')).toBe(true);
      expect(rootElement.querySelector('[data-existing-content], img, svg')).toBeNull();
    } finally {
      if (originalDecode) {
        Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode);
      } else {
        Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
      }
    }
  });

  it.each(['form', 'designer'] as const)(
    'renders output-only child plugins without editable controls in %s mode',
    async (mode) => {
      const onChange = vi.fn<OnChange>();
      const rootElement = await render(JSON.stringify(createData()), { mode, onChange });

      expect(rootElement.querySelector('button, input, select, textarea')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      expect(rootElement.querySelectorAll('svg')).toHaveLength(0);
    },
  );
});

describe('boleto plugin contract', () => {
  it('is output-only and requires a complete bound boleto value', () => {
    expect(boleto.propPanel.defaultSchema.readOnly).toBe(false);
    expect(boleto.propPanel.defaultSchema.required).toBe(true);
    expect(boleto.propPanel.schema).toEqual({});
  });
});
