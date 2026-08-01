import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from '@pdfweave/pdf-lib';
import { impose, MM_TO_PT, type ImpositionPlan } from '../../src/index.js';
import { pdfToImages, writeArtifacts } from '../helpers.js';

const mm = (value: number): number => value * MM_TO_PT;

const drawBarcode = (page: PDFPage, x: number, y: number, width: number, height: number): void => {
  const pattern = [1, 1, 2, 1, 3, 1, 1, 2, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1];
  const unit = width / pattern.reduce((sum, value) => sum + value, 0);
  let cursor = x;
  for (const [index, barWidth] of pattern.entries()) {
    const actualWidth = barWidth * unit;
    if (index % 2 === 0) {
      page.drawRectangle({
        x: cursor,
        y,
        width: actualWidth,
        height,
        color: rgb(0.05, 0.07, 0.08),
      });
    }
    cursor += actualWidth;
  }
};

const createBoletoBook = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const clients = [
    'Almeida Comercio Ltda.',
    'Borges Servicos Digitais',
    'Costa & Lima Distribuidora',
    'Duarte Equipamentos',
    'Estrela Logistica',
    'Ferreira Materiais',
    'Gomes Tecnologia',
  ];

  for (const [index, client] of clients.entries()) {
    const page = document.addPage([mm(190), mm(85)]);
    const amount = (875.35 + index * 143.27).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    page.drawRectangle({ x: 0, y: 0, width: mm(190), height: mm(85), color: rgb(1, 1, 1) });
    page.drawRectangle({
      x: 0,
      y: mm(68),
      width: mm(190),
      height: mm(17),
      color: rgb(0.05, 0.25, 0.32),
    });
    page.drawText('BANCO PDFWEAVE', {
      x: mm(5),
      y: mm(74),
      size: 13,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(`00190.00009 01234.567890 0000${index + 1}.000000 1 99990000${index + 1}`, {
      x: mm(60),
      y: mm(74.5),
      size: 7,
      font: regular,
      color: rgb(1, 1, 1),
    });
    page.drawText('Pagador', {
      x: mm(5),
      y: mm(62),
      size: 6,
      font: regular,
      color: rgb(0.3, 0.35, 0.38),
    });
    page.drawText(client, {
      x: mm(5),
      y: mm(56),
      size: 10,
      font: bold,
      color: rgb(0.08, 0.12, 0.14),
    });
    page.drawText('Vencimento', {
      x: mm(137),
      y: mm(62),
      size: 6,
      font: regular,
      color: rgb(0.3, 0.35, 0.38),
    });
    page.drawText(`15/0${(index % 8) + 1}/2026`, { x: mm(137), y: mm(56), size: 9, font: bold });
    page.drawText('Valor do documento', {
      x: mm(160),
      y: mm(62),
      size: 6,
      font: regular,
      color: rgb(0.3, 0.35, 0.38),
    });
    page.drawText(`R$ ${amount}`, { x: mm(160), y: mm(56), size: 9, font: bold });
    page.drawLine({
      start: { x: mm(5), y: mm(50) },
      end: { x: mm(185), y: mm(50) },
      thickness: 0.6,
      color: rgb(0.55, 0.6, 0.62),
    });
    page.drawText(`Documento ${String(index + 1).padStart(3, '0')}/2026`, {
      x: mm(5),
      y: mm(44),
      size: 8,
      font: regular,
    });
    page.drawText('Autenticacao mecanica', {
      x: mm(137),
      y: mm(44),
      size: 7,
      font: regular,
      color: rgb(0.3, 0.35, 0.38),
    });
    drawBarcode(page, mm(5), mm(8), mm(180), mm(28));
  }
  return document.save();
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

describe('n-up production artifacts', () => {
  test('packs seven boleto-style items three-up across three A4 sheets', async () => {
    const result = await impose({
      source: await createBoletoBook(),
      sheet: { size: 'A4', margins: 6, gutter: { horizontal: 0, vertical: 3 } },
      layout: { type: 'n-up', rows: 3, columns: 1 },
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
      sheetCount: 3,
      capacity: 3,
      warnings: [],
    });
    expect(result.plan.sheets[2].front.emptySlots).toHaveLength(2);
    expect(images).toHaveLength(3);
    for (const [index, image] of images.entries()) {
      expect(image.byteLength).toBeGreaterThan(10_000);
      await expect(image).toMatchImage(`a4-boleto-booklet-sheet-${index + 1}`);
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
      await expect(image).toMatchImage(`a3-client-statements-sheet-${index + 1}`);
    }
  });
});
