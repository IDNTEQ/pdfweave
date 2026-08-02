import { BOLETO_ERROR_PREFIX } from './types.js';

// Defensive parser ceiling only. Renderability is based on the encoded QR
// module count because equal-length payloads can require different versions.
export const BOLETO_PIX_PAYLOAD_MAX_CHARACTERS = 499;
export const BOLETO_PIX_QR_PADDING_POINTS = 7;

export interface PixTlvField {
  tag: string;
  characterLength: number;
  value: string;
}

interface ParsedPixPayloadBase {
  fields: readonly PixTlvField[];
  merchantAccountTag: string;
  merchantAccountFields: readonly PixTlvField[];
  referenceLabel: string;
  amountCents?: number;
}

export type ParsedPixPayload = ParsedPixPayloadBase &
  (
    | {
        payloadType: 'static';
        pixKey: string;
        dynamicUrl?: never;
      }
    | {
        payloadType: 'dynamic';
        pixKey?: never;
        dynamicUrl: string;
      }
  );

interface InternalTlvField extends PixTlvField {
  characterOffset: number;
  valueCharacterOffset: number;
}

const encoder = new TextEncoder();
const CRC_INITIAL_VALUE = 65_535;
const CRC_HIGH_BIT = 32_768;
const CRC_POLYNOMIAL = 4129;
const PIX_GUI = 'br.gov.bcb.pix';

const fail = (message: string): never => {
  throw new Error(`${BOLETO_ERROR_PREFIX} Pix payload ${message}`);
};

const readDigits = (characters: readonly string[], offset: number): string | undefined => {
  const first = characters.at(offset);
  const second = characters.at(offset + 1);
  if (first === undefined || second === undefined || !/^\d$/.test(first) || !/^\d$/.test(second)) {
    return undefined;
  }
  return `${first}${second}`;
};

const assertWellFormedUnicode = (value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing < 0xdc00 || trailing > 0xdfff) {
        fail('contains an unpaired UTF-16 surrogate');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail('contains an unpaired UTF-16 surrogate');
    }
  }
};

const parseTlvCharacters = (characters: readonly string[], context: string): InternalTlvField[] => {
  const fields: InternalTlvField[] = [];
  let offset = 0;

  while (offset < characters.length) {
    if (characters.length - offset < 4) {
      fail(`${context} has a truncated field header at character ${String(offset)}`);
    }

    const tag =
      readDigits(characters, offset) ??
      fail(`${context} tag at character ${String(offset)} must contain exactly two digits`);
    const encodedLength =
      readDigits(characters, offset + 2) ??
      fail(`${context} tag ${tag} length must contain exactly two digits`);

    const characterLength = Number(encodedLength);
    const valueCharacterOffset = offset + 4;
    const valueEnd = valueCharacterOffset + characterLength;
    if (valueEnd > characters.length) {
      fail(
        `${context} tag ${tag} declares ${String(characterLength)} characters but only ${String(characters.length - valueCharacterOffset)} remain`,
      );
    }

    fields.push({
      tag,
      characterLength,
      value: characters.slice(valueCharacterOffset, valueEnd).join(''),
      characterOffset: offset,
      valueCharacterOffset,
    });
    offset = valueEnd;
  }

  return fields;
};

const assertUniqueTags = (fields: readonly InternalTlvField[], context: string): void => {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.tag)) {
      fail(`${context} contains duplicate tag ${field.tag}`);
    }
    seen.add(field.tag);
  }
};

const requireValue = (
  fields: readonly InternalTlvField[],
  tag: string,
  label: string,
  expected: string,
): void => {
  const field = fields.find((candidate) => candidate.tag === tag);
  if (field === undefined) {
    return fail(`is missing ${label} tag ${tag}`);
  }
  if (field.value !== expected) {
    fail(`${label} tag ${tag} must be ${expected}`);
  }
};

