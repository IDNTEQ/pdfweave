import type { Template } from '@pdfweave/common';
import { pdf2img } from '@pdfweave/converter';
import { generate } from '@pdfweave/generator';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from '@pdfweave/pdf-lib';
import {
  BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
  BOLETO_BARCODE_HEIGHT_MM,
  BOLETO_BARCODE_LEFT_MM,
  BOLETO_BARCODE_WIDTH_MM,
  BOLETO_PIX_QR_SIZE_MM,
  boleto,
  buildBoletoBarcode,
  type BoletoData,
  type BoletoSchema,
} from '@pdfweave/schemas';
import {
  impose,
  MM_TO_PT,
  type ImpositionPlacement,
  type ImpositionPlan,
} from '../../src/index.js';
import { pdfToImages, writeArtifacts } from '../helpers.js';
import { cropMillimeterRegion, decodeItfRaster } from '../itfRaster.js';
import { decodeQrRaster } from '../qrRaster.js';

const mm = (value: number): number => value * MM_TO_PT;

const BOLETO_WIDTH_MM = 200;
const BOLETO_HEIGHT_MM = 95;
const A4_WIDTH_MM = 210;
const SCAN_DPI = 300;
const BARCODE_ACQUISITION_PADDING_MM = { top: 2, right: 5, bottom: 3, left: 5 } as const;
const PIX_QR_ACQUISITION_PADDING_MM = 2;
const PIX_QR_LOCAL_REGION_MM = {
  x: BOLETO_WIDTH_MM - 50 - (21 - BOLETO_PIX_QR_SIZE_MM) / 2 - BOLETO_PIX_QR_SIZE_MM,
  y: 45 + (21 - BOLETO_PIX_QR_SIZE_MM) / 2,
  width: BOLETO_PIX_QR_SIZE_MM,
  height: BOLETO_PIX_QR_SIZE_MM,
} as const;
const BOLETO_CLIENTS = [
  'Almeida Comercio Ltda.',
  'Borges Servicos Digitais',
  'Costa e Lima Distribuidora',
  'Duarte Equipamentos',
  'Estrela Logistica',
  'Ferreira Materiais',
  'Gomes Tecnologia',
] as const;

const textEncoder = new TextEncoder();
const tlv = (tag: string, value: string): string =>
  `${tag}${String([...value].length).padStart(2, '0')}${value}`;

