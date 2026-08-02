import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mm2pt, pt2mm, type Template } from '@pdfweave/common';
import { pdf2img } from '@pdfweave/converter';
import { PDFDocument, rgb } from '@pdfweave/pdf-lib';
import { PNG } from 'pngjs';
import { vi } from 'vitest';
import boleto, {
  buildBoletoBarcode,
  deriveDigitableLine,
  formatDigitableLine,
  parseBoletoData,
  type BoletoData,
  type BoletoSchema,
} from '@pdfweave/schemas/boleto';
import generate from '../src/generate.js';
import { getImageSnapshotOptions, pdfToImages } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.join(__dirname, '..', 'test-artifacts', 'boleto-book');
const cropBoxArtifactDirectory = path.join(artifactDirectory, 'asymmetric-cropbox-base');
const batchArtifactDirectory = path.join(
  __dirname,
  '..',
  'test-artifacts',
  'resource-reuse',
  '100-boleto-records',
);
const fixedMetadataDate = new Date('2026-08-01T12:00:00.000Z');
const PAGE_WIDTH_MM = 200;
const PAGE_HEIGHT_MM = 95;
const PAGE_COUNT = 7;
const SCAN_DPI = 300;
const REPRESENTATIVE_PAGE_INDEXES = [0, 49, 99] as const;
const CROP_BOX_WIDTH_MM = 210;
const CROP_BOX_HEIGHT_MM = 120;
const CROP_BOX_BOLETO_POSITION = { x: 5, y: 10 } as const;
const CONSTANT_INSTITUTION_LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAW0lEQVR4AcXBsQ1AUAAA0XPRGkFtGyOojGUxtUGYQfKTe29a9uNloOe8+UNiEpOYxCQmMYlJTGISk9jMYOu18YfEJCYxiUlMYhKTmMQkJjGJSUxiEpOYxCQmsQ/9MgT6Xr5uTQAAAABJRU5ErkJggg==';

const ITF_PATTERNS = new Map([
  ['nnwwn', '0'],
  ['wnnnw', '1'],
  ['nwnnw', '2'],
  ['wwnnn', '3'],
  ['nnwnw', '4'],
  ['wnwnn', '5'],
  ['nwwnn', '6'],
  ['nnnww', '7'],
  ['wnnwn', '8'],
  ['nwnwn', '9'],
]);

interface ItfRasterResult {
  value: string;
  runCount: number;
  narrowMaximumPixels: number;
  wideMinimumPixels: number;
  wideToNarrowRatio: number;
  quietZoneMillimeters: { left: number; right: number };
}

interface DarkRasterBounds {
  leftMillimeters: number;
  topMillimeters: number;
  widthMillimeters: number;
  heightMillimeters: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted.at(middle - 1) ?? 0) + (sorted.at(middle) ?? 0)) / 2
    : (sorted.at(middle) ?? 0);
};

