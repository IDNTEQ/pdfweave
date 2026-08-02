import { formatDigitableLine } from '../src/boleto/digits.js';
import {
  BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
  BOLETO_BARCODE_HEIGHT_MM,
  BOLETO_BARCODE_LEFT_MM,
  BOLETO_BARCODE_WIDTH_MM,
  BOLETO_DIGITABLE_LINE_LOGICAL_WIDTH_MM,
  BOLETO_GRID_STROKE_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
  BOLETO_PIX_QR_GAP_MM,
  BOLETO_PIX_QR_SIZE_MM,
  buildBoletoLayout,
  getBoletoLineInkBounds,
} from '../src/boleto/layout.js';
import {
  BOLETO_FICHA_MAX_HEIGHT_MM,
  BOLETO_FICHA_MAX_WIDTH_MM,
  BOLETO_FICHA_MIN_HEIGHT_MM,
  BOLETO_FICHA_MIN_WIDTH_MM,
  type BoletoSchema,
  validateBoletoSchema,
} from '../src/boleto/schema.js';
import type { BoletoData } from '../src/boleto/types.js';

const ITAU_BARCODE = '34196166700000123451101234567880057123457000';

const createData = (registrationStatus: BoletoData['registrationStatus'] = 'test'): BoletoData => ({
  version: 1,
  kind: 'cobranca',
  registrationStatus,
  institution: {
    name: 'Itau Unibanco S.A.',
    code: '341',
    codeDigit: '7',
    logo: 'data:image/png;base64,iVBORw0KGgo=',
  },
  beneficiaryMode: 'direct',
  beneficiary: {
    name: 'Empresa Exemplo Ltda.',
    taxId: { type: 'cnpj', number: '04.252.011/0001-10' },
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
  instructions: ['Nao receber apos o vencimento.'],
});

const createSchema = (width: number, height: number): BoletoSchema => ({
  name: 'boleto',
  type: 'boleto',
  variant: 'ficha-compensacao',
  content: '',
  position: { x: 0, y: 0 },
  width,
  height,
  rotate: 0,
  opacity: 1,
});

const expectWithin = (start: number, extent: number, limit: number): void => {
  expect(start).toBeGreaterThanOrEqual(0);
  expect(extent).toBeGreaterThan(0);
  expect(start + extent).toBeLessThanOrEqual(limit);
};

describe('boleto ficha layout geometry', () => {
  it.each([
    [BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM],
    [BOLETO_FICHA_MAX_WIDTH_MM, BOLETO_FICHA_MAX_HEIGHT_MM],
  ])('keeps every primitive within a %d x %d mm ficha', (width, height) => {
    const schema = createSchema(width, height);
    const data = createData('registered');
    data.pix = {
      emvPayload: '00020101021226820014br.gov.bcb.pix6304FFFF',
      placement: 'instructions-right',
    };

    validateBoletoSchema(schema);
    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));

    expect(layout.barcode).toEqual({
      value: ITAU_BARCODE,
      x: BOLETO_BARCODE_LEFT_MM,
      y: height - BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM - BOLETO_BARCODE_HEIGHT_MM / 2,
      width: BOLETO_BARCODE_WIDTH_MM,
      height: BOLETO_BARCODE_HEIGHT_MM,
    });
    if (!layout.barcode) throw new Error('Expected a registered barcode primitive');
    expect(layout.barcode.y + layout.barcode.height / 2).toBe(
      height - BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
    );
    expectWithin(layout.barcode.x, layout.barcode.width, width);
    expectWithin(layout.barcode.y, layout.barcode.height, height);
    if (!layout.pixQrCode) throw new Error('Expected a Pix QR primitive');
    expectWithin(layout.pixQrCode.x, layout.pixQrCode.width, width);
    expectWithin(layout.pixQrCode.y, layout.pixQrCode.height, height);

    for (const primitive of layout.texts) {
      expectWithin(primitive.x, primitive.width, width);
      expectWithin(primitive.y, primitive.height, height);
    }
    for (const primitive of layout.images) {
      expectWithin(primitive.x, primitive.width, width);
      expectWithin(primitive.y, primitive.height, height);
    }
    for (const line of layout.lines) {
      expect(line.thickness).toBeGreaterThan(0);
      expect(line.x1).toBeGreaterThanOrEqual(0);
      expect(line.x1).toBeLessThanOrEqual(width);
      expect(line.x2).toBeGreaterThanOrEqual(0);
      expect(line.x2).toBeLessThanOrEqual(width);
      expect(line.y1).toBeGreaterThanOrEqual(0);
      expect(line.y1).toBeLessThanOrEqual(height);
      expect(line.y2).toBeGreaterThanOrEqual(0);
      expect(line.y2).toBeLessThanOrEqual(height);
    }
  });

  it.each([
    [BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM],
    [BOLETO_FICHA_MAX_WIDTH_MM, BOLETO_FICHA_MAX_HEIGHT_MM],
  ])('keeps grid ink inside a %d x %d mm ficha and merges shared cell borders', (width, height) => {
    const data = createData('registered');
    const layout = buildBoletoLayout(
      data,
      createSchema(width, height),
      formatDigitableLine(data.barcode),
    );

    for (const line of layout.lines) {
      const bounds = getBoletoLineInkBounds(line);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.bottom).toBeLessThanOrEqual(height);
    }

    for (const [index, line] of layout.lines.entries()) {
      const horizontal = line.y1 === line.y2;
      const lineStart = horizontal ? Math.min(line.x1, line.x2) : Math.min(line.y1, line.y2);
      const lineEnd = horizontal ? Math.max(line.x1, line.x2) : Math.max(line.y1, line.y2);
      for (const candidate of layout.lines.slice(index + 1)) {
        const candidateHorizontal = candidate.y1 === candidate.y2;
        const sameTrack =
          horizontal === candidateHorizontal &&
          (horizontal ? line.y1 === candidate.y1 : line.x1 === candidate.x1) &&
          line.thickness === candidate.thickness;
        if (!sameTrack) continue;
        const candidateStart = candidateHorizontal
          ? Math.min(candidate.x1, candidate.x2)
          : Math.min(candidate.y1, candidate.y2);
        const candidateEnd = candidateHorizontal
          ? Math.max(candidate.x1, candidate.x2)
          : Math.max(candidate.y1, candidate.y2);
        expect(Math.max(lineStart, candidateStart)).toBeGreaterThan(
          Math.min(lineEnd, candidateEnd),
        );
      }
    }

    const top = layout.lines.find(({ x1, y1, x2, y2 }) => y1 === y2 && x1 === 0 && x2 === width);
    const left = layout.lines.find(
      ({ x1, y1, x2, y2 }) => x1 === x2 && y1 === 0 && x1 < 1 && y2 > 70,
    );
    const right = layout.lines.find(
      ({ x1, y1, x2, y2 }) => x1 === x2 && y1 === 0 && x1 > width - 1 && y2 > 70,
    );
    expect(top).toBeDefined();
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (!top || !left || !right) throw new Error('Expected all three outer grid edges');
    expect(getBoletoLineInkBounds(top)).toEqual({
      left: 0,
      top: 0,
      right: width,
      bottom: BOLETO_GRID_STROKE_MM,
    });
    expect(getBoletoLineInkBounds(left).left).toBe(0);
    expect(getBoletoLineInkBounds(right).right).toBe(width);
  });

  it('renders institution, digitable-line, and authentication labels as normal text', () => {
    const schema = createSchema(BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM);
    const data = createData('registered');
    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
    const text = (id: string) => layout.texts.find((primitive) => primitive.id === id);
    const institutionCode = text('institution-code');
    const digitableLine = text('digitable-line');
    const mechanicalAuthentication = text('mechanical-authentication');

    expect(institutionCode).toMatchObject({
      value: '341-7',
      x: 34.5,
      width: 20,
      fontSize: 20,
      minimumFontSize: 18,
      bold: true,
      alignment: 'center',
    });
    expect(digitableLine).toMatchObject({
      value: formatDigitableLine(data.barcode),
      x: 56,
      fontSize: 14,
      minimumFontSize: 14,
      bold: true,
      horizontalScale: (BOLETO_FICHA_MIN_WIDTH_MM - 57) / BOLETO_DIGITABLE_LINE_LOGICAL_WIDTH_MM,
    });
    expect(mechanicalAuthentication).toMatchObject({
      value: BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
      fontSize: 6.5,
      minimumFontSize: 5,
      alignment: 'right',
    });
    expect((institutionCode?.x ?? 0) + (institutionCode?.width ?? 0) / 2).toBe(44.5);
    expect((digitableLine?.x ?? 0) + (digitableLine?.width ?? 0)).toBeLessThanOrEqual(schema.width);
    expect((mechanicalAuthentication?.x ?? 0) + (mechanicalAuthentication?.width ?? 0)).toBe(
      schema.width - 1,
    );
    expect(layout.lines.every(({ thickness }) => thickness === BOLETO_GRID_STROKE_MM)).toBe(true);

    const wideLayout = buildBoletoLayout(
      data,
      createSchema(200, BOLETO_FICHA_MIN_HEIGHT_MM),
      formatDigitableLine(data.barcode),
    );
    expect(wideLayout.texts.find(({ id }) => id === 'digitable-line')?.horizontalScale).toBe(1);
  });

  it('renders an uppercase X institution suffix as text', () => {
    const data = createData('registered');
    data.institution = { ...data.institution, code: '748', codeDigit: 'X' };
    const layout = buildBoletoLayout(
      data,
      createSchema(200, 95),
      formatDigitableLine(data.barcode),
    );
    const institutionCode = layout.texts.find(({ id }) => id === 'institution-code');

    expect(institutionCode).toMatchObject({ value: '748-X', bold: true, alignment: 'center' });
  });

  it('suppresses payable identifiers and watermarks test boletos', () => {
    const schema = createSchema(200, 95);
    const formattedLine = formatDigitableLine(ITAU_BARCODE);
    const normalizedLine = formattedLine.replace(/\D/g, '');
    const testLayout = buildBoletoLayout(createData('test'), schema, formattedLine);
    const registeredLayout = buildBoletoLayout(createData('registered'), schema, formattedLine);
    const testValues = [
      ...testLayout.texts.map(({ value }) => value),
      testLayout.barcode?.value ?? '',
    ].join('\n');

    expect(testLayout.barcode).toBeUndefined();
    expect(testLayout.texts.find(({ id }) => id === 'digitable-line')).toBeUndefined();
    expect(testValues).not.toContain(ITAU_BARCODE);
    expect(testValues).not.toContain(formattedLine);
    expect(testValues).not.toContain(normalizedLine);
    expect(testLayout.texts).toContainEqual(
      expect.objectContaining({
        id: 'test-watermark',
        value: 'AMOSTRA - NÃO PAGÁVEL',
        opacity: 0.55,
      }),
    );
    expect(testLayout.texts).toContainEqual(
      expect.objectContaining({
        id: 'test-digitable-line-redaction',
        value: 'LINHA DIGITÁVEL SUPRIMIDA - AMOSTRA',
      }),
    );
    expect(testLayout.texts).toContainEqual(
      expect.objectContaining({
        id: 'test-barcode-redaction',
        value: 'CÓDIGO DE BARRAS SUPRIMIDO - AMOSTRA',
      }),
    );
    expect(registeredLayout.barcode?.value).toBe(ITAU_BARCODE);
    expect(registeredLayout.texts.find(({ id }) => id === 'digitable-line')?.value).toBe(
      formattedLine,
    );
    expect(registeredLayout.texts.find(({ id }) => id === 'test-watermark')).toBeUndefined();
    expect(
      registeredLayout.texts.find(({ id }) => id === 'test-digitable-line-redaction'),
    ).toBeUndefined();
    expect(
      registeredLayout.texts.find(({ id }) => id === 'test-barcode-redaction'),
    ).toBeUndefined();
  });

  it('renders synthetic test identifiers only when explicitly requested', () => {
    const data: BoletoData = {
      ...createData('test'),
      testPaymentIdentifiers: 'render',
    };
    const formattedLine = formatDigitableLine(data.barcode);
    const layout = buildBoletoLayout(data, createSchema(200, 95), formattedLine);

    expect(layout.barcode?.value).toBe(data.barcode);
    expect(layout.texts.find(({ id }) => id === 'digitable-line')?.value).toBe(formattedLine);
    expect(layout.texts.find(({ id }) => id === 'test-watermark')).toBeDefined();
    expect(layout.texts.find(({ id }) => id === 'test-barcode-redaction')).toBeUndefined();
    expect(layout.texts.find(({ id }) => id === 'test-digitable-line-redaction')).toBeUndefined();
  });

  it('bounds maximum-length instruction lanes at minimum width with and without Pix', () => {
    const instructions = Array.from(
      { length: 3 },
      (_, index) => `${String(index + 1)}${'W'.repeat(179)}`,
    );
    const baseData: BoletoData = {
      ...createData('test'),
      testPaymentIdentifiers: 'render',
      instructions,
    };
    const pixData: BoletoData = {
      ...baseData,
      pix: {
        emvPayload: '00020101021226820014br.gov.bcb.pix6304FFFF',
        placement: 'instructions-right',
      },
    };
    const minimumSchema = createSchema(BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM);
    const layoutWithoutPix = buildBoletoLayout(
      baseData,
      minimumSchema,
      formatDigitableLine(baseData.barcode),
    );
    const layoutWithPix = buildBoletoLayout(
      pixData,
      minimumSchema,
      formatDigitableLine(pixData.barcode),
    );
    const getLanes = (layout: typeof layoutWithPix) =>
      layout.texts.filter(({ id }) => id.startsWith('instructions-value-'));
    const lanesWithoutPix = getLanes(layoutWithoutPix);
    const lanesWithPix = getLanes(layoutWithPix);

    expect(layoutWithoutPix.pixQrCode).toBeUndefined();
    expect(layoutWithPix.pixQrCode).toMatchObject({
      value: pixData.pix?.emvPayload,
      width: BOLETO_PIX_QR_SIZE_MM,
      height: BOLETO_PIX_QR_SIZE_MM,
    });
    expect(lanesWithPix).toHaveLength(3);
    expect(lanesWithPix.map(({ value }) => value)).toEqual(instructions);
    expect(lanesWithPix.map(({ y }) => y)).toEqual(lanesWithoutPix.map(({ y }) => y));
    expect(lanesWithPix.map(({ height }) => height)).toEqual(
      lanesWithoutPix.map(({ height }) => height),
    );
    expect(lanesWithPix.every(({ width }) => width === lanesWithPix[0]?.width)).toBe(true);
    expect(lanesWithoutPix.every(({ width }) => width === lanesWithoutPix[0]?.width)).toBe(true);
    expect(lanesWithPix[0]?.width).toBeLessThan(lanesWithoutPix[0]?.width ?? 0);
    expect((lanesWithPix[0]?.x ?? 0) + (lanesWithPix[0]?.width ?? 0) + BOLETO_PIX_QR_GAP_MM).toBe(
      layoutWithPix.pixQrCode?.x,
    );
    expect(
      lanesWithPix.every(
        ({ x, y, width, height }) =>
          x >= 0 &&
          y >= 45 &&
          x + width <= (layoutWithPix.pixQrCode?.x ?? 0) - BOLETO_PIX_QR_GAP_MM &&
          y + height <= 66,
      ),
    ).toBe(true);
    expect(
      lanesWithoutPix.every(
        ({ x, y, width, height }) =>
          x >= 0 && y >= 45 && x + width <= BOLETO_FICHA_MIN_WIDTH_MM - 50 && y + height <= 66,
      ),
    ).toBe(true);
    const [firstLane, secondLane, thirdLane] = lanesWithPix;
    expect(firstLane.y).toBeLessThan(secondLane.y);
    expect(secondLane.y).toBeLessThan(thirdLane.y);
  });

  it('uses the three Annex III adjustment rows and a dedicated final-beneficiary line', () => {
    const data: BoletoData = {
      ...createData('registered'),
      beneficiaryMode: 'third-party',
      finalBeneficiary: {
        name: 'Comércio Final Ltda.',
        taxId: { type: 'cnpj', number: '04.252.011/0001-10' },
      },
      discountDeductionCents: 150,
      interestPenaltyCents: 25,
      chargedAmountCents: 12_220,
    };
    const layout = buildBoletoLayout(
      data,
      createSchema(200, 95),
      formatDigitableLine(data.barcode),
    );
    const text = (id: string) => layout.texts.find((primitive) => primitive.id === id);

    expect(text('discount-deduction-label')?.value).toBe('(-) Desconto/Abatimento');
    expect(text('discount-deduction-value')?.value).toBe('R$ 1,50');
    expect(text('interest-penalty-label')?.value).toBe('(+) Juros/Multa');
    expect(text('interest-penalty-value')?.value).toBe('R$ 0,25');
    expect(text('paid-label')?.value).toBe('(=) Valor Pago');
    expect(text('paid-value')?.value).toBe('R$ 122,20');
    expect(text('discount-label')).toBeUndefined();
    expect(text('deduction-label')).toBeUndefined();
    expect(text('additions-label')).toBeUndefined();

    expect(text('payer-value')?.value).not.toContain(data.finalBeneficiary?.name);
    expect(text('final-beneficiary-label')?.value).toBe('Beneficiário Final');
    expect(text('final-beneficiary-value')?.value).toBe(
      'Comércio Final Ltda. - CNPJ 04.252.011/0001-10',
    );
  });

  it('uses the accented Annex III field labels and literal authentication caption', () => {
    const data = createData('registered');
    const layout = buildBoletoLayout(
      data,
      createSchema(200, 95),
      formatDigitableLine(data.barcode),
    );
    const values = layout.texts.map(({ value }) => value);

    expect(values).toContain('Nome do Beneficiário / CNPJ/CPF / Endereço');
    expect(values).toContain('Agência / Código do Beneficiário');
    expect(values).toContain('Informações de responsabilidade do Beneficiário');
    expect(values).toContain(BOLETO_MECHANICAL_AUTHENTICATION_LABEL);
  });
});