const requireField = (
  fields: readonly InternalTlvField[],
  tag: string,
  label: string,
): InternalTlvField =>
  fields.find((candidate) => candidate.tag === tag) ?? fail(`is missing ${label} tag ${tag}`);

const isPixGui = (value: string): boolean => {
  const asciiLowercase = value.replaceAll(/[A-Z]/g, (character) => character.toLowerCase());
  return asciiLowercase === PIX_GUI;
};

const calculateCrc16CcittFalse = (bytes: Uint8Array): number => {
  let crc = CRC_INITIAL_VALUE;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & CRC_HIGH_BIT) === 0
          ? (crc << 1) & CRC_INITIAL_VALUE
          : ((crc << 1) ^ CRC_POLYNOMIAL) & CRC_INITIAL_VALUE;
    }
  }
  return crc;
};

const validateCrc = (characters: readonly string[], fields: readonly InternalTlvField[]): void => {
  const lastField = fields.at(-1);
  if (lastField?.tag !== '63' || lastField.characterLength !== 4) {
    return fail('CRC must be the final tag 63 with length 04');
  }
  if (!/^[0-9A-Fa-f]{4}$/.test(lastField.value)) {
    fail('CRC tag 63 must contain four hexadecimal characters');
  }

  const crcInput = encoder.encode(characters.slice(0, lastField.valueCharacterOffset).join(''));
  const expected = calculateCrc16CcittFalse(crcInput).toString(16).toUpperCase().padStart(4, '0');
  if (lastField.value.toUpperCase() !== expected) {
    fail(`CRC must be ${expected}`);
  }
};

const findPixMerchantAccount = (
  fields: readonly InternalTlvField[],
): { field: InternalTlvField; nested: InternalTlvField[] } => {
  const matches: { field: InternalTlvField; nested: InternalTlvField[] }[] = [];
  for (const field of fields) {
    const numericTag = Number(field.tag);
    if (numericTag < 26 || numericTag > 51) {
      continue;
    }

    const nested = parseTlvCharacters([...field.value], `merchant account tag ${field.tag}`);
    assertUniqueTags(nested, `merchant account tag ${field.tag}`);
    if (nested.some((candidate) => candidate.tag === '00' && isPixGui(candidate.value))) {
      matches.push({ field, nested });
    }
  }

  if (matches.length === 0) {
    return fail(`must contain merchant account information with GUI ${PIX_GUI}`);
  }
  if (matches.length > 1) {
    return fail(`must contain exactly one merchant account information field with GUI ${PIX_GUI}`);
  }
  return matches[0];
};

type ClassifiedMerchantAccount =
  | { payloadType: 'static'; pixKey: string; dynamicUrl?: never }
  | { payloadType: 'dynamic'; pixKey?: never; dynamicUrl: string };

const classifyMerchantAccount = (
  fields: readonly InternalTlvField[],
): ClassifiedMerchantAccount => {
  const pixKey = fields.find((field) => field.tag === '01');
  const dynamicUrl = fields.find((field) => field.tag === '25');

  if (pixKey !== undefined && dynamicUrl !== undefined) {
    return fail('merchant account information must not contain both Pix key tag 01 and URL tag 25');
  }
  if (pixKey === undefined && dynamicUrl === undefined) {
    return fail('merchant account information must contain Pix key tag 01 or URL tag 25');
  }
  if (pixKey !== undefined) {
    if (pixKey.characterLength === 0) {
      return fail('merchant account Pix key tag 01 must not be empty');
    }
    if (pixKey.characterLength > 77) {
      return fail('merchant account Pix key tag 01 must contain at most 77 characters');
    }
    return { payloadType: 'static', pixKey: pixKey.value };
  }
  if (dynamicUrl === undefined || dynamicUrl.characterLength === 0) {
    return fail('merchant account URL tag 25 must not be empty');
  }
  if (dynamicUrl.characterLength > 77) {
    return fail('merchant account URL tag 25 must contain at most 77 characters');
  }
  return { payloadType: 'dynamic', dynamicUrl: dynamicUrl.value };
};

