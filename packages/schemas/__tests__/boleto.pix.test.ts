import {
  BOLETO_PIX_PAYLOAD_MAX_CHARACTERS,
  parsePixPayload,
  validatePixPayload,
} from '../src/boleto/pix.js';
import {
  BOLETO_PIX_QR_MAX_MODULES,
  BOLETO_PIX_QR_MIN_DOTS_PER_MODULE,
  inspectBoletoPixQrDensity,
} from '../src/boleto/pixQr.js';

const encoder = new TextEncoder();
const CRC_INITIAL_VALUE = 65_535;
const CRC_HIGH_BIT = 32_768;
const CRC_POLYNOMIAL = 4129;

const tlv = (tag: string, value: string): string => {
  const length = [...value].length;
  if (length > 99) {
    throw new Error('test TLV value exceeds the two-digit length field');
  }
  return `${tag}${String(length).padStart(2, '0')}${value}`;
};

const crc16CcittFalse = (value: string): string => {
  let crc = CRC_INITIAL_VALUE;
  for (const byte of encoder.encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & CRC_HIGH_BIT) === 0
          ? (crc << 1) & CRC_INITIAL_VALUE
          : ((crc << 1) ^ CRC_POLYNOMIAL) & CRC_INITIAL_VALUE;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const withCrc = (body: string): string => {
  const throughCrcHeader = `${body}6304`;
  return `${throughCrcHeader}${crc16CcittFalse(throughCrcHeader)}`;
};

const staticMerchantAccount = tlv(
  '26',
  tlv('00', 'br.gov.bcb.pix') + tlv('01', 'financeiro@example.com') + tlv('02', 'FATURA 2026-0001'),
);
const dynamicMerchantAccount = tlv(
  '26',
  tlv('00', 'br.gov.bcb.pix') + tlv('25', 'pix.example.com/cob/8f3adf0c'),
);
const BCB_PUBLISHED_STATIC_PAYLOAD =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
const BCB_PUBLISHED_DYNAMIC_PAYLOAD =
  '00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***630464E4';

interface PayloadOptions {
  merchantAccount: string;
  initiationMethod?: string;
  merchantCategoryCode?: string;
  currency?: string;
  amount?: string;
  country?: string;
  merchantName?: string;
  merchantCity?: string;
  additionalData?: string;
}

const buildPayload = ({
  merchantAccount,
  initiationMethod,
  merchantCategoryCode = '0000',
  currency = '986',
  amount,
  country = 'BR',
  merchantName = 'PDFWEAVE LTDA',
  merchantCity = 'SAO PAULO',
  additionalData = tlv('05', 'INV-2026-0001'),
}: PayloadOptions): string =>
  withCrc(
    tlv('00', '01') +
      (initiationMethod === undefined ? '' : tlv('01', initiationMethod)) +
      merchantAccount +
      tlv('52', merchantCategoryCode) +
      tlv('53', currency) +
      (amount === undefined ? '' : tlv('54', amount)) +
      tlv('58', country) +
      tlv('59', merchantName) +
      tlv('60', merchantCity) +
      tlv('62', additionalData),
  );

const buildStaticPayload = (
  overrides: { amount?: string; country?: string; currency?: string } = {},
) =>
  buildPayload({
    merchantAccount: staticMerchantAccount,
    initiationMethod: '11',
    amount: overrides.amount ?? '1234567890.09',
    currency: overrides.currency,
    country: overrides.country,
  });

const buildDynamicPayload = () =>
  buildPayload({
    merchantAccount: dynamicMerchantAccount,
    initiationMethod: '12',
    merchantCity: 'BRASILIA',
    additionalData: tlv('05', '***'),
  });

const buildMaximumDensityPayload = (): string => {
  const merchantAccount = tlv(
    '26',
    tlv('00', 'br.gov.bcb.pix') +
      tlv('01', 'financeiro-longo-1234567@example.com') +
      tlv('02', 'a'.repeat(37)),
  );
  return withCrc(
    tlv('00', '01') +
      tlv('01', '11') +
      merchantAccount +
      tlv('52', '0000') +
      tlv('53', '986') +
      tlv('54', '1.00') +
      tlv('55', '01') +
      tlv('58', 'BR') +
      tlv('59', 'a'.repeat(25)) +
      tlv('60', 'a'.repeat(15)) +
      tlv('61', '01310100') +
      tlv('62', tlv('05', 'a'.repeat(25))),
  );
};

describe('Pix EMV payload validation', () => {
  test.each([
    {
      name: 'static',
      payload: BCB_PUBLISHED_STATIC_PAYLOAD,
      expected: {
        payloadType: 'static',
        pixKey: '123e4567-e12b-12d1-a456-426655440000',
        referenceLabel: '***',
      },
    },
    {
      name: 'dynamic',
      payload: BCB_PUBLISHED_DYNAMIC_PAYLOAD,
      expected: {
        payloadType: 'dynamic',
        dynamicUrl: 'pix.example.com/8b3da2f39a4140d1a91abd93113bd441',
        referenceLabel: '***',
      },
    },
  ])('parses the BCB-published $name BR Code vector', ({ payload, expected }) => {
    expect(parsePixPayload(payload)).toMatchObject(expected);
  });

  test('keeps both BCB-published vectors within the fixed print-density envelope', async () => {
    const [staticMetrics, dynamicMetrics] = await Promise.all([
      inspectBoletoPixQrDensity(BCB_PUBLISHED_STATIC_PAYLOAD),
      inspectBoletoPixQrDensity(BCB_PUBLISHED_DYNAMIC_PAYLOAD),
    ]);

    expect(staticMetrics.moduleCount).toBe(45);
    expect(dynamicMetrics.moduleCount).toBe(BOLETO_PIX_QR_MAX_MODULES);
    expect(staticMetrics.dotsPerModuleAtMinimumDpi).toBeGreaterThanOrEqual(
      BOLETO_PIX_QR_MIN_DOTS_PER_MODULE,
    );
    expect(dynamicMetrics.dotsPerModuleAtMinimumDpi).toBeGreaterThanOrEqual(
      BOLETO_PIX_QR_MIN_DOTS_PER_MODULE,
    );
  });

  test('parses a deterministic static payload and returns exact integer cents', () => {
    const payload = buildStaticPayload();
    const parsed = parsePixPayload(payload);

    expect(parsed.amountCents).toBe(123_456_789_009);
    expect(parsed).toMatchObject({
      payloadType: 'static',
      pixKey: 'financeiro@example.com',
      referenceLabel: 'INV-2026-0001',
    });
    expect(parsed.merchantAccountTag).toBe('26');
    expect(parsed.merchantAccountFields).toEqual([
      { tag: '00', characterLength: 14, value: 'br.gov.bcb.pix' },
      { tag: '01', characterLength: 22, value: 'financeiro@example.com' },
      { tag: '02', characterLength: 16, value: 'FATURA 2026-0001' },
    ]);
    expect(parsed.fields.at(-1)).toMatchObject({ tag: '63', characterLength: 4 });
    expect(validatePixPayload(payload)).toEqual(parsed);
  });

  test('parses a deterministic dynamic payload without inventing an amount', () => {
    const parsed = parsePixPayload(buildDynamicPayload());

    expect(parsed.amountCents).toBeUndefined();
    expect(parsed).toMatchObject({
      payloadType: 'dynamic',
      dynamicUrl: 'pix.example.com/cob/8f3adf0c',
      referenceLabel: '***',
    });
    expect(parsed.merchantAccountFields).toContainEqual({
      tag: '25',
      characterLength: 28,
      value: 'pix.example.com/cob/8f3adf0c',
    });
  });

  test('rejects a payload whose content changed without a matching CRC', () => {
    const payload = buildStaticPayload();
    const corrupted = payload.replace('PDFWEAVE', 'QDFWEAVE');

    expect(() => parsePixPayload(corrupted)).toThrow(
      /^\[@pdfweave\/schemas\/boleto\] Pix payload CRC must be [0-9A-F]{4}$/,
    );
  });

  test('requires CRC tag 63 with length 04 to be last', () => {
    const body = buildDynamicPayload();
    const crcBeforeTrailingField = `${body}${tlv('64', 'x')}`;
    const wrongCrcLength = withCrc(tlv('00', '01')).replace('6304', '6303');

    expect(() => parsePixPayload(crcBeforeTrailingField)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload CRC must be the final tag 63 with length 04',
    );
    expect(() => parsePixPayload(wrongCrcLength)).toThrow('[@pdfweave/schemas/boleto]');
  });

  test('rejects malformed root and nested TLV lengths', () => {
    expect(() => parsePixPayload('0002015905abc')).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload root tag 59 declares 5 characters but only 3 remain',
    );

    const malformedMerchantAccount = tlv('26', '0014br.gov.bcb.pi');
    const payload = withCrc(
      tlv('00', '01') + malformedMerchantAccount + tlv('53', '986') + tlv('58', 'BR'),
    );
    expect(() => parsePixPayload(payload)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload merchant account tag 26 tag 00 declares 14 characters but only 13 remain',
    );
  });

  test.each([
    {
      name: 'Pix GUI',
      payload: withCrc(
        tlv('00', '01') +
          tlv('26', tlv('00', 'example.invalid')) +
          tlv('53', '986') +
          tlv('58', 'BR'),
      ),
      message: 'must contain merchant account information with GUI br.gov.bcb.pix',
    },
    {
      name: 'BRL currency',
      payload: buildStaticPayload({ currency: '840' }),
      message: 'transaction currency tag 53 must be 986',
    },
    {
      name: 'Brazil country code',
      payload: buildStaticPayload({ country: 'US' }),
      message: 'country code tag 58 must be BR',
    },
  ])('rejects a payload without the required $name contract', ({ payload, message }) => {
    expect(() => parsePixPayload(payload)).toThrow(
      `[@pdfweave/schemas/boleto] Pix payload ${message}`,
    );
  });

  test('accepts the Pix GUI using ASCII case-insensitive comparison', () => {
    const merchantAccount = tlv(
      '26',
      tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', 'financeiro@example.com'),
    );
    const parsed = parsePixPayload(buildPayload({ merchantAccount, initiationMethod: '11' }));

    expect(parsed.payloadType).toBe('static');
    expect(parsed.merchantAccountFields[0]?.value).toBe('BR.GOV.BCB.PIX');
  });

  test.each([
    { name: 'static', merchantAccount: staticMerchantAccount },
    { name: 'dynamic', merchantAccount: dynamicMerchantAccount },
  ])(
    'accepts an official $name payload with no optional initiation method',
    ({ name, merchantAccount }) => {
      const parsed = parsePixPayload(buildPayload({ merchantAccount }));

      expect(parsed.payloadType).toBe(name);
    },
  );

  test.each([
    {
      name: 'both a static key and a dynamic URL',
      merchantFields:
        tlv('00', 'br.gov.bcb.pix') +
        tlv('01', 'financeiro@example.com') +
        tlv('25', 'pix.example.com/cob/8f3adf0c'),
      message: 'must not contain both Pix key tag 01 and URL tag 25',
    },
    {
      name: 'neither a static key nor a dynamic URL',
      merchantFields: tlv('00', 'br.gov.bcb.pix') + tlv('02', 'FATURA 2026-0001'),
      message: 'must contain Pix key tag 01 or URL tag 25',
    },
  ])('rejects merchant data containing $name', ({ merchantFields, message }) => {
    const payload = buildPayload({
      merchantAccount: tlv('26', merchantFields),
      initiationMethod: '11',
    });

    expect(() => parsePixPayload(payload)).toThrow(
      `[@pdfweave/schemas/boleto] Pix payload merchant account information ${message}`,
    );
  });

  test.each([
    { name: 'static', field: tlv('01', ''), message: 'Pix key tag 01' },
    { name: 'dynamic', field: tlv('25', ''), message: 'URL tag 25' },
  ])('rejects an empty required $name merchant value', ({ name, field, message }) => {
    const payload = buildPayload({
      merchantAccount: tlv('26', tlv('00', 'br.gov.bcb.pix') + field),
      initiationMethod: name === 'static' ? '11' : '12',
    });

    expect(() => parsePixPayload(payload)).toThrow(
      `[@pdfweave/schemas/boleto] Pix payload merchant account ${message} must not be empty`,
    );
  });

  test('requires exactly one Pix merchant account information field', () => {
    const secondPixAccount = tlv(
      '27',
      tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', 'second@example.com'),
    );
    const payload = buildPayload({
      merchantAccount: staticMerchantAccount + secondPixAccount,
      initiationMethod: '11',
    });

    expect(() => parsePixPayload(payload)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload must contain exactly one merchant account information field with GUI br.gov.bcb.pix',
    );
  });

  test.each([
    { name: 'static', merchantAccount: staticMerchantAccount, method: '12', expected: '11' },
    { name: 'dynamic', merchantAccount: dynamicMerchantAccount, method: '11', expected: '12' },
  ])(
    'rejects point of initiation method inconsistent with a $name payload',
    ({ name, merchantAccount, method, expected }) => {
      const payload = buildPayload({ merchantAccount, initiationMethod: method });

      expect(() => parsePixPayload(payload)).toThrow(
        `[@pdfweave/schemas/boleto] Pix payload point of initiation method tag 01 must be ${expected} for a ${name} payload`,
      );
    },
  );

  test.each([
    { name: 'merchant category code', tag: '52' },
    { name: 'transaction currency', tag: '53' },
    { name: 'country code', tag: '58' },
    { name: 'merchant name', tag: '59' },
    { name: 'merchant city', tag: '60' },
    { name: 'additional data field', tag: '62' },
  ])('requires the complete root $name field', ({ name, tag }) => {
    const completeFields = [
      tlv('00', '01'),
      tlv('01', '11'),
      staticMerchantAccount,
      tlv('52', '0000'),
      tlv('53', '986'),
      tlv('58', 'BR'),
      tlv('59', 'PDFWEAVE LTDA'),
      tlv('60', 'SAO PAULO'),
      tlv('62', tlv('05', '***')),
    ];
    const payload = withCrc(completeFields.filter((field) => !field.startsWith(tag)).join(''));

    expect(() => parsePixPayload(payload)).toThrow(
      `[@pdfweave/schemas/boleto] Pix payload is missing ${name} tag ${tag}`,
    );
  });

  test('requires reference label tag 05 inside additional data tag 62', () => {
    const payload = buildPayload({
      merchantAccount: staticMerchantAccount,
      initiationMethod: '11',
      additionalData: tlv('01', 'CUSTOMER'),
    });

    expect(() => parsePixPayload(payload)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload is missing reference label tag 05',
    );
  });

  test('requires payload format indicator 00 to be 01', () => {
    const payload = withCrc(
      tlv('00', '02') + staticMerchantAccount + tlv('53', '986') + tlv('58', 'BR'),
    );
    expect(() => parsePixPayload(payload)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload payload format indicator tag 00 must be 01',
    );
  });

  test('uses Unicode character lengths while calculating CRC over UTF-8 bytes', () => {
    const payload = buildPayload({
      merchantAccount: staticMerchantAccount,
      initiationMethod: '11',
      merchantName: 'CAFÉ BRASIL',
    });
    const parsed = parsePixPayload(payload);

    expect(parsed.fields.find((field) => field.tag === '59')).toEqual({
      tag: '59',
      characterLength: 11,
      value: 'CAFÉ BRASIL',
    });

    expect(() => parsePixPayload('5905CAFÉ')).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload root tag 59 declares 5 characters but only 4 remain',
    );
  });

  test.each([
    ['0', 0],
    ['1', 100],
    ['1.2', 120],
    ['1.20', 120],
  ])('accepts EMV amount %s as exact integer cents', (amount, expectedCents) => {
    expect(parsePixPayload(buildStaticPayload({ amount })).amountCents).toBe(expectedCents);
  });

  test.each(['01.00', '1.', '1.234', '-1.00'])('rejects malformed amount %s', (amount) => {
    expect(() => parsePixPayload(buildStaticPayload({ amount }))).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload transaction amount tag 54 must be a non-negative decimal with at most two cents digits',
    );
  });

  test('separates the parser safety ceiling from QR print-density inspection', async () => {
    const densePayload = buildMaximumDensityPayload();
    expect(encoder.encode(densePayload)).toHaveLength(251);
    expect(parsePixPayload(densePayload)).toMatchObject({
      payloadType: 'static',
      pixKey: 'financeiro-longo-1234567@example.com',
    });
    await expect(inspectBoletoPixQrDensity(densePayload)).rejects.toThrow(
      'Pix payload requires a 61 x 61 QR symbol',
    );

    expect(BOLETO_PIX_PAYLOAD_MAX_CHARACTERS).toBe(499);
    expect(() => parsePixPayload('0'.repeat(500))).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload must contain at most 499 characters',
    );
  });

  test('rejects duplicate tags', () => {
    const duplicateCurrency = withCrc(
      tlv('00', '01') +
        staticMerchantAccount +
        tlv('53', '986') +
        tlv('53', '986') +
        tlv('58', 'BR'),
    );
    expect(() => parsePixPayload(duplicateCurrency)).toThrow(
      '[@pdfweave/schemas/boleto] Pix payload root contains duplicate tag 53',
    );
  });
});