const decodeItfRaster = (image: PNG, dpi: number): ItfRasterResult => {
  const scanY = Math.floor(image.height / 2);
  const runs: { dark: boolean; width: number }[] = [];
  let runStart = 0;
  let currentDark = false;

  for (let x = 0; x < image.width; x += 1) {
    const pixelOffset = (scanY * image.width + x) * 4;
    const [red = 255, green = 255, blue = 255] = image.data.subarray(pixelOffset, pixelOffset + 3);
    const luminance = (red + green + blue) / 3;
    const dark = luminance < 128;
    if (x === 0) {
      currentDark = dark;
    } else if (dark !== currentDark) {
      runs.push({ dark: currentDark, width: x - runStart });
      currentDark = dark;
      runStart = x;
    }
  }
  runs.push({ dark: currentDark, width: image.width - runStart });

  const leadingQuietZone = runs.at(0);
  const trailingQuietZone = runs.at(-1);
  if (!leadingQuietZone || !trailingQuietZone || leadingQuietZone.dark || trailingQuietZone.dark) {
    throw new Error('ITF raster must begin and end with a light quiet zone');
  }

  const symbolRuns = runs.slice(1, -1);
  if (symbolRuns.length !== 227) {
    throw new Error(`Expected 227 ITF runs for 44 digits, received ${String(symbolRuns.length)}`);
  }
  if (symbolRuns.some((run, index) => run.dark !== (index % 2 === 0))) {
    throw new Error('ITF raster does not alternate between bars and spaces');
  }

  const uniqueWidths = [...new Set(symbolRuns.map(({ width }) => width))].sort(
    (left, right) => left - right,
  );
  let clusterBoundary = 0;
  let largestGap = 0;
  for (let index = 1; index < uniqueWidths.length; index += 1) {
    const lower = uniqueWidths.at(index - 1) ?? 0;
    const upper = uniqueWidths.at(index) ?? 0;
    const gap = upper - lower;
    if (gap > largestGap) {
      largestGap = gap;
      clusterBoundary = (lower + upper) / 2;
    }
  }
  if (largestGap < 2) throw new Error('ITF raster has no distinct narrow and wide clusters');

  const narrowWidths = symbolRuns
    .map(({ width }) => width)
    .filter((width) => width < clusterBoundary);
  const wideWidths = symbolRuns
    .map(({ width }) => width)
    .filter((width) => width >= clusterBoundary);
  const classify = ({ width }: { width: number }): 'n' | 'w' =>
    width < clusterBoundary ? 'n' : 'w';
  const startPattern = symbolRuns
    .slice(0, 4)
    .map((run) => classify(run))
    .join('');
  const stopPattern = symbolRuns
    .slice(-3)
    .map((run) => classify(run))
    .join('');
  if (startPattern !== 'nnnn' || stopPattern !== 'wnn') {
    throw new Error(`Invalid ITF guards: start=${startPattern}, stop=${stopPattern}`);
  }

  let value = '';
  const payloadRuns = symbolRuns.slice(4, -3);
  for (let offset = 0; offset < payloadRuns.length; offset += 10) {
    const pairRuns = payloadRuns.slice(offset, offset + 10);
    const bars = pairRuns
      .filter((_, index) => index % 2 === 0)
      .map((run) => classify(run))
      .join('');
    const spaces = pairRuns
      .filter((_, index) => index % 2 === 1)
      .map((run) => classify(run))
      .join('');
    const firstDigit = ITF_PATTERNS.get(bars);
    const secondDigit = ITF_PATTERNS.get(spaces);
    if (firstDigit === undefined || secondDigit === undefined) {
      throw new Error(`Invalid ITF digit pair at run ${String(offset + 4)}: ${bars}/${spaces}`);
    }
    value += `${firstDigit}${secondDigit}`;
  }

  const pixelsPerMillimeter = dpi / 25.4;
  const quietZoneMillimeters = {
    left: leadingQuietZone.width / pixelsPerMillimeter,
    right: trailingQuietZone.width / pixelsPerMillimeter,
  };
  if (quietZoneMillimeters.left < 5 || quietZoneMillimeters.right < 5) {
    throw new Error(
      `ITF quiet zone is below 5 mm: ${quietZoneMillimeters.left.toFixed(2)}/${quietZoneMillimeters.right.toFixed(2)}`,
    );
  }

  const wideToNarrowRatio = median(wideWidths) / median(narrowWidths);
  if (wideToNarrowRatio < 2 || wideToNarrowRatio > 3.5) {
    throw new Error(`Unexpected ITF wide/narrow ratio: ${wideToNarrowRatio.toFixed(2)}`);
  }

  return {
    value,
    runCount: symbolRuns.length,
    narrowMaximumPixels: Math.max(...narrowWidths),
    wideMinimumPixels: Math.min(...wideWidths),
    wideToNarrowRatio,
    quietZoneMillimeters,
  };
};

const tryDecodeItfRaster = (image: PNG, dpi: number): ItfRasterResult | undefined => {
  try {
    return decodeItfRaster(image, dpi);
  } catch {
    return undefined;
  }
};

const cropBarcodeAcquisitionRegion = (pngBytes: ArrayBuffer): PNG => {
  const source = PNG.sync.read(Buffer.from(new Uint8Array(pngBytes)));
  const pixelsPerMillimeter = source.width / PAGE_WIDTH_MM;
  const crop = {
    x: 0,
    y: 74,
    width: 113,
    height: 18,
  };
  const target = new PNG({
    width: Math.round(crop.width * pixelsPerMillimeter),
    height: Math.round(crop.height * pixelsPerMillimeter),
  });
  PNG.bitblt(
    source,
    target,
    Math.round(crop.x * pixelsPerMillimeter),
    Math.round(crop.y * pixelsPerMillimeter),
    target.width,
    target.height,
    0,
    0,
  );
  return target;
};

const measureDarkRasterBounds = (
  pngBytes: ArrayBuffer,
  region: { x: number; y: number; width: number; height: number },
): DarkRasterBounds => {
  const source = PNG.sync.read(Buffer.from(new Uint8Array(pngBytes)));
  const pixelsPerMillimeter = source.width / PAGE_WIDTH_MM;
  const startX = Math.floor(region.x * pixelsPerMillimeter);
  const startY = Math.floor(region.y * pixelsPerMillimeter);
  const endX = Math.ceil((region.x + region.width) * pixelsPerMillimeter);
  const endY = Math.ceil((region.y + region.height) * pixelsPerMillimeter);
  let minimumX = endX;
  let minimumY = endY;
  let maximumX = -1;
  let maximumY = -1;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pixelOffset = (y * source.width + x) * 4;
      const [red = 255, green = 255, blue = 255] = source.data.subarray(
        pixelOffset,
        pixelOffset + 3,
      );
      if ((red + green + blue) / 3 >= 128) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }

  if (maximumX < minimumX || maximumY < minimumY) {
    throw new Error('Expected dark vector ink in the boleto header acquisition region');
  }

  return {
    leftMillimeters: minimumX / pixelsPerMillimeter,
    topMillimeters: minimumY / pixelsPerMillimeter,
    widthMillimeters: (maximumX - minimumX + 1) / pixelsPerMillimeter,
    heightMillimeters: (maximumY - minimumY + 1) / pixelsPerMillimeter,
  };
};