const validateInitiationMethod = (
  fields: readonly InternalTlvField[],
  payloadType: ClassifiedMerchantAccount['payloadType'],
): void => {
  const initiationMethod = fields.find((field) => field.tag === '01');
  if (initiationMethod === undefined) {
    return;
  }

  const expected = payloadType === 'static' ? '11' : '12';
  if (initiationMethod.value !== expected) {
    fail(`point of initiation method tag 01 must be ${expected} for a ${payloadType} payload`);
  }
};

const validateCompleteRootFields = (fields: readonly InternalTlvField[]): string => {
  const merchantCategoryCode = requireField(fields, '52', 'merchant category code');
  if (!/^\d{4}$/.test(merchantCategoryCode.value)) {
    fail('merchant category code tag 52 must contain four digits');
  }

  requireValue(fields, '53', 'transaction currency', '986');
  requireValue(fields, '58', 'country code', 'BR');

  const merchantName = requireField(fields, '59', 'merchant name');
  if (merchantName.characterLength === 0 || merchantName.characterLength > 25) {
    fail('merchant name tag 59 must contain between 1 and 25 characters');
  }
  const merchantCity = requireField(fields, '60', 'merchant city');
  if (merchantCity.characterLength === 0 || merchantCity.characterLength > 15) {
    fail('merchant city tag 60 must contain between 1 and 15 characters');
  }

  const additionalData = requireField(fields, '62', 'additional data field');
  const additionalDataFields = parseTlvCharacters(
    [...additionalData.value],
    'additional data tag 62',
  );
  assertUniqueTags(additionalDataFields, 'additional data tag 62');
  const referenceLabel = requireField(additionalDataFields, '05', 'reference label');
  if (referenceLabel.characterLength === 0 || referenceLabel.characterLength > 25) {
    fail('reference label tag 05 must contain between 1 and 25 characters');
  }
  return referenceLabel.value;
};

const parseAmountCents = (fields: readonly InternalTlvField[]): number | undefined => {
  const amount = fields.find((field) => field.tag === '54')?.value;
  if (amount === undefined) {
    return undefined;
  }
  const match =
    /^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/.exec(amount) ??
    fail('transaction amount tag 54 must be a non-negative decimal with at most two cents digits');

  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

const toPublicField = ({ tag, characterLength, value }: InternalTlvField): PixTlvField => ({
  tag,
  characterLength,
  value,
});

/** Parses and structurally validates a complete Pix EMV copia-e-cola payload. */
export const parsePixPayload = (payload: string): ParsedPixPayload => {
  if (payload.length === 0) {
    fail('must not be empty');
  }
  assertWellFormedUnicode(payload);
  const characters = [...payload];
  if (characters.length > BOLETO_PIX_PAYLOAD_MAX_CHARACTERS) {
    fail(`must contain at most ${String(BOLETO_PIX_PAYLOAD_MAX_CHARACTERS)} characters`);
  }

  const fields = parseTlvCharacters(characters, 'root');
  assertUniqueTags(fields, 'root');
  validateCrc(characters, fields);
  requireValue(fields, '00', 'payload format indicator', '01');
  const merchantAccount = findPixMerchantAccount(fields);
  const classification = classifyMerchantAccount(merchantAccount.nested);
  validateInitiationMethod(fields, classification.payloadType);
  const referenceLabel = validateCompleteRootFields(fields);
  const amountCents = parseAmountCents(fields);

  return {
    fields: fields.map((field) => toPublicField(field)),
    merchantAccountTag: merchantAccount.field.tag,
    merchantAccountFields: merchantAccount.nested.map((field) => toPublicField(field)),
    referenceLabel,
    ...classification,
    ...(amountCents === undefined ? {} : { amountCents }),
  };
};

/** Asserts that a value is a valid Pix payload and returns its parsed representation. */
export const validatePixPayload = parsePixPayload;
