import { buildBoletoBarcode, calculateModulo11GeneralDigit } from '../src/boleto/digits.js';
import {
  BOLETO_LOGO_MAX_DATA_URI_LENGTH,
  isBoletoData,
  parseBoletoData,
} from '../src/boleto/validation.js';
import type { BoletoData, BoletoParty, BoletoPartyIdentity } from '../src/boleto/types.js';

const ITAU_BARCODE = '34196166700000123451101234567880057123457000';
const ITAU_FORMATTED_LINE = '34191.10121 34567.880058 71234.570001 6 16670000012345';
const DYNAMIC_PIX_PAYLOAD =
  '00020101021226480014br.gov.bcb.pix2526pix.example.test/cobv/00015204000053039865802BR5913PDFWEAVE LTDA6009SAO PAULO62070503***6304160F';
const DYNAMIC_PIX_WITH_IGNORED_AMOUNT_PAYLOAD =
  '00020101021226480014br.gov.bcb.pix2526pix.example.test/cobv/00015204000053039865406999.995802BR5913PDFWEAVE LTDA6009SAO PAULO62070503***63049B6B';
const FIXED_PIX_PAYLOAD =
  '00020101021126440014br.gov.bcb.pix0122financeiro@example.com5204000053039865406123.455802BR5913PDFWEAVE LTDA6009SAO PAULO62090505INV-16304F52B';

const beneficiary: BoletoParty = {
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
};

const payer: BoletoParty = {
  name: 'Maria da Silva',
  taxId: { type: 'cpf', number: '529.982.247-25' },
  address: {
    street: 'Rua das Flores',
    number: '42',
    city: 'Curitiba',
    state: 'PR',
    postalCode: '80000-000',
  },
};

const createValidBoleto = (): BoletoData => ({
  version: 1,
  kind: 'cobranca',
  registrationStatus: 'test',
  institution: {
    name: 'Itau Unibanco S.A.',
    code: '341',
    codeDigit: '7',
  },
  beneficiaryMode: 'direct',
  beneficiary,
  payer,
  paymentLocation: 'Pagavel em qualquer banco ate o vencimento.',
  dueDate: '2026-12-21',
  amountMode: 'fixed',
  documentValueCents: 12_345,
  barcode: ITAU_BARCODE,
  digitableLine: ITAU_FORMATTED_LINE,
});

const buildBarcodeWithFactor = (
  institutionCode: string,
  factor: string,
  amountCents: number,
): string => {
  const barcodeWithoutGeneralDigit =
    `${institutionCode}9${factor}${String(amountCents).padStart(10, '0')}` + ITAU_BARCODE.slice(19);
  const generalDigit = calculateModulo11GeneralDigit(barcodeWithoutGeneralDigit);
  return (
    `${barcodeWithoutGeneralDigit.slice(0, 4)}${String(generalDigit)}` +
    barcodeWithoutGeneralDigit.slice(4)
  );
};

