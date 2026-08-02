import { BOLETO_ERROR_PREFIX, type BuildBoletoBarcodeInput } from './types.js';

const DAY_MILLISECONDS = 86_400_000;
const FIRST_CYCLE_START = '2000-07-03';
const FIRST_CYCLE_END = '2025-02-21';
const RESET_CYCLE_START = '2025-02-22';
const RESET_CYCLE_END = '2049-10-13';
const MINIMUM_DUE_DATE_FACTOR = 1000;

/**
 * Institution display suffixes verified against first-party issuing-bank specifications.
 * Other COMPE codes remain syntactically valid because this suffix is not safely derivable
 * from the three-digit code alone (for example, 104-0 and 748-X have the same weighted sum).
 */
export const INSTITUTION_CODE_DIGIT_REGISTRY_VERSION = '2026-08-01' as const;
export const KNOWN_INSTITUTION_CODE_DIGITS: ReadonlyMap<string, string> = new Map([
  ['001', '9'],
  ['104', '0'],
  ['341', '7'],
  ['748', 'X'],
]);

const boletoError = (message: string): Error => new Error(`${BOLETO_ERROR_PREFIX} ${message}`);

const assertDigits = (value: string, label: string, length?: number): void => {
  if (!/^\d+$/.test(value) || (length !== undefined && value.length !== length)) {
    const size = length === undefined ? '' : ` exactly ${String(length)}`;
    throw boletoError(`${label} must contain${size} digits`);
  }
};

/** Validates a COMPE display suffix and cross-checks institution codes known to PDFweave. */
export const validateInstitutionCodeDigit = (code: string, codeDigit: string): string => {
  assertDigits(code, 'institution code', 3);
  if (!/^[0-9X]$/.test(codeDigit)) {
    throw boletoError('institution codeDigit must be one digit or uppercase X');
  }

  const expected = KNOWN_INSTITUTION_CODE_DIGITS.get(code);
  if (expected !== undefined && codeDigit !== expected) {
    throw boletoError(`institution codeDigit for ${code} must be ${expected}`);
  }

  return codeDigit;
};

const isoDateToUtcTime = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw boletoError('dueDate must be a real ISO date in YYYY-MM-DD format');
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw boletoError('dueDate must be a real ISO date in YYYY-MM-DD format');
  }

  return timestamp;
};

const dateFactorForCycle = (date: number, cycleStart: string): number =>
  MINIMUM_DUE_DATE_FACTOR + Math.floor((date - isoDateToUtcTime(cycleStart)) / DAY_MILLISECONDS);

/** Calculates the modulo-10 check digit used by the first three digitable-line fields. */
export const calculateModulo10FieldDigit = (digits: string): number => {
  assertDigits(digits, 'modulo-10 input');

  let multiplier = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const product = Number(digits.slice(index, index + 1)) * multiplier;
    sum += product > 9 ? product - 9 : product;
    multiplier = multiplier === 2 ? 1 : 2;
  }

  return (10 - (sum % 10)) % 10;
};

/** Calculates the general barcode check digit from the 43 digits that exclude position 5. */
export const calculateModulo11GeneralDigit = (barcodeWithoutGeneralDigit: string): number => {
  assertDigits(barcodeWithoutGeneralDigit, 'modulo-11 input', 43);

  let multiplier = 2;
  let sum = 0;
  for (let index = barcodeWithoutGeneralDigit.length - 1; index >= 0; index -= 1) {
    sum += Number(barcodeWithoutGeneralDigit.slice(index, index + 1)) * multiplier;
    multiplier = multiplier === 9 ? 2 : multiplier + 1;
  }

  const candidate = 11 - (sum % 11);
  return candidate === 0 || candidate === 10 || candidate === 11 ? 1 : candidate;
};

/**
 * Calculates the FEBRABAN due-date factor, including the factor-1000 reset on 2025-02-22.
 * Supported dates cover the unambiguous 1000-9999 ranges of the original and reset cycles.
 */
export const calculateDueDateFactor = (dueDate: string): number => {
  const timestamp = isoDateToUtcTime(dueDate);
  const firstStart = isoDateToUtcTime(FIRST_CYCLE_START);
  const firstEnd = isoDateToUtcTime(FIRST_CYCLE_END);
  const resetStart = isoDateToUtcTime(RESET_CYCLE_START);
  const resetEnd = isoDateToUtcTime(RESET_CYCLE_END);

  if (timestamp >= firstStart && timestamp <= firstEnd) {
    return dateFactorForCycle(timestamp, FIRST_CYCLE_START);
  }
  if (timestamp >= resetStart && timestamp <= resetEnd) {
    return dateFactorForCycle(timestamp, RESET_CYCLE_START);
  }

  throw boletoError(
    `dueDate must be between ${FIRST_CYCLE_START} and ${FIRST_CYCLE_END}, or between ${RESET_CYCLE_START} and ${RESET_CYCLE_END}`,
  );
};

