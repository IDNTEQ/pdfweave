import {
  buildBoletoBarcode,
  calculateDueDateFactor,
  calculateModulo10FieldDigit,
  calculateModulo11GeneralDigit,
  deriveDigitableLine,
  digitableLineToBarcode,
  formatDigitableLine,
  INSTITUTION_CODE_DIGIT_REGISTRY_VERSION,
  KNOWN_INSTITUTION_CODE_DIGITS,
  normalizeDigitableLine,
  validateBoletoBarcode,
  validateInstitutionCodeDigit,
} from '../src/boleto/digits.js';

const ITAU_BARCODE = '34196166700000123451101234567880057123457000';
const ITAU_FORMATTED_LINE = '34191.10121 34567.880058 71234.570001 6 16670000012345';
const ITAU_RAW_LINE = '34191101213456788005871234570001616670000012345';
const BB_BARCODE = '00193373700000001000500940144816060680935031';
const BB_FORMATTED_LINE = '00190.50095 40144.816069 06809.350314 3 37370000000100';
const BB_RAW_LINE = '00190500954014481606906809350314337370000000100';

describe('boleto digit algorithms', () => {
  test('derives and formats the official Itau vector', () => {
    const withoutGeneralDigit = `${ITAU_BARCODE.slice(0, 4)}${ITAU_BARCODE.slice(5)}`;

    expect(calculateModulo11GeneralDigit(withoutGeneralDigit)).toBe(6);
    expect(calculateModulo10FieldDigit('341911012')).toBe(1);
    expect(calculateModulo10FieldDigit('3456788005')).toBe(8);
    expect(calculateModulo10FieldDigit('7123457000')).toBe(1);
    expect(validateBoletoBarcode(ITAU_BARCODE)).toBe(ITAU_BARCODE);
    expect(deriveDigitableLine(ITAU_BARCODE)).toBe(ITAU_RAW_LINE);
    expect(normalizeDigitableLine(ITAU_FORMATTED_LINE)).toBe(ITAU_RAW_LINE);
    expect(formatDigitableLine(ITAU_BARCODE)).toBe(ITAU_FORMATTED_LINE);
    expect(formatDigitableLine(ITAU_RAW_LINE)).toBe(ITAU_FORMATTED_LINE);
    expect(digitableLineToBarcode(ITAU_FORMATTED_LINE)).toBe(ITAU_BARCODE);
  });

  test('derives and formats the official Banco do Brasil vector', () => {
    const withoutGeneralDigit = `${BB_BARCODE.slice(0, 4)}${BB_BARCODE.slice(5)}`;

    expect(calculateModulo11GeneralDigit(withoutGeneralDigit)).toBe(3);
    expect(validateBoletoBarcode(BB_BARCODE)).toBe(BB_BARCODE);
    expect(deriveDigitableLine(BB_BARCODE)).toBe(BB_RAW_LINE);
    expect(normalizeDigitableLine(BB_FORMATTED_LINE)).toBe(BB_RAW_LINE);
    expect(formatDigitableLine(BB_BARCODE)).toBe(BB_FORMATTED_LINE);
    expect(formatDigitableLine(BB_RAW_LINE)).toBe(BB_FORMATTED_LINE);
    expect(digitableLineToBarcode(BB_FORMATTED_LINE)).toBe(BB_BARCODE);
  });

  test('rejects corrupted barcode and line check digits with stable errors', () => {
    const corruptedBarcode = `${ITAU_BARCODE.slice(0, 4)}7${ITAU_BARCODE.slice(5)}`;
    const corruptedLine = `${ITAU_RAW_LINE.slice(0, 9)}2${ITAU_RAW_LINE.slice(10)}`;

    expect(() => validateBoletoBarcode(corruptedBarcode)).toThrow(
      '[@pdfweave/schemas/boleto] barcode general check digit must be 6',
    );
    expect(() => digitableLineToBarcode(corruptedLine)).toThrow(
      '[@pdfweave/schemas/boleto] digitableLine field 1 check digit must be 1',
    );
    expect(() => normalizeDigitableLine('34191-10121')).toThrow('[@pdfweave/schemas/boleto]');
  });

  test('maps modulo-11 fallback results to one', () => {
    expect(calculateModulo11GeneralDigit('0'.repeat(43))).toBe(1);
  });

  test('accepts uppercase X and cross-checks verified institution display suffixes', () => {
    expect(INSTITUTION_CODE_DIGIT_REGISTRY_VERSION).toBe('2026-08-01');
    expect(KNOWN_INSTITUTION_CODE_DIGITS).toEqual(
      new Map([
        ['001', '9'],
        ['104', '0'],
        ['341', '7'],
        ['748', 'X'],
      ]),
    );
    expect(validateInstitutionCodeDigit('001', '9')).toBe('9');
    expect(validateInstitutionCodeDigit('104', '0')).toBe('0');
    expect(validateInstitutionCodeDigit('341', '7')).toBe('7');
    expect(validateInstitutionCodeDigit('748', 'X')).toBe('X');
    expect(validateInstitutionCodeDigit('999', 'X')).toBe('X');

    expect(() => validateInstitutionCodeDigit('748', '0')).toThrow(
      '[@pdfweave/schemas/boleto] institution codeDigit for 748 must be X',
    );
    expect(() => validateInstitutionCodeDigit('748', 'x')).toThrow(
      '[@pdfweave/schemas/boleto] institution codeDigit must be one digit or uppercase X',
    );
  });

  test('implements the CAIXA-documented 2025 factor reset and range', () => {
    // CAIXA SIGCB: factor 1000 restarts on 2025-02-22 and reaches 9999 on 2049-10-13.
    expect(calculateDueDateFactor('2025-02-21')).toBe(9999);
    expect(calculateDueDateFactor('2025-02-22')).toBe(1000);
    expect(calculateDueDateFactor('2025-02-24')).toBe(1002);
    expect(calculateDueDateFactor('2026-12-21')).toBe(1667);
    expect(calculateDueDateFactor('2035-07-09')).toBe(4789);
    expect(calculateDueDateFactor('2049-10-13')).toBe(9999);
    expect(calculateDueDateFactor('2000-07-03')).toBe(1000);

    expect(() => calculateDueDateFactor('2025-02-30')).toThrow(
      '[@pdfweave/schemas/boleto] dueDate must be a real ISO date',
    );
    expect(() => calculateDueDateFactor('2050-01-01')).toThrow('[@pdfweave/schemas/boleto]');
  });

  test('builds a barcode only from an explicit 25-digit bank free field', () => {
    const barcode = buildBoletoBarcode({
      institutionCode: '341',
      dueDate: '2026-12-21',
      amountMode: 'fixed',
      documentValueCents: 12_345,
      freeField: '1101234567880057123457000',
    });

    expect(barcode).toBe(ITAU_BARCODE);
    expect(() =>
      buildBoletoBarcode({
        institutionCode: '341',
        dueDate: '2026-12-21',
        amountMode: 'fixed',
        documentValueCents: 12_345,
        freeField: '1234',
      }),
    ).toThrow('[@pdfweave/schemas/boleto] freeField must contain exactly 25 digits');

    expect(() =>
      buildBoletoBarcode({
        institutionCode: '988',
        dueDate: '2026-12-21',
        amountMode: 'fixed',
        documentValueCents: 12_345,
        freeField: '1101234567880057123457000',
      }),
    ).toThrow('[@pdfweave/schemas/boleto] institutionCode 988 (ISPB) is not supported');

    const validIspbCheckDigit = calculateModulo11GeneralDigit(`9889${'0'.repeat(39)}`);
    const ispbBarcode = `9889${String(validIspbCheckDigit)}${'0'.repeat(39)}`;
    expect(() => validateBoletoBarcode(ispbBarcode)).toThrow(
      '[@pdfweave/schemas/boleto] barcode institution code 988 (ISPB) is not supported',
    );
  });

  test('encodes zero in the barcode amount field for variable-amount boletos', () => {
    const barcode = buildBoletoBarcode({
      institutionCode: '341',
      dueDate: '2026-12-21',
      amountMode: 'variable',
      documentValueCents: 25_000,
      freeField: '1101234567880057123457000',
    });

    expect(barcode.slice(9, 19)).toBe('0000000000');
    expect(validateBoletoBarcode(barcode)).toBe(barcode);
  });

  test('encodes the largest representable fixed barcode amount', () => {
    const barcode = buildBoletoBarcode({
      institutionCode: '341',
      dueDate: '2026-12-21',
      amountMode: 'fixed',
      documentValueCents: 9_999_999_999,
      freeField: '1101234567880057123457000',
    });

    expect(barcode.slice(9, 19)).toBe('9999999999');
    expect(validateBoletoBarcode(barcode)).toBe(barcode);
  });

  test('rejects invalid or unrepresentable barcode amounts', () => {
    const base = {
      institutionCode: '341',
      dueDate: '2026-12-21',
      freeField: '1101234567880057123457000',
    } as const;

    expect(() => buildBoletoBarcode({ ...base, amountMode: 'fixed' })).toThrow(
      '[@pdfweave/schemas/boleto] fixed amount barcodes require documentValueCents greater than zero',
    );
    expect(() =>
      buildBoletoBarcode({ ...base, amountMode: 'fixed', documentValueCents: 0 }),
    ).toThrow(
      '[@pdfweave/schemas/boleto] fixed amount barcodes require documentValueCents greater than zero',
    );
    expect(() =>
      buildBoletoBarcode({
        ...base,
        amountMode: 'fixed',
        documentValueCents: 10_000_000_000,
      }),
    ).toThrow(
      '[@pdfweave/schemas/boleto] documentValueCents exceeds the 10-digit barcode amount field',
    );
    expect(() =>
      buildBoletoBarcode({ ...base, amountMode: 'fixed', documentValueCents: 12.5 }),
    ).toThrow('[@pdfweave/schemas/boleto] documentValueCents must be a safe integer');
    expect(() =>
      buildBoletoBarcode({ ...base, amountMode: 'variable', documentValueCents: -1 }),
    ).toThrow('[@pdfweave/schemas/boleto] documentValueCents cannot be negative');
  });
});
