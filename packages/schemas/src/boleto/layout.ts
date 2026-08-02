import type { BoletoData, BoletoParty, BrazilianAddress, BrazilianTaxId } from './types.js';
import type { BoletoSchema } from './schema.js';
import {
  BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM,
  BOLETO_DIGITABLE_LINE_STROKE_MM,
  BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM,
  BOLETO_INSTITUTION_CODE_STROKE_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
  BOLETO_MECHANICAL_AUTHENTICATION_STROKE_MM,
  createBoletoVectorDisplay,
  type BoletoVectorDisplayPrimitive,
} from './vectorDisplay.js';

export const BOLETO_BARCODE_WIDTH_MM = 103;
export const BOLETO_BARCODE_HEIGHT_MM = 13;
export const BOLETO_BARCODE_LEFT_MM = 5;
export const BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM = 12;
export const BOLETO_GRID_STROKE_MM = 0.3;

export type BoletoTextAlignment = 'left' | 'center' | 'right';

export interface BoletoTextPrimitive {
  id: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  minimumFontSize?: number;
  bold?: boolean;
  alignment?: BoletoTextAlignment;
  color?: string;
  opacity?: number;
}

export interface BoletoLinePrimitive {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

export interface BoletoLineInkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BoletoImagePrimitive {
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoletoBarcodePrimitive {
  value: string;
  x: number;
  y: number;
  width: typeof BOLETO_BARCODE_WIDTH_MM;
  height: typeof BOLETO_BARCODE_HEIGHT_MM;
}

export interface BoletoLayout {
  texts: BoletoTextPrimitive[];
  lines: BoletoLinePrimitive[];
  vectorDisplays: BoletoVectorDisplayPrimitive[];
  images: BoletoImagePrimitive[];
  barcode?: BoletoBarcodePrimitive;
}

const formatTaxId = ({ type, number }: BrazilianTaxId): string => {
  if (type === 'cpf') {
    const digits = number.replace(/\D/g, '');
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  const characters = number.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return characters.replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatPostalCode = (value: string): string =>
  value.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');

const formatAddress = (address: BrazilianAddress): string =>
  [
    [address.street, address.number].filter(Boolean).join(', '),
    address.complement,
    address.district,
    `${address.city}/${address.state}`,
    `CEP ${formatPostalCode(address.postalCode)}`,
  ]
    .filter(Boolean)
    .join(' - ');

const formatParty = (party: BoletoParty): string =>
  `${party.name} - ${party.taxId.type.toUpperCase()} ${formatTaxId(party.taxId)} - ${formatAddress(party.address)}`;

const formatPartyIdentity = (party: Pick<BoletoParty, 'name' | 'taxId'>): string =>
  `${party.name} - ${party.taxId.type.toUpperCase()} ${formatTaxId(party.taxId)}`;

const formatDate = (isoDate: string | undefined): string => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

export const formatBoletoCents = (value: number | undefined): string => {
  if (value === undefined) return '';
  const integer = Math.trunc(value);
  const reais = Math.trunc(integer / 100);
  const cents = Math.abs(integer % 100);
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(cents).padStart(2, '0')}`;
};

const addRectangle = (
  lines: BoletoLinePrimitive[],
  x: number,
  y: number,
  width: number,
  height: number,
  thickness = BOLETO_GRID_STROKE_MM,
): void => {
  lines.push(
    { x1: x, y1: y, x2: x + width, y2: y, thickness },
    { x1: x + width, y1: y, x2: x + width, y2: y + height, thickness },
    { x1: x + width, y1: y + height, x2: x, y2: y + height, thickness },
    { x1: x, y1: y + height, x2: x, y2: y, thickness },
  );
};

type GridOrientation = 'horizontal' | 'vertical';

interface GridRun {
  orientation: GridOrientation;
  coordinate: number;
  start: number;
  end: number;
  thickness: number;
}

const GRID_GEOMETRY_EPSILON_MM = 1e-9;

const insetBoundaryCoordinate = (
  coordinate: number,
  maximum: number,
  thickness: number,
): number => {
  if (Math.abs(coordinate) <= GRID_GEOMETRY_EPSILON_MM) return thickness / 2;
  if (Math.abs(coordinate - maximum) <= GRID_GEOMETRY_EPSILON_MM) {
    return maximum - thickness / 2;
  }
  return coordinate;
};

const toGridRun = (line: BoletoLinePrimitive, width: number, height: number): GridRun => {
  if (line.y1 === line.y2) {
    return {
      orientation: 'horizontal',
      coordinate: insetBoundaryCoordinate(line.y1, height, line.thickness),
      start: Math.max(0, Math.min(line.x1, line.x2)),
      end: Math.min(width, Math.max(line.x1, line.x2)),
      thickness: line.thickness,
    };
  }
  if (line.x1 === line.x2) {
    return {
      orientation: 'vertical',
      coordinate: insetBoundaryCoordinate(line.x1, width, line.thickness),
      start: Math.max(0, Math.min(line.y1, line.y2)),
      end: Math.min(height, Math.max(line.y1, line.y2)),
      thickness: line.thickness,
    };
  }
  throw new Error('[@pdfweave/schemas/boleto] Grid lines must be horizontal or vertical');
};

const compareGridRuns = (left: GridRun, right: GridRun): number => {
  if (left.orientation !== right.orientation) return left.orientation === 'horizontal' ? -1 : 1;
  return (
    left.coordinate - right.coordinate ||
    left.thickness - right.thickness ||
    left.start - right.start ||
    left.end - right.end
  );
};

const sharesGridTrack = (left: GridRun, right: GridRun): boolean =>
  left.orientation === right.orientation &&
  Math.abs(left.coordinate - right.coordinate) <= GRID_GEOMETRY_EPSILON_MM &&
  Math.abs(left.thickness - right.thickness) <= GRID_GEOMETRY_EPSILON_MM;

const mergeGridRuns = (runs: GridRun[]): GridRun[] => {
  const merged: GridRun[] = [];
  for (const run of [...runs].sort(compareGridRuns)) {
    const previous = merged.at(-1);
    if (
      previous &&
      sharesGridTrack(previous, run) &&
      run.start <= previous.end + GRID_GEOMETRY_EPSILON_MM
    ) {
      previous.end = Math.max(previous.end, run.end);
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
};

const fromGridRun = (run: GridRun): BoletoLinePrimitive =>
  run.orientation === 'horizontal'
    ? {
        x1: run.start,
        y1: run.coordinate,
        x2: run.end,
        y2: run.coordinate,
        thickness: run.thickness,
      }
    : {
        x1: run.coordinate,
        y1: run.start,
        x2: run.coordinate,
        y2: run.end,
        thickness: run.thickness,
      };

const compileGridLines = (
  lines: BoletoLinePrimitive[],
  width: number,
  height: number,
): BoletoLinePrimitive[] =>
  mergeGridRuns(lines.map((line) => toGridRun(line, width, height))).map((run) => fromGridRun(run));

export const getBoletoLineInkBounds = (line: BoletoLinePrimitive): BoletoLineInkBounds => {
  const halfStroke = line.thickness / 2;
  if (line.y1 === line.y2) {
    return {
      left: Math.min(line.x1, line.x2),
      top: line.y1 - halfStroke,
      right: Math.max(line.x1, line.x2),
      bottom: line.y1 + halfStroke,
    };
  }
  if (line.x1 === line.x2) {
    return {
      left: line.x1 - halfStroke,
      top: Math.min(line.y1, line.y2),
      right: line.x1 + halfStroke,
      bottom: Math.max(line.y1, line.y2),
    };
  }
  throw new Error('[@pdfweave/schemas/boleto] Grid lines must be horizontal or vertical');
};

const createText = (
  id: string,
  value: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<BoletoTextPrimitive> = {},
): BoletoTextPrimitive => ({
  id,
  value: value ?? '',
  x,
  y,
  width,
  height,
  fontSize: 6.5,
  alignment: 'left',
  color: '#000000',
  ...overrides,
});

const addCell = (
  layout: BoletoLayout,
  id: string,
  label: string,
  value: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  valueOverrides: Partial<BoletoTextPrimitive> = {},
): void => {
  addRectangle(layout.lines, x, y, width, height);
  layout.texts.push(
    createText(`${id}-label`, label, x + 0.8, y + 0.5, width - 1.6, 2.3, {
      fontSize: 4,
    }),
    createText(`${id}-value`, value, x + 0.8, y + 2.7, width - 1.6, height - 3.1, valueOverrides),
  );
};

export const buildBoletoLayout = (
  data: BoletoData,
  schema: BoletoSchema,
  formattedDigitableLine: string,
): BoletoLayout => {
  const width = schema.width;
  const height = schema.height;
  const rightWidth = 50;
  const leftWidth = width - rightWidth;
  const barcodeY = height - BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM - BOLETO_BARCODE_HEIGHT_MM / 2;
  const showPaymentIdentifiers = data.registrationStatus === 'registered';
  const layout: BoletoLayout = {
    texts: [],
    lines: [],
    vectorDisplays: [],
    images: [],
    ...(showPaymentIdentifiers
      ? {
          barcode: {
            value: data.barcode,
            x: BOLETO_BARCODE_LEFT_MM,
            y: barcodeY,
            width: BOLETO_BARCODE_WIDTH_MM,
            height: BOLETO_BARCODE_HEIGHT_MM,
          },
        }
      : {}),
  };

  const institutionNameX = data.institution.logo ? 14 : 1;
  if (data.institution.logo) {
    layout.images.push({ value: data.institution.logo, x: 1, y: 1, width: 12, height: 7 });
  }
  addRectangle(layout.lines, 0, 0, 34, 9);
  addRectangle(layout.lines, 34, 0, 15, 9);
  addRectangle(layout.lines, 49, 0, width - 49, 9);
  const institutionCode = createBoletoVectorDisplay({
    id: 'institution-code',
    value: `${data.institution.code}-${data.institution.codeDigit}`,
    x: 0,
    y: (9 - BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM) / 2,
    glyphHeight: BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM,
    glyphWidth: 2.8,
    strokeWidth: BOLETO_INSTITUTION_CODE_STROKE_MM,
    characterGap: 0.08,
  });
  institutionCode.x = 34 + (15 - institutionCode.width) / 2;
  layout.vectorDisplays.push(institutionCode);
  if (showPaymentIdentifiers) {
    layout.vectorDisplays.push(
      createBoletoVectorDisplay({
        id: 'digitable-line',
        value: formattedDigitableLine,
        x: 50,
        y: (9 - BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM) / 2,
        glyphHeight: BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM,
        glyphWidth: 2,
        strokeWidth: BOLETO_DIGITABLE_LINE_STROKE_MM,
        characterGap: 0.2,
      }),
    );
  } else {
    layout.texts.push(
      createText(
        'test-digitable-line-redaction',
        'LINHA DIGITÁVEL SUPRIMIDA - AMOSTRA',
        50,
        1.2,
        width - 51,
        6.5,
        {
          fontSize: 5,
          minimumFontSize: 4,
          bold: true,
          alignment: 'center',
          color: '#a00000',
        },
      ),
    );
  }
  layout.texts.push(
    createText(
      'institution-name',
      data.institution.name,
      institutionNameX,
      1.2,
      33 - institutionNameX,
      6.5,
      {
        fontSize: 7,
        minimumFontSize: 4.5,
        bold: true,
        alignment: data.institution.logo ? 'left' : 'center',
      },
    ),
  );

  addCell(
    layout,
    'payment-location',
    'Local de Pagamento',
    data.paymentLocation,
    0,
    9,
    leftWidth,
    8,
  );
  addCell(
    layout,
    'due-date',
    'Data de Vencimento',
    formatDate(data.dueDate),
    leftWidth,
    9,
    rightWidth,
    8,
    { bold: true, alignment: 'right' },
  );
  addCell(
    layout,
    'beneficiary',
    'Nome do Beneficiário / CNPJ/CPF / Endereço',
    formatParty(data.beneficiary),
    0,
    17,
    leftWidth,
    10,
  );
  addCell(
    layout,
    'agency-beneficiary',
    'Agência / Código do Beneficiário',
    data.agencyBeneficiaryCode,
    leftWidth,
    17,
    rightWidth,
    10,
    { alignment: 'right' },
  );

  const documentWidths = [31, 32, 23, 16, leftWidth - 102];
  let documentX = 0;
  const documentCells: Array<[string, string, string | undefined]> = [
    ['document-date', 'Data do Documento', formatDate(data.documentDate)],
    ['document-number', 'Nr. do Documento', data.documentNumber],
    ['document-species', 'Espécie DOC', data.documentSpecies],
    ['acceptance', 'Aceite', data.acceptance],
    ['processing-date', 'Data Processamento', formatDate(data.processingDate)],
  ];
  documentCells.forEach(([id, label, value], index) => {
    const cellWidth = documentWidths[index] ?? 0;
    addCell(layout, id, label, value, documentX, 27, cellWidth, 9);
    documentX += cellWidth;
  });
  addCell(layout, 'our-number', 'Nosso-Número', data.ourNumber, leftWidth, 27, rightWidth, 9, {
    alignment: 'right',
  });

  const currencyWidths = [31, 24, 18, 36, leftWidth - 109];
  let currencyX = 0;
  const currencyCells: Array<[string, string, string | undefined]> = [
    ['bank-use', 'Uso do Banco', data.bankUse],
    ['portfolio', 'Carteira', data.portfolio],
    ['currency', 'Espécie', 'R$'],
    ['currency-quantity', 'Quantidade', data.currencyQuantity],
    ['currency-value', 'x Valor', formatBoletoCents(data.currencyUnitValueCents)],
  ];
  currencyCells.forEach(([id, label, value], index) => {
    const cellWidth = currencyWidths[index] ?? 0;
    addCell(layout, id, label, value, currencyX, 36, cellWidth, 9);
    currencyX += cellWidth;
  });
  addCell(
    layout,
    'document-value',
    '(=) Valor do Documento',
    formatBoletoCents(data.documentValueCents),
    leftWidth,
    36,
    rightWidth,
    9,
    { bold: true, alignment: 'right' },
  );

  addCell(
    layout,
    'instructions',
    'Informações de responsabilidade do Beneficiário',
    data.instructions?.join('\n'),
    0,
    45,
    leftWidth,
    21,
    { fontSize: 5.7 },
  );
  const fixedAmountData = data.amountMode === 'fixed' ? data : undefined;
  const adjustmentRows: Array<[string, string, number | undefined]> = [
    ['discount-deduction', '(-) Desconto/Abatimento', fixedAmountData?.discountDeductionCents],
    ['interest-penalty', '(+) Juros/Multa', fixedAmountData?.interestPenaltyCents],
    ['paid', '(=) Valor Pago', fixedAmountData?.chargedAmountCents],
  ];
  const adjustmentHeight = 21 / adjustmentRows.length;
  adjustmentRows.forEach(([id, label, value], index) => {
    addCell(
      layout,
      id,
      label,
      formatBoletoCents(value),
      leftWidth,
      45 + index * adjustmentHeight,
      rightWidth,
      adjustmentHeight,
      { alignment: 'right', fontSize: 5.5 },
    );
  });

  addRectangle(layout.lines, 0, 66, width, 9.5);
  layout.texts.push(
    createText(
      'payer-label',
      'Nome do Pagador / CPF/CNPJ / Endereço / Cidade / UF / CEP',
      0.8,
      66.5,
      width - 1.6,
      1.8,
      { fontSize: 4 },
    ),
    createText('payer-value', formatParty(data.payer), 0.8, 68.3, width - 1.6, 3, {
      fontSize: 5.5,
      minimumFontSize: 4,
    }),
    createText('final-beneficiary-label', 'Beneficiário Final', 0.8, 71.7, 24, 2.3, {
      fontSize: 4,
    }),
    createText(
      'final-beneficiary-value',
      data.finalBeneficiary ? formatPartyIdentity(data.finalBeneficiary) : '',
      25,
      71.7,
      width - 25.8,
      2.3,
      { fontSize: 5.5, minimumFontSize: 4 },
    ),
  );

  const mechanicalAuthentication = createBoletoVectorDisplay({
    id: 'mechanical-authentication',
    value: BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
    x: 0,
    y: barcodeY + 1,
    glyphHeight: BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
    glyphWidth: 1,
    strokeWidth: BOLETO_MECHANICAL_AUTHENTICATION_STROKE_MM,
    characterGap: 0.1,
  });
  mechanicalAuthentication.x = width - 1 - mechanicalAuthentication.width;
  layout.vectorDisplays.push(mechanicalAuthentication);

  if (data.registrationStatus === 'test') {
    layout.texts.push(
      createText(
        'test-barcode-redaction',
        'CÓDIGO DE BARRAS SUPRIMIDO - AMOSTRA',
        BOLETO_BARCODE_LEFT_MM,
        barcodeY + 4,
        BOLETO_BARCODE_WIDTH_MM,
        5,
        {
          fontSize: 5,
          minimumFontSize: 4,
          bold: true,
          alignment: 'center',
          color: '#a00000',
        },
      ),
      createText('test-watermark', 'AMOSTRA - NÃO PAGÁVEL', 1, 58, leftWidth - 2, 6, {
        fontSize: 11,
        bold: true,
        alignment: 'center',
        color: '#a00000',
        opacity: 0.55,
      }),
    );
  }

  layout.lines = compileGridLines(layout.lines, width, height);

  return layout;
};