/** Validates the structural and general check digit rules for a canonical 44-digit barcode. */
export const validateBoletoBarcode = (barcode: string): string => {
  assertDigits(barcode, 'barcode', 44);
  if (barcode.startsWith('988')) {
    throw boletoError(
      'barcode institution code 988 (ISPB) is not supported for boleto de cobranca',
    );
  }

  const withoutGeneralDigit = `${barcode.slice(0, 4)}${barcode.slice(5)}`;
  const expected = calculateModulo11GeneralDigit(withoutGeneralDigit);
  if (Number(barcode[4]) !== expected) {
    throw boletoError(`barcode general check digit must be ${String(expected)}`);
  }

  return barcode;
};

/** Derives the canonical, unformatted 47-digit line from a valid 44-digit barcode. */
export const deriveDigitableLine = (barcode: string): string => {
  validateBoletoBarcode(barcode);

  const first = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`;
  const second = barcode.slice(24, 34);
  const third = barcode.slice(34, 44);

  return (
    `${first}${String(calculateModulo10FieldDigit(first))}` +
    `${second}${String(calculateModulo10FieldDigit(second))}` +
    `${third}${String(calculateModulo10FieldDigit(third))}` +
    `${barcode[4]}${barcode.slice(5, 19)}`
  );
};

/** Removes the standard spaces and dots from a 47-digit line. */
export const normalizeDigitableLine = (digitableLine: string): string => {
  if (!/^[\d.\s]+$/.test(digitableLine)) {
    throw boletoError('digitableLine may contain only digits, spaces, and dots');
  }

  let normalized = '';
  for (const character of digitableLine) {
    if (/\d/.test(character)) {
      normalized += character;
    }
  }
  assertDigits(normalized, 'digitableLine', 47);
  return normalized;
};

/** Converts and validates a supplied 47-digit line into its canonical 44-digit barcode. */
export const digitableLineToBarcode = (digitableLine: string): string => {
  const normalized = normalizeDigitableLine(digitableLine);
  const fields = [
    { data: normalized.slice(0, 9), digit: normalized[9] },
    { data: normalized.slice(10, 20), digit: normalized[20] },
    { data: normalized.slice(21, 31), digit: normalized[31] },
  ];

  for (const [index, field] of fields.entries()) {
    const expected = calculateModulo10FieldDigit(field.data);
    if (Number(field.digit) !== expected) {
      throw boletoError(
        `digitableLine field ${String(index + 1)} check digit must be ${String(expected)}`,
      );
    }
  }

  const barcode =
    `${normalized.slice(0, 4)}${normalized[32]}${normalized.slice(33)}` +
    `${normalized.slice(4, 9)}${normalized.slice(10, 20)}${normalized.slice(21, 31)}`;
  return validateBoletoBarcode(barcode);
};

/** Formats a valid 44-digit barcode or 47-digit line using the FEBRABAN display grouping. */
export const formatDigitableLine = (barcodeOrLine: string): string => {
  const normalized = /^\d{44}$/.test(barcodeOrLine)
    ? deriveDigitableLine(barcodeOrLine)
    : normalizeDigitableLine(barcodeOrLine);

  digitableLineToBarcode(normalized);

  return (
    `${normalized.slice(0, 5)}.${normalized.slice(5, 10)} ` +
    `${normalized.slice(10, 15)}.${normalized.slice(15, 21)} ` +
    `${normalized.slice(21, 26)}.${normalized.slice(26, 32)} ` +
    `${normalized[32]} ${normalized.slice(33)}`
  );
};

const encodeAmount = ({
  amountMode,
  documentValueCents,
}: Pick<BuildBoletoBarcodeInput, 'amountMode' | 'documentValueCents'>): string => {
  const suppliedMode: unknown = amountMode;
  if (suppliedMode !== 'fixed' && suppliedMode !== 'variable') {
    throw boletoError('amountMode must be fixed or variable');
  }
  if (documentValueCents !== undefined && !Number.isSafeInteger(documentValueCents)) {
    throw boletoError('documentValueCents must be a safe integer');
  }
  if (documentValueCents !== undefined && documentValueCents > 9_999_999_999) {
    throw boletoError('documentValueCents exceeds the 10-digit barcode amount field');
  }

  if (amountMode === 'variable') {
    if (documentValueCents !== undefined && documentValueCents < 0) {
      throw boletoError('documentValueCents cannot be negative');
    }
    return '0000000000';
  }

  if (documentValueCents === undefined || documentValueCents <= 0) {
    throw boletoError('fixed amount barcodes require documentValueCents greater than zero');
  }
  return String(documentValueCents).padStart(10, '0');
};

/** Builds a barcode only when the caller supplies the bank-specific 25-digit free field. */
export const buildBoletoBarcode = (input: BuildBoletoBarcodeInput): string => {
  assertDigits(input.institutionCode, 'institutionCode', 3);
  if (input.institutionCode === '988') {
    throw boletoError('institutionCode 988 (ISPB) is not supported for boleto de cobranca');
  }
  assertDigits(input.freeField, 'freeField', 25);

  const dueDateFactor = String(calculateDueDateFactor(input.dueDate)).padStart(4, '0');
  const amount = encodeAmount(input);
  const withoutGeneralDigit = `${input.institutionCode}9${dueDateFactor}${amount}${input.freeField}`;
  const generalDigit = calculateModulo11GeneralDigit(withoutGeneralDigit);

  return `${withoutGeneralDigit.slice(0, 4)}${String(generalDigit)}${withoutGeneralDigit.slice(4)}`;
};