const calculatePixCrc = (value: string): string => {
  let crc = 0xffff;
  for (const byte of textEncoder.encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) === 0 ? (crc << 1) & 0xffff : ((crc << 1) ^ 0x1021) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const buildSyntheticPixPayload = (sequence: number): string => {
  const merchantAccount = tlv(
    '26',
    tlv('00', 'br.gov.bcb.pix') +
      tlv('25', `pix.example.test/cobv/${String(sequence).padStart(4, '0')}`),
  );
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    merchantAccount +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('58', 'BR') +
    tlv('59', 'PDFWEAVE LTDA') +
    tlv('60', 'SAO PAULO') +
    tlv('62', tlv('05', '***'));
  const throughCrcHeader = `${body}6304`;
  return `${throughCrcHeader}${calculatePixCrc(throughCrcHeader)}`;
};

const createBoletoData = (client: string, index: number): BoletoData => {
  const dueDate = `2026-09-${String(index + 10).padStart(2, '0')}`;
  const documentValueCents = 87_535 + index * 14_327;
  return {
    version: 1,
    kind: 'cobranca',
    registrationStatus: 'test',
    testPaymentIdentifiers: 'render',
    institution: { name: 'Banco de Teste', code: '001', codeDigit: '9' },
    beneficiaryMode: 'direct',
    beneficiary: {
      name: 'PDFweave Demonstracoes Ltda.',
      taxId: { type: 'cnpj', number: '11.222.333/0001-81' },
      address: {
        street: 'Avenida Paulista',
        number: '1000',
        district: 'Bela Vista',
        city: 'Sao Paulo',
        state: 'SP',
        postalCode: '01310-100',
      },
    },
    payer: {
      name: client,
      taxId: { type: 'cpf', number: '529.982.247-25' },
      address: {
        street: 'Rua das Flores',
        number: String(index + 100),
        district: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        postalCode: '80010-000',
      },
    },
    paymentLocation: 'Pagavel em qualquer banco ate o vencimento',
    dueDate,
    barcode: buildBoletoBarcode({
      institutionCode: '001',
      dueDate,
      amountMode: 'fixed',
      documentValueCents,
      freeField: String(index + 1).padStart(25, '0'),
    }),
    amountMode: 'fixed',
    documentValueCents,
    agencyBeneficiaryCode: '1234 / 56789-0',
    documentDate: '2026-08-01',
    documentNumber: `DOC-${String(index + 1).padStart(4, '0')}`,
    documentSpecies: 'DM',
    acceptance: 'N',
    processingDate: '2026-08-01',
    ourNumber: `1234567890${String(index + 1)}-2`,
    portfolio: '17',
    instructions: [
      'AMOSTRA SEM VALOR DE PAGAMENTO.',
      'Nao receber apos o vencimento.',
      `Referencia: DOC-${String(index + 1).padStart(4, '0')}.`,
    ],
    pix: {
      emvPayload: buildSyntheticPixPayload(index + 1),
      placement: 'instructions-right',
    },
  };
};

const createBoletoPdf = async (records: BoletoData[]): Promise<Uint8Array> => {
  const boletoSchema: BoletoSchema = {
    name: 'boleto',
    type: 'boleto',
    variant: 'ficha-compensacao',
    content: '',
    position: { x: 0, y: 0 },
    width: BOLETO_WIDTH_MM,
    height: BOLETO_HEIGHT_MM,
    rotate: 0,
    opacity: 1,
    readOnly: false,
    required: true,
  };
  const template: Template = {
    basePdf: {
      width: BOLETO_WIDTH_MM,
      height: BOLETO_HEIGHT_MM,
      padding: [0, 0, 0, 0],
    },
    schemas: [[boletoSchema]],
  };

  return generate({
    template,
    inputs: records.map((record) => ({ boleto: record })),
    plugins: { boleto },
  });
};

const createBoletoBook = (): Promise<Uint8Array> =>
  createBoletoPdf(BOLETO_CLIENTS.map((client, index) => createBoletoData(client, index)));

const renderOutputPageAtScanDpi = async (
  pdf: Uint8Array,
  outputPageIndex: number,
): Promise<ArrayBuffer> => {
  const source = await PDFDocument.load(pdf);
  const scanDocument = await PDFDocument.create({ updateMetadata: false });
  const copiedPages = await scanDocument.copyPages(source, [outputPageIndex]);
  const page = copiedPages.at(0);
  if (!page) throw new Error(`Expected imposed output page ${String(outputPageIndex)}`);
  scanDocument.addPage(page);
  const scanImages = await pdf2img(await scanDocument.save(), {
    imageType: 'png',
    scale: SCAN_DPI / 72,
  });
  const scanBytes = scanImages.at(0);
  if (!scanBytes) throw new Error('Expected a 300 DPI imposed-sheet raster');
  return scanBytes;
};

const getPlacedQrAcquisitionRegion = (
  plan: ImpositionPlan,
  placement: ImpositionPlacement,
): { x: number; y: number; width: number; height: number } => {
  if (placement.rotation !== 0) {
    throw new Error('The boleto QR acquisition helper expects an unrotated placement');
  }
  const scaledMillimeters = (value: number): number => value * placement.scale;
  const contentTop = plan.options.sheet.height - placement.content.y - placement.content.height;
  return {
    x:
      placement.content.x / MM_TO_PT +
      scaledMillimeters(PIX_QR_LOCAL_REGION_MM.x - PIX_QR_ACQUISITION_PADDING_MM),
    y:
      contentTop / MM_TO_PT +
      scaledMillimeters(PIX_QR_LOCAL_REGION_MM.y - PIX_QR_ACQUISITION_PADDING_MM),
    width: scaledMillimeters(PIX_QR_LOCAL_REGION_MM.width + PIX_QR_ACQUISITION_PADDING_MM * 2),
    height: scaledMillimeters(PIX_QR_LOCAL_REGION_MM.height + PIX_QR_ACQUISITION_PADDING_MM * 2),
  };
};

const decodeFirstPlacedPixQr = async (pdf: Uint8Array, plan: ImpositionPlan): Promise<string> => {
  const firstSheet = plan.sheets.at(0);
  const placement = firstSheet?.front.placements.at(0);
  if (!firstSheet || !placement) throw new Error('Expected a first imposed boleto placement');
  const scanBytes = await renderOutputPageAtScanDpi(pdf, firstSheet.front.outputPageIndex);
  const acquisitionRegion = getPlacedQrAcquisitionRegion(plan, placement);
  const sheetWidthMillimeters = plan.options.sheet.width / MM_TO_PT;
  return decodeQrRaster(cropMillimeterRegion(scanBytes, sheetWidthMillimeters, acquisitionRegion));
};

const drawInvoiceTable = (
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  clientIndex: number,
): void => {
  const left = mm(10);
  const right = mm(138);
  const top = mm(158);
  const rowHeight = mm(12);
  const columns = [left, mm(84), mm(104), right];
  page.drawRectangle({
    x: left,
    y: top,
    width: right - left,
    height: rowHeight,
    color: rgb(0.12, 0.22, 0.28),
  });
  for (const [index, heading] of ['Service', 'Qty', 'Amount'].entries()) {
    page.drawText(heading, {
      x: columns[index] + mm(2),
      y: top + mm(4),
      size: 7,
      font: bold,
      color: rgb(1, 1, 1),
    });
  }
  for (let row = 0; row < 5; row += 1) {
    const y = top - (row + 1) * rowHeight;
    page.drawRectangle({
      x: left,
      y,
      width: right - left,
      height: rowHeight,
      color: row % 2 === 0 ? rgb(0.94, 0.96, 0.96) : rgb(1, 1, 1),
      borderColor: rgb(0.7, 0.74, 0.75),
      borderWidth: 0.35,
    });
    page.drawText(`Production service ${clientIndex + 1}.${row + 1}`, {
      x: columns[0] + mm(2),
      y: y + mm(4),
      size: 7,
      font: regular,
    });
    page.drawText(String(row + 1), { x: columns[1] + mm(5), y: y + mm(4), size: 7, font: regular });
    page.drawText(`$${(125 + clientIndex * 17 + row * 23).toFixed(2)}`, {
      x: columns[2] + mm(4),
      y: y + mm(4),
      size: 7,
      font: regular,
    });
  }
  page.drawText('TOTAL', { x: mm(91), y: mm(89), size: 9, font: bold });
  page.drawText(`$${(1045.5 + clientIndex * 139.75).toFixed(2)}`, {
    x: mm(116),
    y: mm(89),
    size: 9,
    font: bold,
    color: rgb(0.7, 0.12, 0.14),
  });
};

const createClientStatements = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const clients = ['Northwind', 'Contoso', 'Fabrikam', 'Adventure Works', 'Tailspin Toys'];
  for (const [index, client] of clients.entries()) {
    const page = document.addPage([mm(148), mm(210)]);
    page.drawRectangle({ x: 0, y: 0, width: mm(148), height: mm(210), color: rgb(1, 1, 1) });
    page.drawRectangle({
      x: 0,
      y: mm(184),
      width: mm(148),
      height: mm(26),
      color: rgb(0.05, 0.25, 0.32),
    });
    page.drawText('PDFWEAVE', { x: mm(10), y: mm(194), size: 15, font: bold, color: rgb(1, 1, 1) });
    page.drawText('CLIENT STATEMENT', {
      x: mm(93),
      y: mm(195),
      size: 8,
      font: regular,
      color: rgb(1, 1, 1),
    });
    page.drawText(client, {
      x: mm(10),
      y: mm(174),
      size: 13,
      font: bold,
      color: rgb(0.08, 0.16, 0.2),
    });
    page.drawText(`Statement ST-${String(index + 1).padStart(4, '0')}`, {
      x: mm(95),
      y: mm(174),
      size: 7,
      font: regular,
    });
    drawInvoiceTable(page, regular, bold, index);
    page.drawText('Payment due within 30 days', {
      x: mm(10),
      y: mm(16),
      size: 7,
      font: regular,
      color: rgb(0.35, 0.4, 0.42),
    });
  }
  return document.save();
};