describe('boleto structured data validation', () => {
  test('parses a valid object and JSON string without mutating the source', () => {
    const input = createValidBoleto();
    const snapshot = structuredClone(input);

    expect(parseBoletoData(input)).toEqual(input);
    expect(parseBoletoData(JSON.stringify(input))).toEqual(input);
    expect(input).toEqual(snapshot);
    expect(isBoletoData(input)).toBe(true);
    expect(isBoletoData(JSON.stringify(input))).toBe(false);
  });

  test('accepts the Annex III optional fields and a cached data-URI logo', () => {
    const input: BoletoData = {
      ...createValidBoleto(),
      institution: {
        ...createValidBoleto().institution,
        logo: 'data:image/png;base64,iVBORw0KGgo=',
      },
      agencyBeneficiaryCode: '1234/56789-0',
      documentDate: '2026-12-01',
      documentNumber: 'INV-2026-001',
      documentSpecies: 'DM',
      acceptance: 'N',
      processingDate: '2026-12-02',
      ourNumber: '12345678-9',
      bankUse: 'USO DO BANCO',
      portfolio: '109',
      currencyQuantity: '1',
      currencyUnitValueCents: 12_345,
      instructions: ['Nao receber apos 30 dias do vencimento.'],
      discountDeductionCents: 125,
      interestPenaltyCents: 50,
      chargedAmountCents: 12_270,
    };

    expect(parseBoletoData(input)).toEqual(input);
  });

  test('supports explicit test identifier rendering without weakening registered data', () => {
    const visibleTest: BoletoData = {
      ...createValidBoleto(),
      testPaymentIdentifiers: 'render',
    };
    expect(parseBoletoData(visibleTest)).toEqual(visibleTest);

    expect(() =>
      parseBoletoData({
        ...visibleTest,
        registrationStatus: 'registered',
      }),
    ).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at testPaymentIdentifiers: must be omitted when registrationStatus is registered',
    );
  });

  test('accepts validated Pix payloads and reconciles an encoded amount', () => {
    const dynamic: BoletoData = {
      ...createValidBoleto(),
      testPaymentIdentifiers: 'render',
      pix: { emvPayload: DYNAMIC_PIX_PAYLOAD, placement: 'instructions-right' },
    };
    const fixed: BoletoData = {
      ...createValidBoleto(),
      testPaymentIdentifiers: 'render',
      pix: { emvPayload: FIXED_PIX_PAYLOAD, placement: 'instructions-right' },
    };

    expect(parseBoletoData(dynamic)).toEqual(dynamic);
    expect(parseBoletoData(fixed)).toEqual(fixed);
    expect(
      parseBoletoData({
        ...dynamic,
        pix: {
          ...dynamic.pix!,
          emvPayload: DYNAMIC_PIX_WITH_IGNORED_AMOUNT_PAYLOAD,
        },
      }),
    ).toMatchObject({ pix: { emvPayload: DYNAMIC_PIX_WITH_IGNORED_AMOUNT_PAYLOAD } });
    expect(() =>
      parseBoletoData({
        ...dynamic,
        testPaymentIdentifiers: undefined,
      }),
    ).toThrow(
      'Invalid boleto data at testPaymentIdentifiers: must be render when a test boleto includes a Pix payload',
    );
    expect(() =>
      parseBoletoData({
        ...fixed,
        pix: { ...fixed.pix!, emvPayload: `${FIXED_PIX_PAYLOAD.slice(0, -1)}0` },
      }),
    ).toThrow('Invalid boleto data at pix.emvPayload: Pix payload CRC');
    expect(() =>
      parseBoletoData({
        ...fixed,
        documentValueCents: 12_346,
      }),
    ).toThrow(
      'Invalid boleto data at pix.emvPayload: transaction amount 12345 does not match documentValueCents',
    );
  });

  test('requires fixed-amount adjustments to reconcile exactly', () => {
    expect(
      parseBoletoData({
        ...createValidBoleto(),
        discountDeductionCents: 125,
        interestPenaltyCents: 50,
        chargedAmountCents: 12_270,
      }).chargedAmountCents,
    ).toBe(12_270);

    expect(() => parseBoletoData({ ...createValidBoleto(), discountDeductionCents: 125 })).toThrow(
      'Invalid boleto data at chargedAmountCents: is required',
    );
    expect(() => parseBoletoData({ ...createValidBoleto(), interestPenaltyCents: 50 })).toThrow(
      'Invalid boleto data at chargedAmountCents: is required',
    );
    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        discountDeductionCents: 125,
        interestPenaltyCents: 50,
        chargedAmountCents: 12_280,
      }),
    ).toThrow('Invalid boleto data at chargedAmountCents: must equal');
  });

  test('rejects impossible fixed-amount adjustment totals', () => {
    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        discountDeductionCents: 12_346,
        chargedAmountCents: 0,
      }),
    ).toThrow(
      'Invalid boleto data at chargedAmountCents: calculated charged amount must not be negative',
    );

    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        interestPenaltyCents: 9_999_987_655,
        chargedAmountCents: 9_999_999_999,
      }),
    ).toThrow(
      'Invalid boleto data at chargedAmountCents: calculated charged amount must not exceed',
    );
  });

  test('accepts chargedAmountCents alone only when it equals the document value', () => {
    expect(
      parseBoletoData({ ...createValidBoleto(), chargedAmountCents: 12_345 }).chargedAmountCents,
    ).toBe(12_345);
    expect(() => parseBoletoData({ ...createValidBoleto(), chargedAmountCents: 12_344 })).toThrow(
      'Invalid boleto data at chargedAmountCents: must equal',
    );
  });

  test.each(['discountDeductionCents', 'interestPenaltyCents', 'chargedAmountCents'] as const)(
    'rejects %s for variable-amount boletos',
    (field) => {
      const variable = {
        ...createValidBoleto(),
        amountMode: 'variable',
        documentValueCents: undefined,
        barcode: buildBarcodeWithFactor('341', '1667', 0),
        digitableLine: undefined,
        [field]: 0,
      };

      expect(() => parseBoletoData(variable)).toThrow(
        'Invalid boleto data at data: Unrecognized key',
      );
    },
  );

  test('requires a final beneficiary for third-party collection', () => {
    const missing = { ...createValidBoleto(), beneficiaryMode: 'third-party' } as const;
    expect(() => parseBoletoData(missing)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at finalBeneficiary: is required',
    );

    const finalBeneficiary: BoletoPartyIdentity = {
      name: beneficiary.name,
      taxId: beneficiary.taxId,
    };
    const complete = { ...missing, finalBeneficiary };
    expect(parseBoletoData(complete).finalBeneficiary).toEqual(finalBeneficiary);

    expect(() => parseBoletoData({ ...complete, beneficiaryMode: 'direct' })).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at finalBeneficiary: must be omitted',
    );
    expect(() => parseBoletoData({ ...complete, finalBeneficiary: beneficiary })).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at finalBeneficiary: Unrecognized key',
    );
  });

  test.each([
    ['formatted payer and unformatted final beneficiary', '529.982.247-25', '52998224725'],
    ['unformatted payer and formatted final beneficiary', '52998224725', '529.982.247-25'],
  ])(
    'rejects the same normalized payer and final-beneficiary tax ID with %s',
    (_case, payerTaxId, finalBeneficiaryTaxId) => {
      const input: BoletoData = {
        ...createValidBoleto(),
        beneficiaryMode: 'third-party',
        payer: {
          ...payer,
          taxId: { type: 'cpf', number: payerTaxId },
        },
        finalBeneficiary: {
          name: 'Maria da Silva',
          taxId: { type: 'cpf', number: finalBeneficiaryTaxId },
        },
      };

      expect(() => parseBoletoData(input)).toThrow(
        '[@pdfweave/schemas/boleto] Invalid boleto data at finalBeneficiary.taxId.number: must differ from payer taxId when beneficiaryMode is third-party',
      );
    },
  );

  test('validates CPF, numeric and alphanumeric CNPJ, CEP, and real ISO dates', () => {
    const officialManualCnpj = structuredClone(createValidBoleto());
    officialManualCnpj.beneficiary.taxId.number = '12.ABC.345/01DE-35';
    expect(parseBoletoData(officialManualCnpj).beneficiary.taxId.number).toBe('12.ABC.345/01DE-35');

    const unformattedOfficialCnpj = structuredClone(createValidBoleto());
    unformattedOfficialCnpj.beneficiary.taxId.number = '12ABC34501DE35';
    expect(parseBoletoData(unformattedOfficialCnpj).beneficiary.taxId.number).toBe(
      '12ABC34501DE35',
    );

    const officialSimulatorCnpj = structuredClone(createValidBoleto());
    officialSimulatorCnpj.beneficiary.taxId.number = '6Z.C16.LHY/0001-66';
    expect(parseBoletoData(officialSimulatorCnpj).beneficiary.taxId.number).toBe(
      '6Z.C16.LHY/0001-66',
    );

    const invalidCpf = structuredClone(createValidBoleto());
    invalidCpf.payer.taxId.number = '529.982.247-24';
    expect(() => parseBoletoData(invalidCpf)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at payer.taxId.number',
    );

    const invalidCnpj = structuredClone(createValidBoleto());
    invalidCnpj.beneficiary.taxId.number = '04.252.011/0001-11';
    expect(() => parseBoletoData(invalidCnpj)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at beneficiary.taxId.number',
    );

    const lowercaseCnpj = structuredClone(createValidBoleto());
    lowercaseCnpj.beneficiary.taxId.number = '12.Abc.345/01DE-35';
    expect(() => parseBoletoData(lowercaseCnpj)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at beneficiary.taxId.number',
    );

    const invalidAlphanumericCnpj = structuredClone(createValidBoleto());
    invalidAlphanumericCnpj.beneficiary.taxId.number = '12.ABC.345/01DE-36';
    expect(() => parseBoletoData(invalidAlphanumericCnpj)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at beneficiary.taxId.number',
    );

    const invalidDate = structuredClone(createValidBoleto());
    invalidDate.documentDate = '2026-02-30';
    expect(() => parseBoletoData(invalidDate)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at documentDate',
    );
  });

  test('cross-checks institution, due factor, fixed amount, and supplied line', () => {
    const wrongInstitution = structuredClone(createValidBoleto());
    wrongInstitution.institution.code = '104';
    expect(() => parseBoletoData(wrongInstitution)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at barcode: institution code does not match',
    );

    const unsupportedIspb = structuredClone(createValidBoleto());
    unsupportedIspb.institution.code = '988';
    expect(() => parseBoletoData(unsupportedIspb)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at institution.code: institution code 988',
    );

    const wrongDueDate = structuredClone(createValidBoleto());
    wrongDueDate.dueDate = '2026-12-22';
    expect(() => parseBoletoData(wrongDueDate)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at dueDate: does not match',
    );

    const wrongAmount = structuredClone(createValidBoleto());
    wrongAmount.documentValueCents = 12_346;
    expect(() => parseBoletoData(wrongAmount)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at documentValueCents: does not match',
    );

    const wrongLine = structuredClone(createValidBoleto());
    wrongLine.digitableLine = '34191.10122 34567.880058 71234.570001 6 16670000012345';
    expect(() => parseBoletoData(wrongLine)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at digitableLine',
    );
  });

  test('supports verified institution display suffixes, including uppercase X', () => {
    const sicrediBarcode = buildBoletoBarcode({
      institutionCode: '748',
      dueDate: '2026-12-21',
      amountMode: 'fixed',
      documentValueCents: 12_345,
      freeField: ITAU_BARCODE.slice(19),
    });
    const sicredi: BoletoData = {
      ...createValidBoleto(),
      institution: { name: 'Banco Cooperativo Sicredi S.A.', code: '748', codeDigit: 'X' },
      barcode: sicrediBarcode,
      digitableLine: undefined,
    };
    expect(parseBoletoData(sicredi)).toEqual(sicredi);

    expect(() =>
      parseBoletoData({
        ...sicredi,
        institution: { ...sicredi.institution, codeDigit: '0' },
      }),
    ).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at institution.codeDigit: institution codeDigit for 748 must be X',
    );

    const caixa: BoletoData = {
      ...createValidBoleto(),
      institution: { name: 'Caixa Economica Federal', code: '104', codeDigit: '0' },
      barcode: buildBoletoBarcode({
        institutionCode: '104',
        dueDate: '2026-12-21',
        amountMode: 'fixed',
        documentValueCents: 12_345,
        freeField: ITAU_BARCODE.slice(19),
      }),
      digitableLine: undefined,
    };
    expect(parseBoletoData(caixa)).toEqual(caixa);
  });

  test('accepts factor 0000 as no encoded due-date factor but still requires a printed date', () => {
    const noEncodedFactor: BoletoData = {
      ...createValidBoleto(),
      dueDate: '2099-12-31',
      barcode: buildBarcodeWithFactor('341', '0000', 12_345),
      digitableLine: undefined,
    };
    expect(parseBoletoData(noEncodedFactor)).toEqual(noEncodedFactor);

    const withoutPrintedDueDate = { ...noEncodedFactor } as Record<string, unknown>;
    delete withoutPrintedDueDate.dueDate;
    expect(() => parseBoletoData(withoutPrintedDueDate)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at dueDate',
    );
  });

  test('supports variable amounts only when the barcode amount field is zero', () => {
    const variableBarcode = buildBoletoBarcode({
      institutionCode: '341',
      dueDate: '2026-12-21',
      amountMode: 'variable',
      freeField: ITAU_BARCODE.slice(19),
    });
    const variable: BoletoData = {
      ...createValidBoleto(),
      amountMode: 'variable',
      documentValueCents: 20_000,
      barcode: variableBarcode,
      digitableLine: undefined,
    };

    expect(parseBoletoData(variable)).toEqual(variable);

    const invalid: BoletoData = {
      ...createValidBoleto(),
      amountMode: 'variable',
      documentValueCents: undefined,
    };
    expect(() => parseBoletoData(invalid)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at barcode: variable amount barcodes',
    );
  });

  test('rejects remote logos, unknown fields, malformed JSON, and missing barcodes', () => {
    const remoteLogo = structuredClone(createValidBoleto());
    remoteLogo.institution.logo = 'https://example.com/logo.png';
    expect(() => parseBoletoData(remoteLogo)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at institution.logo',
    );

    expect(() => parseBoletoData({ ...createValidBoleto(), unexpected: true })).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at data',
    );
    expect(() => parseBoletoData('{bad json')).toThrow(
      '[@pdfweave/schemas/boleto] boleto data must be an object or valid JSON',
    );

    const missingBarcode = { ...createValidBoleto() } as Record<string, unknown>;
    delete missingBarcode.barcode;
    expect(() => parseBoletoData(missingBarcode)).toThrow(
      '[@pdfweave/schemas/boleto] Invalid boleto data at barcode',
    );
  });

  test('bounds institution logo data URIs at the nearest valid base64 lengths', () => {
    const prefix = 'data:image/png;base64,';
    const maximumPayloadLength =
      BOLETO_LOGO_MAX_DATA_URI_LENGTH -
      prefix.length -
      ((BOLETO_LOGO_MAX_DATA_URI_LENGTH - prefix.length) % 4);
    const acceptedLogo = `${prefix}${'A'.repeat(maximumPayloadLength)}`;
    const rejectedLogo = `${acceptedLogo}AAAA`;

    expect(acceptedLogo.length).toBeLessThanOrEqual(BOLETO_LOGO_MAX_DATA_URI_LENGTH);
    expect(rejectedLogo.length).toBeGreaterThan(BOLETO_LOGO_MAX_DATA_URI_LENGTH);
    expect(
      parseBoletoData({
        ...createValidBoleto(),
        institution: { ...createValidBoleto().institution, logo: acceptedLogo },
      }).institution.logo,
    ).toBe(acceptedLogo);
    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        institution: { ...createValidBoleto().institution, logo: rejectedLogo },
      }),
    ).toThrow('[@pdfweave/schemas/boleto] Invalid boleto data at institution.logo');
  });

  test('accepts three maximum-length instruction lanes with and without Pix', () => {
    const instructions = Array.from(
      { length: 3 },
      (_, index) => `${String(index + 1)}${'W'.repeat(179)}`,
    );
    const withoutPix: BoletoData = { ...createValidBoleto(), instructions };
    const withPix: BoletoData = {
      ...withoutPix,
      testPaymentIdentifiers: 'render',
      pix: { emvPayload: DYNAMIC_PIX_PAYLOAD, placement: 'instructions-right' },
    };

    expect(parseBoletoData(withoutPix).instructions).toEqual(instructions);
    expect(parseBoletoData(withPix).instructions).toEqual(instructions);
  });

  test('rejects free text that exceeds conservative rendering limits', () => {
    expect(() =>
      parseBoletoData({ ...createValidBoleto(), paymentLocation: 'P'.repeat(181) }),
    ).toThrow('[@pdfweave/schemas/boleto] Invalid boleto data at paymentLocation');

    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        instructions: Array.from({ length: 4 }, () => 'Instrucao'),
      }),
    ).toThrow('[@pdfweave/schemas/boleto] Invalid boleto data at instructions');

    expect(() =>
      parseBoletoData({
        ...createValidBoleto(),
        instructions: ['I'.repeat(181)],
      }),
    ).toThrow('[@pdfweave/schemas/boleto] Invalid boleto data at instructions.0');
  });
});
