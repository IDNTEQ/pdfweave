import { formatDigitableLine } from '../src/boleto/digits.js';
import {
  BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
  BOLETO_BARCODE_HEIGHT_MM,
  BOLETO_BARCODE_LEFT_MM,
  BOLETO_BARCODE_WIDTH_MM,
  BOLETO_GRID_STROKE_MM,
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
import {
  BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM,
  BOLETO_DIGITABLE_LINE_STROKE_MM,
  BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM,
  BOLETO_INSTITUTION_CODE_STROKE_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
  BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
  BOLETO_MECHANICAL_AUTHENTICATION_STROKE_MM,
  type BoletoVectorDisplayPrimitive,
} from '../src/boleto/vectorDisplay.js';

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

const getOuterInkBounds = (display: BoletoVectorDisplayPrimitive) => {
  const halfStroke = display.strokeWidth / 2;
  const xCoordinates = display.segments.flatMap(({ x1, x2 }) => [x1, x2]);
  const yCoordinates = display.segments.flatMap(({ y1, y2 }) => [y1, y2]);
  return {
    left: Math.min(...xCoordinates) - halfStroke,
    top: Math.min(...yCoordinates) - halfStroke,
    right: Math.max(...xCoordinates) + halfStroke,
    bottom: Math.max(...yCoordinates) + halfStroke,
  };
};

describe('boleto ficha layout geometry', () => {
  it.each([
    [BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM],
    [BOLETO_FICHA_MAX_WIDTH_MM, BOLETO_FICHA_MAX_HEIGHT_MM],
  ])('keeps every primitive within a %d x %d mm ficha', (width, height) => {
    const schema = createSchema(width, height);
    const data = createData('registered');

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

    for (const primitive of layout.texts) {
      expectWithin(primitive.x, primitive.width, width);
      expectWithin(primitive.y, primitive.height, height);
    }
    for (const primitive of layout.images) {
      expectWithin(primitive.x, primitive.width, width);
      expectWithin(primitive.y, primitive.height, height);
    }
    for (const display of layout.vectorDisplays) {
      expectWithin(display.x, display.width, width);
      expectWithin(display.y, display.height, height);
      for (const segment of display.segments) {
        expect(segment.x1).toBeGreaterThanOrEqual(0);
        expect(segment.x1).toBeLessThanOrEqual(display.width);
        expect(segment.x2).toBeGreaterThanOrEqual(0);
        expect(segment.x2).toBeLessThanOrEqual(display.width);
        expect(segment.y1).toBeGreaterThanOrEqual(0);
        expect(segment.y1).toBeLessThanOrEqual(display.glyphHeight);
        expect(segment.y2).toBeGreaterThanOrEqual(0);
        expect(segment.y2).toBeLessThanOrEqual(display.glyphHeight);
      }
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

  it('keeps grid ink inside the ficha and merges shared cell borders', () => {
    for (const [width, height] of [
      [BOLETO_FICHA_MIN_WIDTH_MM, BOLETO_FICHA_MIN_HEIGHT_MM],
      [BOLETO_FICHA_MAX_WIDTH_MM, BOLETO_FICHA_MAX_HEIGHT_MM],
    ]) {
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
    }
  });

  it('uses the required shared vector metrics and alignment', () => {
    const schema = createSchema(BOLETO_FICHA_MIN_WIDTH_MM, 95);
    const data = createData('registered');
    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
    const display = (id: string) => layout.vectorDisplays.find((primitive) => primitive.id === id);
    const institutionCode = display('institution-code');
    const digitableLine = display('digitable-line');
    const mechanicalAuthentication = display('mechanical-authentication');

    expect(layout.texts.find(({ id }) => id === 'institution-code')).toBeUndefined();
    expect(layout.texts.find(({ id }) => id === 'digitable-line')).toBeUndefined();
    expect(layout.texts.find(({ id }) => id === 'mechanical-authentication')).toBeUndefined();
    expect(institutionCode).toMatchObject({
      value: '341-7',
      y: 2,
      height: BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM,
      glyphHeight: BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM,
      strokeWidth: BOLETO_INSTITUTION_CODE_STROKE_MM,
      lineCap: 'round',
    });
    expect((institutionCode?.x ?? 0) + (institutionCode?.width ?? 0) / 2).toBe(41.5);
    expect(digitableLine).toMatchObject({
      value: formatDigitableLine(data.barcode),
      x: 50,
      y: 2.5,
      height: BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM,
      glyphHeight: BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM,
      strokeWidth: BOLETO_DIGITABLE_LINE_STROKE_MM,
      lineCap: 'round',
    });
    expect(mechanicalAuthentication).toMatchObject({
      value: BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
      glyphHeight: BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
      height: BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
      strokeWidth: BOLETO_MECHANICAL_AUTHENTICATION_STROKE_MM,
      lineCap: 'round',
    });
    if (!institutionCode || !digitableLine || !mechanicalAuthentication) {
      throw new Error('Expected all three specification-sized vector displays');
    }
    const institutionInk = getOuterInkBounds(institutionCode);
    const digitableLineInk = getOuterInkBounds(digitableLine);
    expect(institutionInk.left).toBeCloseTo(0, 10);
    expect(institutionInk.top).toBeCloseTo(0, 10);
    expect(institutionInk.right).toBeCloseTo(institutionCode.width, 10);
    expect(institutionInk.bottom).toBeCloseTo(BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM, 10);
    expect(
      institutionCode.segments.some(
        ({ x1, y1, x2, y2 }) => Math.abs(x2 - x1) > 0.01 && Math.abs(y2 - y1) > 0.01,
      ),
    ).toBe(true);
    expect(digitableLineInk.left).toBeCloseTo(0, 10);
    expect(digitableLineInk.top).toBeCloseTo(0, 10);
    expect(digitableLineInk.right).toBeCloseTo(digitableLine.width, 10);
    expect(digitableLineInk.bottom).toBeCloseTo(BOLETO_DIGITABLE_LINE_GLYPH_HEIGHT_MM, 10);
    expect(digitableLine.x + digitableLineInk.left).toBe(50);
    expect(digitableLine.x + digitableLine.width).toBeLessThanOrEqual(schema.width);
    const mechanicalAuthenticationInk = getOuterInkBounds(mechanicalAuthentication);
    expect(mechanicalAuthenticationInk.left).toBeCloseTo(0, 10);
    expect(mechanicalAuthenticationInk.top).toBeCloseTo(0, 10);
    expect(mechanicalAuthenticationInk.right).toBeCloseTo(mechanicalAuthentication.width, 10);
    expect(mechanicalAuthenticationInk.bottom).toBeCloseTo(
      BOLETO_MECHANICAL_AUTHENTICATION_GLYPH_HEIGHT_MM,
      10,
    );
    expect(mechanicalAuthentication.x).toBeGreaterThanOrEqual(112);
    expect(mechanicalAuthentication.x + mechanicalAuthentication.width).toBeCloseTo(
      schema.width - 1,
      10,
    );
    expect(mechanicalAuthentication.segments.length).toBeGreaterThan(0);
    expect(layout.lines.every(({ thickness }) => thickness === BOLETO_GRID_STROKE_MM)).toBe(true);
  });

  it('draws an uppercase X institution suffix without relying on a font glyph', () => {
    const data = createData('registered');
    data.institution = { ...data.institution, code: '748', codeDigit: 'X' };
    const layout = buildBoletoLayout(
      data,
      createSchema(200, 95),
      formatDigitableLine(data.barcode),
    );
    const institutionCode = layout.vectorDisplays.find(({ id }) => id === 'institution-code');

    expect(institutionCode?.value).toBe('748-X');
    const xSegments = institutionCode?.segments.slice(-2) ?? [];
    expect(xSegments).toHaveLength(2);
    expect(xSegments[0]?.y1).toBeCloseTo(BOLETO_INSTITUTION_CODE_STROKE_MM / 2, 10);
    expect(xSegments[0]?.y2).toBeCloseTo(
      BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM - BOLETO_INSTITUTION_CODE_STROKE_MM / 2,
      10,
    );
    expect(xSegments[1]?.y1).toBeCloseTo(BOLETO_INSTITUTION_CODE_STROKE_MM / 2, 10);
    expect(xSegments[1]?.y2).toBeCloseTo(
      BOLETO_INSTITUTION_CODE_GLYPH_HEIGHT_MM - BOLETO_INSTITUTION_CODE_STROKE_MM / 2,
      10,
    );
    expect((xSegments[0]?.x2 ?? 0) - (xSegments[0]?.x1 ?? 0)).toBeGreaterThan(0);
    expect((xSegments[1]?.x2 ?? 0) - (xSegments[1]?.x1 ?? 0)).toBeLessThan(0);
  });

  it('suppresses payable identifiers and watermarks test boletos', () => {
    const schema = createSchema(200, 95);
    const formattedLine = formatDigitableLine(ITAU_BARCODE);
    const normalizedLine = formattedLine.replace(/\D/g, '');
    const testLayout = buildBoletoLayout(createData('test'), schema, formattedLine);
    const registeredLayout = buildBoletoLayout(createData('registered'), schema, formattedLine);
    const testValues = [
      ...testLayout.texts.map(({ value }) => value),
      ...testLayout.vectorDisplays.map(({ value }) => value),
      testLayout.barcode?.value ?? '',
    ].join('\n');

    expect(testLayout.barcode).toBeUndefined();
    expect(testLayout.vectorDisplays.find(({ id }) => id === 'digitable-line')).toBeUndefined();
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
    expect(registeredLayout.vectorDisplays.find(({ id }) => id === 'digitable-line')?.value).toBe(
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
    expect(values).not.toContain(BOLETO_MECHANICAL_AUTHENTICATION_LABEL);
    expect(layout.vectorDisplays.find(({ id }) => id === 'mechanical-authentication')?.value).toBe(
      BOLETO_MECHANICAL_AUTHENTICATION_LABEL,
    );
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