const renderRepresentativePages = async (document: PDFDocument): Promise<ArrayBuffer[]> => {
  const previewDocument = await PDFDocument.create();
  const pages = await previewDocument.copyPages(document, [...REPRESENTATIVE_PAGE_INDEXES]);
  for (const page of pages) previewDocument.addPage(page);
  return pdfToImages(await previewDocument.save());
};

interface PatternedBasePdf {
  bytes: Uint8Array;
  mediaBox: { x: number; y: number; width: number; height: number };
  cropBox: { x: number; y: number; width: number; height: number };
}

const buildPatternedCropBoxBasePdf = async (): Promise<PatternedBasePdf> => {
  const document = await PDFDocument.create({ updateMetadata: false });
  const mediaBox = {
    x: -mm2pt(25.4),
    y: mm2pt(25.4),
    width: mm2pt(230),
    height: mm2pt(140),
  };
  const cropBox = {
    x: mediaBox.x + mm2pt(12),
    y: mediaBox.y + mm2pt(7),
    width: mm2pt(CROP_BOX_WIDTH_MM),
    height: mm2pt(CROP_BOX_HEIGHT_MM),
  };
  const page = document.addPage([mediaBox.width, mediaBox.height]);
  page.setMediaBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
  page.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
  page.drawRectangle({ ...mediaBox, color: rgb(0.04, 0.06, 0.08) });

  for (let offset = 0; offset < 230; offset += 20) {
    page.drawRectangle({
      x: mediaBox.x + mm2pt(offset),
      y: mediaBox.y,
      width: mm2pt(8),
      height: mediaBox.height,
      color: rgb(0.1, 0.16, 0.2),
    });
  }
  for (let offset = 0; offset < 140; offset += 20) {
    page.drawRectangle({
      x: mediaBox.x,
      y: mediaBox.y + mm2pt(offset),
      width: mediaBox.width,
      height: mm2pt(5),
      color: rgb(0.16, 0.1, 0.18),
    });
  }

  return { bytes: await document.save(), mediaBox, cropBox };
};

interface MillimeterRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getPixelLuminance = (image: PNG, x: number, y: number): number => {
  const offset = (y * image.width + x) * 4;
  const [red = 255, green = 255, blue = 255] = image.data.subarray(offset, offset + 3);
  return (red + green + blue) / 3;
};

const getRegionMatchRatio = (
  image: PNG,
  pageWidthMm: number,
  region: MillimeterRegion,
  predicate: (luminance: number) => boolean,
): number => {
  const pixelsPerMillimeter = image.width / pageWidthMm;
  const left = Math.max(0, Math.round(region.x * pixelsPerMillimeter));
  const top = Math.max(0, Math.round(region.y * pixelsPerMillimeter));
  const right = Math.min(image.width, Math.round((region.x + region.width) * pixelsPerMillimeter));
  const bottom = Math.min(
    image.height,
    Math.round((region.y + region.height) * pixelsPerMillimeter),
  );
  let matches = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (predicate(getPixelLuminance(image, x, y))) matches += 1;
      total += 1;
    }
  }
  return total === 0 ? 0 : matches / total;
};

const cropMillimeterRegion = (image: PNG, pageWidthMm: number, region: MillimeterRegion): PNG => {
  const pixelsPerMillimeter = image.width / pageWidthMm;
  const sourceX = Math.round(region.x * pixelsPerMillimeter);
  const sourceY = Math.round(region.y * pixelsPerMillimeter);
  const width = Math.round(region.width * pixelsPerMillimeter);
  const height = Math.round(region.height * pixelsPerMillimeter);
  const target = new PNG({ width, height });
  PNG.bitblt(image, target, sourceX, sourceY, width, height, 0, 0);
  return target;
};

const boletoSchema: BoletoSchema = { ...(boleto.propPanel.defaultSchema as BoletoSchema) };

const template: Template = {
  basePdf: {
    width: PAGE_WIDTH_MM,
    height: PAGE_HEIGHT_MM,
    padding: [0, 0, 0, 0],
  },
  schemas: [[boletoSchema]],
};