const artifactManifest = (scenario: string, plan: ImpositionPlan) => ({
  scenario,
  generatedBy: '@pdfweave/imposition integration test',
  sourcePageCount: plan.sourcePageCount,
  selectedPageCount: plan.selectedPageCount,
  placementCount: plan.placementCount,
  sheetCount: plan.sheetCount,
  capacity: plan.capacity,
  sheet: plan.options.sheet,
  layout: plan.options.layout,
  sheets: plan.sheets,
  warnings: plan.warnings,
});

const assertUnscaledBoletoPlacements = (plan: ImpositionPlan): void => {
  const placements = plan.sheets.flatMap(({ front }) => front.placements);
  expect(placements.map(({ sourcePageIndex }) => sourcePageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  for (const placement of placements) {
    expect(placement.scale).toBe(1);
    expect(placement.rotation).toBe(0);
    // PDF page boxes serialize point values to limited decimal precision.
    expect(placement.source.width / MM_TO_PT).toBeCloseTo(BOLETO_WIDTH_MM, 2);
    expect(placement.source.height / MM_TO_PT).toBeCloseTo(BOLETO_HEIGHT_MM, 2);
    expect(placement.cell.width / MM_TO_PT).toBeCloseTo(BOLETO_WIDTH_MM, 8);
    expect(placement.cell.height / MM_TO_PT).toBeCloseTo(BOLETO_HEIGHT_MM, 8);
    expect(placement.content.width).toBeCloseTo(placement.source.width, 5);
    expect(placement.content.height).toBeCloseTo(placement.source.height, 5);
    expect(placement.content.x).toBeGreaterThanOrEqual(placement.cell.x);
    expect(placement.content.y).toBeGreaterThanOrEqual(placement.cell.y);
    expect(placement.content.x + placement.content.width).toBeLessThanOrEqual(
      placement.cell.x + placement.cell.width,
    );
    expect(placement.content.y + placement.content.height).toBeLessThanOrEqual(
      placement.cell.y + placement.cell.height,
    );
  }
};

describe('n-up production artifacts', () => {
  test('preserves a registered ITF barcode through exact-size imposition', async () => {
    const registeredData: BoletoData = {
      ...createBoletoData('Registered Raster Test', 0),
      registrationStatus: 'registered',
      testPaymentIdentifiers: undefined,
    };
    const result = await impose({
      source: await createBoletoPdf([registeredData]),
      sheet: { size: 'A4', margins: 0 },
      layout: {
        type: 'n-up',
        rows: 1,
        columns: 1,
        scale: 'none',
        autoRotate: false,
        align: { horizontal: 'left', vertical: 'top' },
      },
      sourceBox: 'media',
    });
    const [scanBytes] = await pdf2img(result.pdf, {
      imageType: 'png',
      scale: SCAN_DPI / 72,
    });
    if (!scanBytes) throw new Error('Expected an imposed registered boleto raster');

    const barcodeTop =
      BOLETO_HEIGHT_MM - BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM - BOLETO_BARCODE_HEIGHT_MM / 2;
    const barcode = cropMillimeterRegion(scanBytes, A4_WIDTH_MM, {
      x: BOLETO_BARCODE_LEFT_MM - BARCODE_ACQUISITION_PADDING_MM.left,
      y: barcodeTop - BARCODE_ACQUISITION_PADDING_MM.top,
      width:
        BARCODE_ACQUISITION_PADDING_MM.left +
        BOLETO_BARCODE_WIDTH_MM +
        BARCODE_ACQUISITION_PADDING_MM.right,
      height:
        BARCODE_ACQUISITION_PADDING_MM.top +
        BOLETO_BARCODE_HEIGHT_MM +
        BARCODE_ACQUISITION_PADDING_MM.bottom,
    });
    const decoded = decodeItfRaster(barcode, SCAN_DPI);

    expect(result.plan).toMatchObject({ placementCount: 1, sheetCount: 1, warnings: [] });
    expect(result.plan.sheets[0]?.front.placements[0]).toMatchObject({
      scale: 1,
      rotation: 0,
    });
    expect(decoded.value).toBe(registeredData.barcode);
    expect(decoded.quietZoneMillimeters.left).toBeGreaterThanOrEqual(5);
    expect(decoded.quietZoneMillimeters.right).toBeGreaterThanOrEqual(5);
  });

  test('packs seven validated boleto pages two-up at exact size across four A4 sheets', async () => {
    const result = await impose({
      source: await createBoletoBook(),
      sheet: {
        size: 'A4',
        margins: { top: 48.5, right: 5, bottom: 48.5, left: 5 },
        gutter: { horizontal: 0, vertical: 10 },
      },
      layout: {
        type: 'n-up',
        rows: 2,
        columns: 1,
        scale: 'none',
        autoRotate: false,
      },
      sourceBox: 'media',
    });
    const images = await pdfToImages(result.pdf);
    writeArtifacts(
      'a4-boleto-booklet',
      result.pdf,
      images,
      artifactManifest('a4-boleto-booklet', result.plan),
    );

    expect(result.plan).toMatchObject({
      placementCount: 7,
      sheetCount: 4,
      capacity: 2,
      warnings: [],
    });
    expect(result.plan.options.layout.scale).toBe('none');
    expect(result.plan.sheets[3].front.emptySlots).toHaveLength(1);
    assertUnscaledBoletoPlacements(result.plan);
    await expect(decodeFirstPlacedPixQr(result.pdf, result.plan)).resolves.toBe(
      buildSyntheticPixPayload(1),
    );
    expect(images).toHaveLength(4);
    for (const [index, image] of images.entries()) {
      expect(image.byteLength).toBeGreaterThan(10_000);
      await expect(image).toMatchImage({
        name: `a4-boleto-booklet-sheet-${String(index + 1)}`,
        allowedPixelRatio: 0.001,
        includeAA: false,
      });
    }
  });

  test('packs seven validated boleto pages four-up at exact size across two landscape A3 sheets', async () => {
    const result = await impose({
      source: await createBoletoBook(),
      sheet: {
        size: 'A3',
        orientation: 'landscape',
        margins: { top: 48.5, right: 5, bottom: 48.5, left: 5 },
        gutter: { horizontal: 10, vertical: 10 },
      },
      layout: {
        type: 'n-up',
        rows: 2,
        columns: 2,
        scale: 'none',
        autoRotate: false,
      },
      sourceBox: 'media',
    });
    const images = await pdfToImages(result.pdf);
    writeArtifacts(
      'a3-boleto-booklet',
      result.pdf,
      images,
      artifactManifest('a3-boleto-booklet', result.plan),
    );

    expect(result.plan).toMatchObject({
      placementCount: 7,
      sheetCount: 2,
      capacity: 4,
      warnings: [],
    });
    expect(result.plan.options.sheet.orientation).toBe('landscape');
    expect(result.plan.options.layout.scale).toBe('none');
    expect(result.plan.sheets[1].front.emptySlots).toHaveLength(1);
    assertUnscaledBoletoPlacements(result.plan);
    await expect(decodeFirstPlacedPixQr(result.pdf, result.plan)).resolves.toBe(
      buildSyntheticPixPayload(1),
    );
    expect(images).toHaveLength(2);
    for (const [index, image] of images.entries()) {
      expect(image.byteLength).toBeGreaterThan(20_000);
      await expect(image).toMatchImage({
        name: `a3-boleto-booklet-sheet-${String(index + 1)}`,
        allowedPixelRatio: 0.001,
        includeAA: false,
      });
    }
  });

  test('packs five A5 client statements four-up across two landscape A3 sheets', async () => {
    const result = await impose({
      source: await createClientStatements(),
      sheet: { size: 'A3', orientation: 'landscape', margins: 8, gutter: 4 },
      layout: {
        type: 'n-up',
        rows: 2,
        columns: 2,
        autoRotate: true,
        allowUpscale: false,
      },
      sourceBox: 'media',
    });
    const images = await pdfToImages(result.pdf);
    writeArtifacts(
      'a3-client-statements',
      result.pdf,
      images,
      artifactManifest('a3-client-statements', result.plan),
    );

    expect(result.plan).toMatchObject({
      placementCount: 5,
      sheetCount: 2,
      capacity: 4,
      warnings: [],
    });
    expect(result.plan.sheets[0].front.placements.every(({ rotation }) => rotation === 90)).toBe(
      true,
    );
    expect(result.plan.sheets[1].front.emptySlots).toHaveLength(3);
    expect(images).toHaveLength(2);
    for (const [index, image] of images.entries()) {
      expect(image.byteLength).toBeGreaterThan(20_000);
      await expect(image).toMatchImage({
        name: `a3-client-statements-sheet-${index + 1}`,
        allowedPixelRatio: 0.001,
        includeAA: false,
      });
    }
  });
});