describe('boleto ficha schema validation', () => {
  it.each([
    ['width below minimum', { width: BOLETO_FICHA_MIN_WIDTH_MM - 0.01 }, 'Ficha width'],
    ['width above maximum', { width: BOLETO_FICHA_MAX_WIDTH_MM + 0.01 }, 'Ficha width'],
    ['height below minimum', { height: BOLETO_FICHA_MIN_HEIGHT_MM - 0.01 }, 'Ficha height'],
    ['height above maximum', { height: BOLETO_FICHA_MAX_HEIGHT_MM + 0.01 }, 'Ficha height'],
    ['rotation', { rotate: 1 }, 'Ficha rotation must be zero'],
    ['opacity', { opacity: 0.99 }, 'Ficha opacity must be 1'],
    ['negative x', { position: { x: -0.01, y: 0 } }, 'Ficha x position must be non-negative'],
    ['negative y', { position: { x: 0, y: -0.01 } }, 'Ficha y position must be non-negative'],
    ['variant', { variant: 'carne' }, 'Unsupported boleto layout variant'],
  ])('rejects %s', (_caseName, overrides, message) => {
    const schema = { ...createSchema(200, 95), ...overrides } as BoletoSchema;

    expect(() => validateBoletoSchema(schema)).toThrow(`[@pdfweave/schemas/boleto] ${message}`);
  });
});
