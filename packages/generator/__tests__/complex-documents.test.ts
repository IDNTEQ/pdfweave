import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLANK_A4_PDF,
  getDynamicTemplate,
  resolveSchemaValue,
  type LayoutMeasureResult,
  type Schema,
  type Template,
} from '@pdfweave/common';
import { PDFDocument } from '@pdfweave/pdf-lib';
import { table, text } from '@pdfweave/schemas';
import generate from '../src/generate.js';
import { getImageSnapshotOptions, pdfToImages } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.join(__dirname, '..', 'test-artifacts', 'complex-documents');
const fixedMetadataDate = new Date('2026-01-15T12:00:00.000Z');

type DocumentInput = Record<string, unknown>;
interface RowRange {
  page: number;
  start: number;
  end: number;
}

const cellStyles = {
  fontName: undefined,
  alignment: 'left' as const,
  verticalAlignment: 'middle' as const,
  fontSize: 8,
  lineHeight: 1.15,
  characterSpacing: 0,
  fontColor: '#1f2933',
  backgroundColor: '',
  borderColor: '#c7cdd4',
  borderWidth: { top: 0.15, right: 0.15, bottom: 0.15, left: 0.15 },
  padding: { top: 2, right: 2, bottom: 2, left: 2 },
};

const staticText = (
  name: string,
  content: string,
  position: { x: number; y: number },
  width: number,
  height: number,
  extra: Record<string, unknown> = {},
): Schema => ({
  name,
  type: 'text',
  content,
  readOnly: true,
  position,
  width,
  height,
  fontSize: 9,
  ...extra,
});

const pageFurniture = (documentLabel: string): Schema[] => [
  staticText('pageBrand', 'PDFWEAVE DOCUMENT SERVICES', { x: 12, y: 10 }, 125, 8, {
    fontSize: 13,
    fontColor: '#12344d',
  }),
  staticText('pageDocumentType', documentLabel, { x: 137, y: 10 }, 61, 8, {
    alignment: 'right',
    fontSize: 9,
    fontColor: '#52606d',
  }),
  staticText(
    'pageFooter',
    'Confidential | Page {currentPage} of {totalPages}',
    { x: 12, y: 282 },
    186,
    6,
    { alignment: 'center', fontSize: 7, fontColor: '#616e7c' },
  ),
];

const boundText = (
  name: string,
  pathValue: string,
  position: { x: number; y: number },
  width: number,
  height: number,
  extra: Record<string, unknown> = {},
): Schema => ({
  name,
  type: 'text',
  content: '',
  binding: { path: pathValue },
  position,
  width,
  height,
  fontSize: 9,
  ...extra,
});