const buildBoletoData = (index: number): BoletoData => {
  const sequence = index + 1;
  const documentValueCents = 12_345 + index * 3721;
  const discountDeductionCents = index % 2 === 0 ? 250 : 0;
  const barcode = buildBoletoBarcode({
    institutionCode: '001',
    dueDate: '2026-08-31',
    amountMode: 'fixed',
    documentValueCents,
    // Synthetic test fixture only. Real callers must receive this field from their bank/provider.
    freeField: String(sequence).padStart(25, '0'),
  });

  return {
    version: 1,
    kind: 'cobranca',
    registrationStatus: 'test',
    institution: {
      name: 'Banco de Teste',
      code: '001',
      codeDigit: '9',
    },
    beneficiaryMode: 'direct',
    beneficiary: {
      name: 'PDFweave Servicos Documentais Ltda.',
      taxId: { type: 'cnpj', number: '11.222.333/0001-81' },
      address: {
        street: 'Avenida Paulista',
        number: '1000',
        complement: 'Conjunto 42',
        district: 'Bela Vista',
        city: 'Sao Paulo',
        state: 'SP',
        postalCode: '01310-100',
      },
    },
    payer: {
      name: `Cliente Demonstracao ${String(sequence).padStart(2, '0')}`,
      taxId: { type: 'cpf', number: '529.982.247-25' },
      address: {
        street: 'Rua das Flores',
        number: String(100 + index),
        district: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        postalCode: '80010-000',
      },
    },
    paymentLocation: 'Pagavel em qualquer banco ate o vencimento',
    dueDate: '2026-08-31',
    barcode,
    digitableLine: formatDigitableLine(barcode),
    amountMode: 'fixed',
    documentValueCents,
    agencyBeneficiaryCode: '1234 / 56789-0',
    documentDate: '2026-08-01',
    documentNumber: `DM-2026-${String(sequence).padStart(4, '0')}`,
    documentSpecies: 'DM',
    acceptance: 'N',
    processingDate: '2026-08-01',
    ourNumber: `123456789${String(sequence).padStart(2, '0')}-0`,
    bankUse: `CTRL-${String(sequence).padStart(4, '0')}`,
    portfolio: '17',
    instructions: [
      'AMOSTRA DE TESTE SEM VALOR DE PAGAMENTO.',
      'Nao receber apos o vencimento.',
      `Referencia do servico: FAT-${String(sequence).padStart(5, '0')}.`,
    ],
    discountDeductionCents,
    interestPenaltyCents: 0,
    chargedAmountCents: documentValueCents - discountDeductionCents,
  };
};

const data = Array.from({ length: PAGE_COUNT }, (_, index) => buildBoletoData(index));

