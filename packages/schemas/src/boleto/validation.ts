import { z } from 'zod';
import {
  calculateDueDateFactor,
  deriveDigitableLine,
  digitableLineToBarcode,
  normalizeDigitableLine,
  validateBoletoBarcode,
  validateInstitutionCodeDigit,
} from './digits.js';
import { BOLETO_DATA_VERSION, BOLETO_ERROR_PREFIX, type BoletoData } from './types.js';

const MAX_BARCODE_AMOUNT_CENTS = 9_999_999_999;
const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
const MAX_INSTITUTION_NAME_LENGTH = 80;
const MAX_PARTY_NAME_LENGTH = 150;
const MAX_STREET_LENGTH = 150;
const MAX_PAYMENT_LOCATION_LENGTH = 180;
const MAX_INSTRUCTION_LENGTH = 180;
const MAX_INSTRUCTION_COUNT = 8;
const MAX_INSTRUCTIONS_TOTAL_LENGTH = 720;
export const BOLETO_LOGO_MAX_DATA_URI_LENGTH = 8_000_000;

const nonBlankString = (maximumLength = 200) =>
  z
    .string()
    .max(maximumLength)
    .refine((value) => value.trim().length > 0, 'must not be blank');

const isRealIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const isoDate = z.string().refine(isRealIsoDate, 'must be a real ISO date in YYYY-MM-DD format');
const cents = z.number().int().nonnegative().max(MAX_BARCODE_AMOUNT_CENTS);

const normalizeCpfOrCnpj = (value: string): string => value.replaceAll(/[./-]/g, '');

const hasRepeatedDigits = (value: string): boolean => /^(\d)\1+$/.test(value);

const calculateCpfDigit = (digits: string, factor: number): number => {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits.slice(index, index + 1)) * (factor - index);
  }
  const candidate = (sum * 10) % 11;
  return candidate === 10 ? 0 : candidate;
};

const isValidCpf = (value: string): boolean => {
  if (!/^\d{11}$/.test(value) || hasRepeatedDigits(value)) {
    return false;
  }

  const firstDigit = calculateCpfDigit(value.slice(0, 9), 10);
  const secondDigit = calculateCpfDigit(`${value.slice(0, 9)}${String(firstDigit)}`, 11);
  return value.endsWith(`${String(firstDigit)}${String(secondDigit)}`);
};

