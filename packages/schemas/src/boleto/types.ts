export const BOLETO_DATA_VERSION = 1 as const;
export const BOLETO_ERROR_PREFIX = '[@pdfweave/schemas/boleto]' as const;

export type BoletoKind = 'cobranca';
export type BoletoRegistrationStatus = 'registered' | 'test';
export type BoletoTestPaymentIdentifiers = 'redact' | 'render';
export type BoletoBeneficiaryMode = 'direct' | 'third-party';
export type BoletoAmountMode = 'fixed' | 'variable';
export type BrazilianTaxIdType = 'cpf' | 'cnpj';

export interface BrazilianTaxId {
  type: BrazilianTaxIdType;
  number: string;
}

export interface BrazilianAddress {
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface BoletoPartyIdentity {
  name: string;
  taxId: BrazilianTaxId;
}

export interface BoletoParty extends BoletoPartyIdentity {
  address: BrazilianAddress;
}

export interface BoletoInstitution {
  name: string;
  code: string;
  codeDigit: string;
  logo?: string;
}

export interface BoletoPixData {
  /** Complete Pix Copia e Cola / BR Code payload returned by the issuing bank or PSP. */
  emvPayload: string;
  /** Explicit because QR placement on the ficha de compensacao is issuer-profile-specific. */
  placement: 'instructions-right';
}

export interface BoletoBaseData {
  version: typeof BOLETO_DATA_VERSION;
  kind: BoletoKind;
  registrationStatus: BoletoRegistrationStatus;
  /** Test records redact payment identifiers unless rendering is explicitly requested. */
  testPaymentIdentifiers?: BoletoTestPaymentIdentifiers;
  institution: BoletoInstitution;
  beneficiaryMode: BoletoBeneficiaryMode;
  beneficiary: BoletoParty;
  finalBeneficiary?: BoletoPartyIdentity;
  payer: BoletoParty;
  paymentLocation: string;
  dueDate: string;
  barcode: string;
  digitableLine?: string;
  agencyBeneficiaryCode?: string;
  documentDate?: string;
  documentNumber?: string;
  documentSpecies?: string;
  acceptance?: 'A' | 'N';
  processingDate?: string;
  ourNumber?: string;
  bankUse?: string;
  portfolio?: string;
  currencyQuantity?: string;
  currencyUnitValueCents?: number;
  instructions?: string[];
  pix?: BoletoPixData;
}

export interface FixedAmountBoletoData extends BoletoBaseData {
  amountMode: 'fixed';
  documentValueCents: number;
  discountDeductionCents?: number;
  interestPenaltyCents?: number;
  chargedAmountCents?: number;
}

export interface VariableAmountBoletoData extends BoletoBaseData {
  amountMode: 'variable';
  documentValueCents?: number;
}

export type BoletoData = FixedAmountBoletoData | VariableAmountBoletoData;

export interface BuildBoletoBarcodeInput {
  institutionCode: string;
  dueDate: string;
  amountMode: BoletoAmountMode;
  documentValueCents?: number;
  freeField: string;
}