const buildInvoiceInput = (): DocumentInput => {
  const lineItems = Array.from({ length: 72 }, (_, index) => {
    const quantity = (index % 5) + 1;
    const unitPrice = 8.75 + (index % 11) * 2.35;
    const description =
      index % 9 === 0
        ? `Managed document service ${String(index + 1).padStart(3, '0')} with archival media and verified delivery`
        : `Print service ${String(index + 1).padStart(3, '0')}`;
    return {
      description,
      quantity,
      unitPrice,
      amount: Number((quantity * unitPrice).toFixed(2)),
    };
  });
  const subtotal = Number(lineItems.reduce((sum, lineItem) => sum + lineItem.amount, 0).toFixed(2));
  const tax = Number((subtotal * 0.0825).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  return {
    invoiceNumber: 'INV-2026-004281',
    invoiceDate: 'January 15, 2026',
    customerName: 'Northwind Regional Distribution',
    customerAddress: '1840 Market Street, Suite 600, Philadelphia, PA 19103',
    lineItems: [
      ...lineItems,
      { description: 'SUBTOTAL', quantity: null, unitPrice: null, amount: subtotal },
      { description: 'SALES TAX (8.25%)', quantity: null, unitPrice: null, amount: tax },
      { description: 'TOTAL DUE', quantity: null, unitPrice: null, amount: total },
    ],
    subtotal,
    tax,
    total,
  };
};

const buildInvoiceTemplate = (rowCount: number): Template => {
  const totalRowStyles = Object.fromEntries(
    [rowCount - 3, rowCount - 2, rowCount - 1].map((rowIndex, index) => [
      rowIndex,
      {
        backgroundColor: index === 2 ? '#d9eaf2' : '#eef3f6',
        textColor: '#102a43',
        fontSize: index === 2 ? 9 : 8,
        cells: {
          0: { alignment: 'right' },
          3: { alignment: 'right' },
        },
      },
    ]),
  );

  return {
    basePdf: {
      ...BLANK_A4_PDF,
      padding: [10, 12, 10, 12],
      staticSchema: pageFurniture('INVOICE'),
    },
    schemas: [
      [
        staticText('invoiceTitle', 'INVOICE', { x: 12, y: 32 }, 80, 10, {
          fontSize: 22,
          fontColor: '#102a43',
        }),
        staticText('invoiceNumberLabel', 'Invoice number', { x: 128, y: 32 }, 30, 5, {
          fontSize: 7,
          fontColor: '#616e7c',
        }),
        boundText('invoiceNumber', 'invoiceNumber', { x: 158, y: 31 }, 40, 7, {
          alignment: 'right',
          fontSize: 10,
        }),
        staticText('invoiceDateLabel', 'Issue date', { x: 128, y: 40 }, 30, 5, {
          fontSize: 7,
          fontColor: '#616e7c',
        }),
        boundText('invoiceDate', 'invoiceDate', { x: 158, y: 39 }, 40, 7, {
          alignment: 'right',
          fontSize: 9,
        }),
        staticText('billToLabel', 'BILL TO', { x: 12, y: 48 }, 40, 5, {
          fontSize: 7,
          fontColor: '#616e7c',
        }),
        boundText('customerName', 'customerName', { x: 12, y: 54 }, 100, 6, {
          fontSize: 10,
        }),
        boundText('customerAddress', 'customerAddress', { x: 12, y: 60 }, 120, 7, {
          fontSize: 8,
          fontColor: '#52606d',
        }),
        {
          name: 'lineItems',
          type: 'table',
          content: '[]',
          binding: {
            path: 'lineItems',
            columns: [
              { path: 'description', label: 'Description', widthPercentage: 52 },
              {
                path: 'quantity',
                label: 'Qty',
                widthPercentage: 10,
                format: { kind: 'number', maximumFractionDigits: 0 },
              },
              {
                path: 'unitPrice',
                label: 'Unit price',
                widthPercentage: 18,
                format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
              },
              {
                path: 'amount',
                label: 'Amount',
                widthPercentage: 20,
                format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
              },
            ],
          },
          position: { x: 12, y: 72 },
          width: 186,
          height: 20,
          showHead: true,
          repeatHead: true,
          head: ['Description', 'Qty', 'Unit price', 'Amount'],
          headWidthPercentages: [52, 10, 18, 20],
          tableStyles: { borderColor: '#829ab1', borderWidth: 0.3 },
          headStyles: {
            ...cellStyles,
            alignment: 'center',
            fontColor: '#ffffff',
            backgroundColor: '#243b53',
            borderColor: '#243b53',
          },
          bodyStyles: { ...cellStyles, alternateBackgroundColor: '#f5f7fa' },
          columnStyles: {
            alignment: { 0: 'left', 1: 'right', 2: 'right', 3: 'right' },
          },
          rowStyles: totalRowStyles,
        },
      ],
    ],
  };
};

const buildBankInput = (): DocumentInput => {
  let balance = 12_480.55;
  const transactions = Array.from({ length: 96 }, (_, index) => {
    const credit = index % 11 === 0 ? 1450 + index * 3.25 : null;
    const debit = credit === null ? 18.45 + (index % 13) * 7.15 : null;
    balance = Number((balance + (credit ?? 0) - (debit ?? 0)).toFixed(2));
    return {
      date: `2026-01-${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
      reference: `TX-${String(index + 1).padStart(6, '0')}`,
      description:
        index % 8 === 0
          ? 'Automated clearing settlement with extended remittance reference'
          : `Account activity ${String(index + 1).padStart(3, '0')}`,
      debit,
      credit,
      balance,
    };
  });

  return {
    accountName: 'Contoso Commercial Operations',
    accountNumber: '**** 8842',
    statementPeriod: 'January 1-31, 2026',
    openingBalance: 12_480.55,
    transactions: [
      ...transactions,
      {
        date: '2026-01-31',
        reference: '',
        description: 'CLOSING BALANCE',
        debit: null,
        credit: null,
        balance,
      },
    ],
    closingBalance: balance,
  };
};

const buildBankTemplate = (rowCount: number): Template => ({
  basePdf: {
    ...BLANK_A4_PDF,
    padding: [10, 12, 10, 12],
    staticSchema: pageFurniture('BANK EXTRACT'),
  },
  schemas: [
    [
      staticText('statementTitle', 'ACCOUNT STATEMENT', { x: 12, y: 32 }, 100, 9, {
        fontSize: 18,
        fontColor: '#102a43',
      }),
      staticText('accountNameLabel', 'Account', { x: 12, y: 45 }, 24, 5, {
        fontSize: 7,
        fontColor: '#616e7c',
      }),
      boundText('accountName', 'accountName', { x: 36, y: 44 }, 85, 6, { fontSize: 9 }),
      staticText('accountNumberLabel', 'Number', { x: 128, y: 45 }, 24, 5, {
        fontSize: 7,
        fontColor: '#616e7c',
      }),
      boundText('accountNumber', 'accountNumber', { x: 152, y: 44 }, 46, 6, {
        alignment: 'right',
        fontSize: 9,
      }),
      staticText('periodLabel', 'Period', { x: 12, y: 53 }, 24, 5, {
        fontSize: 7,
        fontColor: '#616e7c',
      }),
      boundText('statementPeriod', 'statementPeriod', { x: 36, y: 52 }, 85, 6, {
        fontSize: 9,
      }),
      staticText('openingBalanceLabel', 'Opening balance', { x: 128, y: 53 }, 32, 5, {
        fontSize: 7,
        fontColor: '#616e7c',
      }),
      boundText('openingBalance', 'openingBalance', { x: 160, y: 52 }, 38, 6, {
        alignment: 'right',
        fontSize: 9,
        binding: {
          path: 'openingBalance',
          format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
        },
      }),
      {
        name: 'transactions',
        type: 'table',
        content: '[]',
        binding: {
          path: 'transactions',
          columns: [
            {
              path: 'date',
              label: 'Date',
              widthPercentage: 13,
              format: { kind: 'date', locale: 'en-US', dateStyle: 'short' },
            },
            { path: 'reference', label: 'Reference', widthPercentage: 16 },
            { path: 'description', label: 'Description', widthPercentage: 31 },
            {
              path: 'debit',
              label: 'Debit',
              widthPercentage: 13,
              format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
            },
            {
              path: 'credit',
              label: 'Credit',
              widthPercentage: 13,
              format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
            },
            {
              path: 'balance',
              label: 'Balance',
              widthPercentage: 14,
              format: { kind: 'currency', locale: 'en-US', currency: 'USD' },
            },
          ],
        },
        position: { x: 12, y: 64 },
        width: 186,
        height: 20,
        showHead: true,
        repeatHead: true,
        head: ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
        headWidthPercentages: [13, 16, 31, 13, 13, 14],
        tableStyles: { borderColor: '#829ab1', borderWidth: 0.25 },
        headStyles: {
          ...cellStyles,
          alignment: 'center',
          fontSize: 7,
          fontColor: '#ffffff',
          backgroundColor: '#334e68',
          borderColor: '#334e68',
        },
        bodyStyles: {
          ...cellStyles,
          fontSize: 7,
          padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
          alternateBackgroundColor: '#f5f7fa',
        },
        columnStyles: {
          alignment: { 0: 'center', 1: 'left', 2: 'left', 3: 'right', 4: 'right', 5: 'right' },
        },
        rowStyles: {
          [rowCount - 1]: {
            backgroundColor: '#d9eaf2',
            textColor: '#102a43',
            fontSize: 8,
            cells: { 2: { alignment: 'right' }, 5: { alignment: 'right' } },
          },
        },
      },
    ],
  ],
});

const measureLayout = async (template: Template, input: DocumentInput): Promise<Template> =>
  getDynamicTemplate({
    template,
    input: input as Record<string, string>,
    options: {},
    _cache: new Map(),
    getDynamicLayout: async (value, args): Promise<LayoutMeasureResult> => {
      if (args.schema.type === 'table' && table.measure) {
        return table.measure({ value, ...args });
      }
      return {
        width: args.schema.width,
        height: args.schema.height,
        dynamicHeights: [args.schema.height],
      };
    },
  });

const getRowRanges = (dynamicTemplate: Template, schemaName: string): RowRange[] =>
  dynamicTemplate.schemas.flatMap((pageSchemas, pageIndex) =>
    pageSchemas
      .filter((schema) => schema.name === schemaName && schema.__bodyRange)
      .map((schema) => ({
        page: pageIndex + 1,
        start: schema.__bodyRange!.start,
        end: schema.__bodyRange!.end!,
      })),
  );

const expectCompleteRowCoverage = (ranges: RowRange[], rowCount: number): void => {
  expect(ranges.length).toBeGreaterThan(1);
  expect(ranges[0].start).toBe(0);
  expect(ranges.at(-1)?.end).toBe(rowCount);
  let expectedPage = 1;
  let expectedStart = 0;
  for (const range of ranges) {
    expect(range.start).toBe(expectedStart);
    expect(range.end).toBeGreaterThan(range.start);
    expect(range.page).toBe(expectedPage);
    expectedStart = range.end;
    expectedPage += 1;
  }
};

const writeArtifacts = (
  scenarioName: string,
  pdf: Uint8Array,
  images: Buffer[],
  manifest: Record<string, unknown>,
): void => {
  const scenarioDirectory = path.join(artifactRoot, scenarioName);
  rmSync(scenarioDirectory, { recursive: true, force: true });
  mkdirSync(scenarioDirectory, { recursive: true });
  writeFileSync(path.join(scenarioDirectory, `${scenarioName}.pdf`), pdf);
  for (const [index, image] of images.entries()) {
    writeFileSync(
      path.join(
        scenarioDirectory,
        `${scenarioName}-page-${String(index + 1).padStart(2, '0')}.png`,
      ),
      image,
    );
  }
  writeFileSync(
    path.join(scenarioDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
};

const verifyPdfAndArtifacts = async (arg: {
  scenarioName: string;
  template: Template;
  input: DocumentInput;
  tableName: string;
  rowCount: number;
  terminalRowStart: number;
  expectedPageCount: number;
  controlTotals: Record<string, number>;
}): Promise<void> => {
  const {
    scenarioName,
    template,
    input,
    tableName,
    rowCount,
    terminalRowStart,
    expectedPageCount,
    controlTotals,
  } = arg;
  const dynamicTemplate = await measureLayout(template, input);
  const ranges = getRowRanges(dynamicTemplate, tableName);
  const terminalRanges = ranges.filter(
    (range) => range.start < rowCount && range.end > terminalRowStart,
  );
  const continuationSchemas = dynamicTemplate.schemas
    .flat()
    .filter((schema) => schema.name === tableName && schema.__isSplit);

  const pdf = await generate({
    inputs: [input],
    template,
    plugins: { text, table },
    options: {
      creationDate: fixedMetadataDate,
      modificationDate: fixedMetadataDate,
      title: scenarioName,
    },
  });
  const pdfDocument = await PDFDocument.load(pdf);
  const images = await pdfToImages(pdf);
  writeArtifacts(scenarioName, pdf, images, {
    scenario: scenarioName,
    pageCount: pdfDocument.getPageCount(),
    pageSizeMm: { width: 210, height: 297 },
    rowCount,
    terminalRowStart,
    controlTotals,
    rowRanges: ranges,
  });

  expectCompleteRowCoverage(ranges, rowCount);
  expect(terminalRanges).toHaveLength(1);
  expect(terminalRanges[0].page).toBe(ranges.at(-1)?.page);
  expect(terminalRanges[0].end).toBe(rowCount);
  expect(continuationSchemas.length).toBe(ranges.length - 1);
  expect(continuationSchemas.every((schema) => schema.repeatHead === true)).toBe(true);
  expect(pdfDocument.getPageCount()).toBe(dynamicTemplate.schemas.length);
  expect(pdfDocument.getPageCount()).toBe(expectedPageCount);
  for (const page of pdfDocument.getPages()) {
    expect(page.getWidth()).toBeCloseTo(595.27, 0);
    expect(page.getHeight()).toBeCloseTo(841.88, 0);
  }
  expect(images).toHaveLength(pdfDocument.getPageCount());
  for (const [index, image] of images.entries()) {
    expect(image.byteLength).toBeGreaterThan(10_000);
    await expect(image).toMatchImage(getImageSnapshotOptions(`${scenarioName}-page-${index + 1}`));
  }
};

describe('complex production document rendering', () => {
  test('renders a bound invoice table with terminal total rows across multiple A4 pages', async () => {
    const input = buildInvoiceInput();
    const rowCount = (input.lineItems as unknown[]).length;
    const template = buildInvoiceTemplate(rowCount);
    const tableSchema = template.schemas[0].find((schema) => schema.name === 'lineItems')!;
    const resolvedRows = JSON.parse(
      resolveSchemaValue({ schema: tableSchema, input, schemas: template.schemas }),
    ) as string[][];

    expect(resolvedRows.slice(-3)).toEqual([
      ['SUBTOTAL', '', '', '$4,284.25'],
      ['SALES TAX (8.25%)', '', '', '$353.45'],
      ['TOTAL DUE', '', '', '$4,637.70'],
    ]);

    await verifyPdfAndArtifacts({
      scenarioName: 'complex-invoice',
      template,
      input,
      tableName: 'lineItems',
      rowCount,
      terminalRowStart: rowCount - 3,
      expectedPageCount: 3,
      controlTotals: {
        subtotal: input.subtotal as number,
        tax: input.tax as number,
        total: input.total as number,
      },
    });
  });

  test('renders a bank extract with a terminal closing-balance row across multiple A4 pages', async () => {
    const input = buildBankInput();
    const rowCount = (input.transactions as unknown[]).length;
    const template = buildBankTemplate(rowCount);
    const tableSchema = template.schemas[0].find((schema) => schema.name === 'transactions')!;
    const resolvedRows = JSON.parse(
      resolveSchemaValue({ schema: tableSchema, input, schemas: template.schemas }),
    ) as string[][];

    expect(resolvedRows.at(-1)?.slice(1)).toEqual(['', 'CLOSING BALANCE', '', '', '$21,651.70']);

    await verifyPdfAndArtifacts({
      scenarioName: 'complex-bank-extract',
      template,
      input,
      tableName: 'transactions',
      rowCount,
      terminalRowStart: rowCount - 1,
      expectedPageCount: 3,
      controlTotals: {
        openingBalance: input.openingBalance as number,
        closingBalance: input.closingBalance as number,
      },
    });
  });
});