const calculateCnpjDigit = (digits: string, weights: readonly number[]): number => {
  let sum = 0;
  for (const [index, weight] of weights.entries()) {
    sum += ((digits.codePointAt(index) ?? 0) - 48) * weight;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const isValidCnpj = (value: string): boolean => {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || (/^\d{14}$/.test(value) && hasRepeatedDigits(value))) {
    return false;
  }

  const base = value.slice(0, 12);
  const firstDigit = calculateCnpjDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateCnpjDigit(
    `${base}${String(firstDigit)}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return value.endsWith(`${String(firstDigit)}${String(secondDigit)}`);
};

const BrazilianTaxIdSchema = z
  .object({
    type: z.enum(['cpf', 'cnpj']),
    number: z.string(),
  })
  .strict()
  .superRefine(({ type, number }, context) => {
    const formattedCorrectly =
      type === 'cpf'
        ? /^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(number)
        : /^[A-Z0-9]{12}\d{2}$|^[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}$/.test(
            number,
          );
    const normalized = normalizeCpfOrCnpj(number);
    const checkDigitsCorrect = type === 'cpf' ? isValidCpf(normalized) : isValidCnpj(normalized);

    if (!formattedCorrectly || !checkDigitsCorrect) {
      context.addIssue({
        code: 'custom',
        path: ['number'],
        message: `${type.toUpperCase()} format or check digits are invalid`,
      });
    }
  });

const BrazilianAddressSchema = z
  .object({
    street: nonBlankString(MAX_STREET_LENGTH),
    number: nonBlankString(30).optional(),
    complement: nonBlankString(100).optional(),
    district: nonBlankString(100).optional(),
    city: nonBlankString(100),
    state: z.enum(BRAZILIAN_STATES),
    postalCode: z.string().regex(/^\d{8}$|^\d{5}-\d{3}$/, 'must be a valid CEP'),
  })
  .strict();

const BoletoPartySchema = z
  .object({
    name: nonBlankString(MAX_PARTY_NAME_LENGTH),
    taxId: BrazilianTaxIdSchema,
    address: BrazilianAddressSchema,
  })
  .strict();

const BoletoPartyIdentitySchema = z
  .object({
    name: nonBlankString(MAX_PARTY_NAME_LENGTH),
    taxId: BrazilianTaxIdSchema,
  })
  .strict();

const isPngOrJpegDataUri = (value: string): boolean => {
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  return value.slice(value.indexOf(',') + 1).length % 4 === 0;
};

const BoletoInstitutionSchema = z
  .object({
    name: nonBlankString(MAX_INSTITUTION_NAME_LENGTH),
    code: z.string().regex(/^\d{3}$/, 'must contain exactly 3 digits'),
    codeDigit: z.string().regex(/^[0-9X]$/, 'must be one digit or uppercase X'),
    logo: z
      .string()
      .max(BOLETO_LOGO_MAX_DATA_URI_LENGTH)
      .refine(isPngOrJpegDataUri, 'must be a base64 PNG or JPEG data URI')
      .optional(),
  })
  .strict();

const baseShape = {
  version: z.literal(BOLETO_DATA_VERSION),
  kind: z.literal('cobranca'),
  registrationStatus: z.enum(['registered', 'test']),
  institution: BoletoInstitutionSchema,
  beneficiaryMode: z.enum(['direct', 'third-party']),
  beneficiary: BoletoPartySchema,
  finalBeneficiary: BoletoPartyIdentitySchema.optional(),
  payer: BoletoPartySchema,
  paymentLocation: nonBlankString(MAX_PAYMENT_LOCATION_LENGTH),
  dueDate: isoDate,
  barcode: z.string().regex(/^\d{44}$/, 'must contain exactly 44 digits'),
  digitableLine: nonBlankString(80).optional(),
  agencyBeneficiaryCode: nonBlankString(50).optional(),
  documentDate: isoDate.optional(),
  documentNumber: nonBlankString(50).optional(),
  documentSpecies: nonBlankString(20).optional(),
  acceptance: z.enum(['A', 'N']).optional(),
  processingDate: isoDate.optional(),
  ourNumber: nonBlankString(50).optional(),
  bankUse: nonBlankString(100).optional(),
  portfolio: nonBlankString(50).optional(),
  currencyQuantity: nonBlankString(30).optional(),
  currencyUnitValueCents: cents.optional(),
  instructions: z
    .array(nonBlankString(MAX_INSTRUCTION_LENGTH))
    .max(MAX_INSTRUCTION_COUNT)
    .optional(),
};

const FixedAmountBoletoDataSchema = z
  .object({
    ...baseShape,
    amountMode: z.literal('fixed'),
    documentValueCents: cents.positive(),
    discountDeductionCents: cents.optional(),
    interestPenaltyCents: cents.optional(),
    chargedAmountCents: cents.optional(),
  })
  .strict();

const VariableAmountBoletoDataSchema = z
  .object({
    ...baseShape,
    amountMode: z.literal('variable'),
    documentValueCents: cents.optional(),
  })
  .strict();

const issueMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith(`${BOLETO_ERROR_PREFIX} `)
    ? message.slice(BOLETO_ERROR_PREFIX.length + 1)
    : message;
};

const addIssue = (context: z.RefinementCtx, path: PropertyKey[], message: string): void => {
  context.addIssue({ code: 'custom', path, message });
};

const validateBarcodeIdentity = (data: BoletoData, context: z.RefinementCtx): boolean => {
  if (data.institution.code === '988' || data.barcode.startsWith('988')) {
    addIssue(
      context,
      ['institution', 'code'],
      'institution code 988 (ISPB) is not supported for boleto de cobranca',
    );
    return false;
  }

  try {
    validateBoletoBarcode(data.barcode);
  } catch (error) {
    addIssue(context, ['barcode'], issueMessage(error));
    return false;
  }

  if (data.barcode.slice(0, 3) !== data.institution.code) {
    addIssue(context, ['barcode'], 'institution code does not match the barcode prefix');
  }
  try {
    validateInstitutionCodeDigit(data.institution.code, data.institution.codeDigit);
  } catch (error) {
    addIssue(context, ['institution', 'codeDigit'], issueMessage(error));
  }
  if (data.barcode[3] !== '9') {
    addIssue(context, ['barcode'], 'currency digit must be 9 for boleto de cobranca in BRL');
  }
  return true;
};

const validateDueDateFactor = (data: BoletoData, context: z.RefinementCtx): void => {
  const encodedFactor = data.barcode.slice(5, 9);
  if (encodedFactor === '0000') {
    return;
  }

  try {
    const expected = String(calculateDueDateFactor(data.dueDate)).padStart(4, '0');
    if (encodedFactor !== expected) {
      addIssue(context, ['dueDate'], `does not match barcode due-date factor ${encodedFactor}`);
    }
  } catch (error) {
    addIssue(context, ['dueDate'], issueMessage(error));
  }
};

const validateAmount = (data: BoletoData, context: z.RefinementCtx): void => {
  const encodedAmount = Number(data.barcode.slice(9, 19));
  if (data.amountMode === 'variable' && encodedAmount !== 0) {
    addIssue(context, ['barcode'], 'variable amount barcodes must encode 0000000000');
  }
  if (data.amountMode === 'fixed' && encodedAmount !== data.documentValueCents) {
    addIssue(
      context,
      ['documentValueCents'],
      `does not match barcode amount ${String(encodedAmount)}`,
    );
  }
};

const validateSuppliedLine = (data: BoletoData, context: z.RefinementCtx): void => {
  if (data.digitableLine === undefined) {
    return;
  }

  try {
    const normalized = normalizeDigitableLine(data.digitableLine);
    const lineBarcode = digitableLineToBarcode(normalized);
    if (lineBarcode !== data.barcode || normalized !== deriveDigitableLine(data.barcode)) {
      addIssue(context, ['digitableLine'], 'does not represent the supplied barcode');
    }
  } catch (error) {
    addIssue(context, ['digitableLine'], issueMessage(error));
  }
};

const validateBeneficiaryMode = (data: BoletoData, context: z.RefinementCtx): void => {
  if (data.beneficiaryMode === 'third-party' && data.finalBeneficiary === undefined) {
    addIssue(context, ['finalBeneficiary'], 'is required when beneficiaryMode is third-party');
  }
  if (
    data.beneficiaryMode === 'third-party' &&
    data.finalBeneficiary !== undefined &&
    data.finalBeneficiary.taxId.type === data.payer.taxId.type &&
    normalizeCpfOrCnpj(data.finalBeneficiary.taxId.number) ===
      normalizeCpfOrCnpj(data.payer.taxId.number)
  ) {
    addIssue(
      context,
      ['finalBeneficiary', 'taxId', 'number'],
      'must differ from payer taxId when beneficiaryMode is third-party',
    );
  }
  if (data.beneficiaryMode === 'direct' && data.finalBeneficiary !== undefined) {
    addIssue(context, ['finalBeneficiary'], 'must be omitted when beneficiaryMode is direct');
  }
};

const validateInstructionLength = (data: BoletoData, context: z.RefinementCtx): void => {
  const totalLength = data.instructions?.reduce(
    (total, instruction) => total + instruction.length,
    0,
  );
  if (totalLength !== undefined && totalLength > MAX_INSTRUCTIONS_TOTAL_LENGTH) {
    addIssue(
      context,
      ['instructions'],
      `combined length must not exceed ${String(MAX_INSTRUCTIONS_TOTAL_LENGTH)} characters`,
    );
  }
};

const validateAdjustments = (data: BoletoData, context: z.RefinementCtx): void => {
  if (data.amountMode !== 'fixed') {
    return;
  }

  const { discountDeductionCents, interestPenaltyCents, chargedAmountCents } = data;
  const hasAdjustment = discountDeductionCents !== undefined || interestPenaltyCents !== undefined;
  if (hasAdjustment && chargedAmountCents === undefined) {
    addIssue(
      context,
      ['chargedAmountCents'],
      'is required when discountDeductionCents or interestPenaltyCents is supplied',
    );
    return;
  }
  if (chargedAmountCents === undefined) {
    return;
  }

  const expectedChargedAmount =
    data.documentValueCents - (discountDeductionCents ?? 0) + (interestPenaltyCents ?? 0);
  if (expectedChargedAmount < 0) {
    addIssue(context, ['chargedAmountCents'], 'calculated charged amount must not be negative');
    return;
  }
  if (expectedChargedAmount > MAX_BARCODE_AMOUNT_CENTS) {
    addIssue(
      context,
      ['chargedAmountCents'],
      `calculated charged amount must not exceed ${String(MAX_BARCODE_AMOUNT_CENTS)}`,
    );
    return;
  }
  if (chargedAmountCents !== expectedChargedAmount) {
    addIssue(
      context,
      ['chargedAmountCents'],
      `must equal documentValueCents - discountDeductionCents + interestPenaltyCents (${String(expectedChargedAmount)})`,
    );
  }
};

export const BoletoDataSchema = z
  .discriminatedUnion('amountMode', [FixedAmountBoletoDataSchema, VariableAmountBoletoDataSchema])
  .superRefine((data, context) => {
    validateBeneficiaryMode(data, context);
    validateInstructionLength(data, context);
    validateAdjustments(data, context);
    const barcodeIsValid = validateBarcodeIdentity(data, context);
    if (!barcodeIsValid) {
      return;
    }
    validateDueDateFactor(data, context);
    validateAmount(data, context);
    validateSuppliedLine(data, context);
  });

const decodeStructuredInput = (input: unknown): unknown => {
  if (typeof input !== 'string') {
    return input;
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new Error(`${BOLETO_ERROR_PREFIX} boleto data must be an object or valid JSON`);
  }
};

const formatIssuePath = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? 'data' : path.map(String).join('.');

/** Parses object or JSON-string input and returns strictly validated boleto data. */
export const parseBoletoData = (input: unknown): BoletoData => {
  const result = BoletoDataSchema.safeParse(decodeStructuredInput(input));
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = formatIssuePath(firstIssue.path);
    const message = firstIssue.message;
    throw new Error(`${BOLETO_ERROR_PREFIX} Invalid boleto data at ${path}: ${message}`);
  }

  return result.data;
};

/** Checks an already structured object without accepting JSON text or throwing. */
export const isBoletoData = (input: unknown): input is BoletoData =>
  typeof input !== 'string' && BoletoDataSchema.safeParse(input).success;