describe('boleto book generator evidence', () => {
  test('renders seven distinct specification-validated test boletos as inspectable artifacts', async () => {
    const barcodes = data.map(({ barcode }) => barcode);
    const digitableLines = data.map(({ barcode }) => deriveDigitableLine(barcode));

    expect(new Set(barcodes).size).toBe(PAGE_COUNT);
    expect(new Set(digitableLines).size).toBe(PAGE_COUNT);
    expect(data.every(({ registrationStatus }) => registrationStatus === 'test')).toBe(true);

    const pdf = await generate({
      inputs: data.map((boletoData) => ({ boleto: boletoData })),
      template,
      plugins: { boleto },
      options: {
        author: 'PDFweave qualification tests',
        creationDate: fixedMetadataDate,
        modificationDate: fixedMetadataDate,
        producer: '@pdfweave/generator test suite',
        subject: 'Non-payable boleto component rendering evidence',
        title: 'Boleto book - AMOSTRA - NAO PAGAVEL',
      },
    });
    const outputDocument = await PDFDocument.load(pdf);
    const pages = outputDocument.getPages();
    const images = await pdfToImages(pdf);
    const scanImages = await pdf2img(pdf, { imageType: 'png', scale: SCAN_DPI / 72 });
    const barcodeScanResults = scanImages.map((image) =>
      tryDecodeItfRaster(cropBarcodeAcquisitionRegion(image), SCAN_DPI),
    );
    const firstScanImage = scanImages.at(0);
    expect(firstScanImage).toBeDefined();
    if (!firstScanImage) throw new Error('Expected a first 300 DPI boleto scan');
    const headerVectorValidation = {
      institutionCode: measureDarkRasterBounds(firstScanImage, {
        x: 34.3,
        y: 1,
        width: 14.4,
        height: 7,
      }),
    };
    const gridEdgeValidation = {
      top: measureDarkRasterBounds(firstScanImage, {
        x: 170,
        y: 0,
        width: 10,
        height: 0.8,
      }),
      left: measureDarkRasterBounds(firstScanImage, {
        x: 0,
        y: 54,
        width: 0.8,
        height: 5,
      }),
      right: measureDarkRasterBounds(firstScanImage, {
        x: 199.2,
        y: 68,
        width: 0.8,
        height: 5,
      }),
    };

    expect(outputDocument.getPageCount()).toBe(PAGE_COUNT);
    for (const page of pages) {
      expect(page.getWidth()).toBeCloseTo(mm2pt(PAGE_WIDTH_MM), 5);
      expect(page.getHeight()).toBeCloseTo(mm2pt(PAGE_HEIGHT_MM), 5);
    }
    expect(images).toHaveLength(PAGE_COUNT);
    expect(images.every((image) => image.byteLength > 10_000)).toBe(true);
    expect(barcodeScanResults.every((result) => result === undefined)).toBe(true);
    expect(headerVectorValidation.institutionCode.heightMillimeters).toBeGreaterThanOrEqual(4.8);
    expect(headerVectorValidation.institutionCode.heightMillimeters).toBeLessThanOrEqual(5.2);
    expect(gridEdgeValidation.top.topMillimeters).toBe(0);
    expect(gridEdgeValidation.top.heightMillimeters).toBeGreaterThanOrEqual(0.25);
    expect(gridEdgeValidation.top.heightMillimeters).toBeLessThanOrEqual(0.45);
    expect(gridEdgeValidation.left.leftMillimeters).toBe(0);
    expect(gridEdgeValidation.left.widthMillimeters).toBeGreaterThanOrEqual(0.25);
    expect(gridEdgeValidation.left.widthMillimeters).toBeLessThanOrEqual(0.45);
    expect(gridEdgeValidation.right.widthMillimeters).toBeGreaterThanOrEqual(0.22);
    expect(gridEdgeValidation.right.widthMillimeters).toBeLessThanOrEqual(0.45);
    expect(
      gridEdgeValidation.right.leftMillimeters + gridEdgeValidation.right.widthMillimeters,
    ).toBeGreaterThanOrEqual(PAGE_WIDTH_MM - 0.1);
    expect(
      gridEdgeValidation.right.leftMillimeters + gridEdgeValidation.right.widthMillimeters,
    ).toBeLessThanOrEqual(PAGE_WIDTH_MM + 0.1);

    for (const index of [0, 3, 6]) {
      const renderedPage = images.at(index);
      expect(renderedPage).toBeDefined();
      await expect(renderedPage).toMatchImage(
        getImageSnapshotOptions(`boleto-book-page-${String(index + 1).padStart(2, '0')}`),
      );
    }

    rmSync(artifactDirectory, { recursive: true, force: true });
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(path.join(artifactDirectory, 'boleto-book.pdf'), pdf);
    for (const [index, image] of images.entries()) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- controlled artifact path
      writeFileSync(
        path.join(artifactDirectory, `boleto-book-page-${String(index + 1).padStart(2, '0')}.png`),
        image,
      );
    }
    const manifest = {
      scenario: 'boleto-book',
      generatedBy: '@pdfweave/generator boleto integration test',
      classification: 'specification-validated synthetic test fixture',
      disclaimer: 'AMOSTRA - NAO PAGAVEL. Not bank-issued, payable, certified, or homologated.',
      pageCount: pages.length,
      pageSizeMm: { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM },
      paymentIdentifierPolicy: {
        registrationStatus: 'test',
        barcodeRendered: false,
        digitableLineRendered: false,
        decodedBarcodeCount: barcodeScanResults.filter(Boolean).length,
        identifierValuesIncludedInManifest: false,
      },
      documents: data.map((boletoData, index) => ({
        page: index + 1,
        documentNumber: boletoData.documentNumber,
        payer: boletoData.payer.name,
        dueDate: boletoData.dueDate,
        amountCents: boletoData.documentValueCents,
        registrationStatus: boletoData.registrationStatus,
      })),
      output: {
        pdfBytes: pdf.byteLength,
        pdfSha256: createHash('sha256').update(pdf).digest('hex'),
        pngCount: images.length,
        pngSha256: images.map((image) => createHash('sha256').update(image).digest('hex')),
        rasterValidation: {
          dpi: SCAN_DPI,
          barcodeAcquisitionRegionsDecoded: barcodeScanResults.filter(Boolean).length,
          headerVectorMetrics: {
            expected: {
              institutionCode: { glyphHeightMillimeters: 5, strokeMillimeters: 1.2 },
            },
            measuredInkBounds: headerVectorValidation,
          },
          gridEdgeMetrics: {
            expected: {
              strokeMillimeters: 0.3,
              fullyInsidePage: true,
              sharedEdgesMerged: true,
            },
            measuredInkBounds: gridEdgeValidation,
          },
        },
      },
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    for (const [index, barcode] of barcodes.entries()) {
      const line = digitableLines[index];
      if (!line) throw new Error(`Missing digitable line for boleto ${String(index + 1)}`);
      expect(manifestText).not.toContain(barcode);
      expect(manifestText).not.toContain(line);
      expect(manifestText).not.toContain(formatDigitableLine(barcode));
    }
    writeFileSync(path.join(artifactDirectory, 'manifest.json'), manifestText);
  });

  test('renders registered barcode and digitable-line mechanics in memory', async () => {
    const registeredData: BoletoData = {
      ...buildBoletoData(0),
      registrationStatus: 'registered',
    };
    const pdf = await generate({
      inputs: [{ boleto: registeredData }],
      template,
      plugins: { boleto },
      options: {
        creationDate: fixedMetadataDate,
        modificationDate: fixedMetadataDate,
      },
    });
    const [scanBytes] = await pdf2img(pdf, { imageType: 'png', scale: SCAN_DPI / 72 });
    expect(scanBytes).toBeDefined();
    if (!scanBytes) throw new Error('Expected a registered boleto raster');

    const barcodeValidation = decodeItfRaster(cropBarcodeAcquisitionRegion(scanBytes), SCAN_DPI);
    const digitableLineBounds = measureDarkRasterBounds(scanBytes, {
      x: 49.5,
      y: 1,
      width: 115,
      height: 7,
    });

    expect(barcodeValidation.value).toBe(registeredData.barcode);
    expect(barcodeValidation.quietZoneMillimeters.left).toBeGreaterThanOrEqual(5);
    expect(barcodeValidation.quietZoneMillimeters.right).toBeGreaterThanOrEqual(5);
    expect(digitableLineBounds.heightMillimeters).toBeGreaterThanOrEqual(3.8);
    expect(digitableLineBounds.heightMillimeters).toBeLessThanOrEqual(4.2);
    expect(digitableLineBounds.leftMillimeters).toBeGreaterThanOrEqual(49.9);
    expect(digitableLineBounds.leftMillimeters).toBeLessThanOrEqual(50.2);
  });

  test('stamps an opaque boleto onto an asymmetric CropBox base PDF', async () => {
    const patternedBase = await buildPatternedCropBoxBasePdf();
    const cropBoxSchema: BoletoSchema = {
      ...boletoSchema,
      position: { ...CROP_BOX_BOLETO_POSITION },
    };
    const cropBoxTemplate: Template = {
      basePdf: patternedBase.bytes,
      schemas: [[cropBoxSchema]],
    };
    const boletoData = buildBoletoData(0);
    const boletoPdfSpy = vi.spyOn(boleto, 'pdf');
    let pdf: Uint8Array<ArrayBuffer>;
    let renderedPosition: { x: number; y: number };

    try {
      pdf = await generate({
        inputs: [{ boleto: boletoData }],
        template: cropBoxTemplate,
        plugins: { boleto },
        options: {
          author: 'PDFweave qualification tests',
          creationDate: fixedMetadataDate,
          modificationDate: fixedMetadataDate,
          producer: '@pdfweave/generator test suite',
          subject: 'Boleto opaque backing and asymmetric CropBox evidence',
          title: 'Boleto over patterned base PDF - AMOSTRA - NAO PAGAVEL',
        },
      });
      const renderedSchema = boletoPdfSpy.mock.calls.at(0)?.[0].schema;
      if (!renderedSchema) throw new Error('Boleto plugin was not invoked');
      renderedPosition = { ...renderedSchema.position };
    } finally {
      boletoPdfSpy.mockRestore();
    }

    const expectedInternalPosition = {
      x: CROP_BOX_BOLETO_POSITION.x + pt2mm(patternedBase.cropBox.x),
      y:
        CROP_BOX_BOLETO_POSITION.y +
        pt2mm(
          patternedBase.mediaBox.height - patternedBase.cropBox.y - patternedBase.cropBox.height,
        ),
    };
    expect(renderedPosition.x).toBeLessThan(0);
    expect(renderedPosition.y).toBeLessThan(0);
    expect(renderedPosition.x).toBeCloseTo(expectedInternalPosition.x, 5);
    expect(renderedPosition.y).toBeCloseTo(expectedInternalPosition.y, 5);

    const outputDocument = await PDFDocument.load(pdf);
    expect(outputDocument.getPageCount()).toBe(1);
    const [outputPage] = outputDocument.getPages();
    expect(outputPage).toBeDefined();
    const outputMediaBox = outputPage.getMediaBox();
    const outputCropBox = outputPage.getCropBox();
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(outputMediaBox[key]).toBeCloseTo(patternedBase.mediaBox[key], 5);
      expect(outputCropBox[key]).toBeCloseTo(patternedBase.cropBox[key], 5);
    }

    const [preview] = await pdfToImages(pdf);
    const [scanBytes] = await pdf2img(pdf, { imageType: 'png', scale: SCAN_DPI / 72 });
    expect(preview).toBeDefined();
    expect(scanBytes).toBeDefined();
    const scan = PNG.sync.read(Buffer.from(new Uint8Array(scanBytes)));
    const renderedHeightMm = scan.height / (scan.width / CROP_BOX_WIDTH_MM);
    expect(renderedHeightMm).toBeCloseTo(CROP_BOX_HEIGHT_MM, 0);

    const whiteFichaRatio = getRegionMatchRatio(
      scan,
      CROP_BOX_WIDTH_MM,
      {
        x: CROP_BOX_BOLETO_POSITION.x + 0.5,
        y: CROP_BOX_BOLETO_POSITION.y + 0.5,
        width: cropBoxSchema.width - 1,
        height: cropBoxSchema.height - 1,
      },
      (luminance) => luminance >= 245,
    );
    const darkOutsideRatios = {
      top: getRegionMatchRatio(
        scan,
        CROP_BOX_WIDTH_MM,
        { x: 0, y: 0, width: CROP_BOX_WIDTH_MM, height: 8 },
        (luminance) => luminance < 128,
      ),
      bottom: getRegionMatchRatio(
        scan,
        CROP_BOX_WIDTH_MM,
        { x: 0, y: 107, width: CROP_BOX_WIDTH_MM, height: 13 },
        (luminance) => luminance < 128,
      ),
      left: getRegionMatchRatio(
        scan,
        CROP_BOX_WIDTH_MM,
        { x: 0, y: 10, width: 3, height: 95 },
        (luminance) => luminance < 128,
      ),
      right: getRegionMatchRatio(
        scan,
        CROP_BOX_WIDTH_MM,
        { x: 207, y: 10, width: 3, height: 95 },
        (luminance) => luminance < 128,
      ),
    };
    expect(whiteFichaRatio).toBeGreaterThan(0.75);
    for (const ratio of Object.values(darkOutsideRatios)) {
      expect(ratio).toBeGreaterThan(0.95);
    }

    const barcodeScan = cropMillimeterRegion(scan, CROP_BOX_WIDTH_MM, {
      x: CROP_BOX_BOLETO_POSITION.x,
      y: CROP_BOX_BOLETO_POSITION.y + 74,
      width: 113,
      height: 18,
    });
    const barcodeDecode = tryDecodeItfRaster(barcodeScan, SCAN_DPI);
    expect(barcodeDecode).toBeUndefined();
    await expect(preview).toMatchImage(
      getImageSnapshotOptions('boleto-asymmetric-cropbox-base-page-01'),
    );

    rmSync(cropBoxArtifactDirectory, { recursive: true, force: true });
    mkdirSync(cropBoxArtifactDirectory, { recursive: true });
    writeFileSync(path.join(cropBoxArtifactDirectory, 'boleto-asymmetric-cropbox-base.pdf'), pdf);
    writeFileSync(
      path.join(cropBoxArtifactDirectory, 'boleto-asymmetric-cropbox-base-page-01.png'),
      preview,
    );
    const cropBoxManifest = {
      scenario: 'boleto-asymmetric-cropbox-base',
      generatedBy: '@pdfweave/generator boleto integration test',
      classification: 'specification-validated synthetic test fixture',
      disclaimer: 'AMOSTRA - NAO PAGAVEL. Not bank-issued, payable, certified, or homologated.',
      sourcePageBoxesPt: {
        mediaBox: patternedBase.mediaBox,
        cropBox: patternedBase.cropBox,
      },
      visiblePageSizeMm: {
        width: CROP_BOX_WIDTH_MM,
        height: CROP_BOX_HEIGHT_MM,
      },
      authoredBoletoPositionMm: CROP_BOX_BOLETO_POSITION,
      renderedInternalPositionMm: renderedPosition,
      expectedInternalPositionMm: expectedInternalPosition,
      outputPageBoxesPt: {
        mediaBox: outputMediaBox,
        cropBox: outputCropBox,
      },
      rasterValidation: {
        dpi: SCAN_DPI,
        pixelSize: { width: scan.width, height: scan.height },
        renderedHeightMm,
        whiteFichaRatio,
        darkOutsideRatios,
        barcodeAcquisitionRegionDecoded: barcodeDecode !== undefined,
      },
      paymentIdentifierPolicy: {
        registrationStatus: 'test',
        barcodeRendered: false,
        digitableLineRendered: false,
        identifierValuesIncludedInManifest: false,
      },
      output: {
        pdfBytes: pdf.byteLength,
        pdfSha256: createHash('sha256').update(pdf).digest('hex'),
        pngBytes: preview.byteLength,
        pngSha256: createHash('sha256').update(preview).digest('hex'),
      },
    };
    const cropBoxManifestText = `${JSON.stringify(cropBoxManifest, null, 2)}\n`;
    expect(cropBoxManifestText).not.toContain(boletoData.barcode);
    expect(cropBoxManifestText).not.toContain(deriveDigitableLine(boletoData.barcode));
    expect(cropBoxManifestText).not.toContain(formatDigitableLine(boletoData.barcode));
    writeFileSync(path.join(cropBoxArtifactDirectory, 'manifest.json'), cropBoxManifestText);
  });

  test('embeds one constant institution logo across 100 variable boleto pages', async () => {
    const embedPngSpy = vi.spyOn(PDFDocument.prototype, 'embedPng');
    const boletoPdfSpy = vi.spyOn(boleto, 'pdf');
    const inputs = Array.from({ length: 100 }, (_, index) => {
      const boletoData = buildBoletoData(index);
      return {
        boleto: {
          ...boletoData,
          institution: {
            ...boletoData.institution,
            logo: CONSTANT_INSTITUTION_LOGO,
          },
        },
      };
    });

    try {
      const pdf = await generate({
        inputs,
        template,
        plugins: { boleto },
        options: {
          author: 'PDFweave qualification tests',
          creationDate: fixedMetadataDate,
          modificationDate: fixedMetadataDate,
          producer: '@pdfweave/generator test suite',
          subject: 'Boleto shared-resource evidence',
          title: '100 boleto records - shared institution logo',
        },
      });
      const outputDocument = await PDFDocument.load(pdf);
      const inputBarcodes = inputs.map(({ boleto: item }) => item.barcode);
      const validatedInputBarcodes = boletoPdfSpy.mock.calls.map(
        ([arg]) => parseBoletoData(arg.value).barcode,
      );
      const distinctInputBarcodeCount = new Set(inputBarcodes).size;
      const representativeImages = await renderRepresentativePages(outputDocument);

      expect(outputDocument.getPageCount()).toBe(100);
      expect(distinctInputBarcodeCount).toBe(100);
      expect(validatedInputBarcodes).toEqual(inputBarcodes);
      expect(embedPngSpy).toHaveBeenCalledTimes(1);
      expect(pdf.byteLength).toBeLessThan(5_000_000);
      expect(representativeImages).toHaveLength(REPRESENTATIVE_PAGE_INDEXES.length);
      expect(representativeImages.every((image) => image.byteLength > 10_000)).toBe(true);

      for (const [previewIndex, image] of representativeImages.entries()) {
        const sourcePage = REPRESENTATIVE_PAGE_INDEXES[previewIndex] + 1;
        await expect(image).toMatchImage(
          getImageSnapshotOptions(`100-boleto-records-page-${String(sourcePage).padStart(3, '0')}`),
        );
      }

      rmSync(batchArtifactDirectory, { recursive: true, force: true });
      mkdirSync(batchArtifactDirectory, { recursive: true });
      writeFileSync(path.join(batchArtifactDirectory, '100-boleto-records.pdf'), pdf);
      for (const [previewIndex, image] of representativeImages.entries()) {
        const sourcePage = REPRESENTATIVE_PAGE_INDEXES[previewIndex] + 1;
        writeFileSync(
          path.join(
            batchArtifactDirectory,
            `100-boleto-records-page-${String(sourcePage).padStart(3, '0')}.png`,
          ),
          image,
        );
      }
      const manifest = {
        scenario: '100-boleto-records',
        generatedBy: '@pdfweave/generator boleto integration test',
        classification: 'specification-validated synthetic test fixture',
        disclaimer: 'AMOSTRA - NAO PAGAVEL. Not bank-issued, payable, certified, or homologated.',
        pageCount: outputDocument.getPageCount(),
        distinctInputBarcodeCount,
        validatedInputBarcodeCount: validatedInputBarcodes.length,
        paymentIdentifierPolicy: {
          registrationStatus: 'test',
          barcodeRendered: false,
          digitableLineRendered: false,
          identifierValuesIncludedInManifest: false,
        },
        representativeRecords: REPRESENTATIVE_PAGE_INDEXES.map((index) => ({
          page: index + 1,
          documentNumber: inputs[index]?.boleto.documentNumber,
          payer: inputs[index]?.boleto.payer.name,
          amountCents: inputs[index]?.boleto.documentValueCents,
        })),
        constantResources: {
          institutionLogoInputCount: inputs.length,
          institutionLogoEmbedCount: embedPngSpy.mock.calls.length,
          institutionLogoSha256: createHash('sha256')
            .update(CONSTANT_INSTITUTION_LOGO)
            .digest('hex'),
        },
        output: {
          pdfBytes: pdf.byteLength,
          maximumPdfBytes: 5_000_000,
          pdfSha256: createHash('sha256').update(pdf).digest('hex'),
          previewPages: REPRESENTATIVE_PAGE_INDEXES.map((index) => index + 1),
          pngCount: representativeImages.length,
          pngSha256: representativeImages.map((image) =>
            createHash('sha256').update(image).digest('hex'),
          ),
        },
      };
      const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
      for (const barcode of inputBarcodes) {
        expect(manifestText).not.toContain(barcode);
        expect(manifestText).not.toContain(deriveDigitableLine(barcode));
        expect(manifestText).not.toContain(formatDigitableLine(barcode));
      }
      writeFileSync(path.join(batchArtifactDirectory, 'manifest.json'), manifestText);
    } finally {
      embedPngSpy.mockRestore();
      boletoPdfSpy.mockRestore();
    }
  }, 180_000);

  test('uses the public default schema as an input-bound required field', async () => {
    expect(boletoSchema).toEqual(boleto.propPanel.defaultSchema);
    await expect(generate({ inputs: [{}], template, plugins: { boleto } })).rejects.toThrow(
      "[@pdfweave/generator] input for 'boleto' is required",
    );
  });
});
