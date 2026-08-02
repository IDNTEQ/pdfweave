import type { Plugin } from '@pdfweave/common';
import { ReceiptText } from 'lucide';
import { DEFAULT_OPACITY } from '../constants.js';
import { createSvgStr } from '../utils.js';
import { buildBoletoBarcode } from './digits.js';
import { pdfRender } from './pdfRender.js';
import type { BoletoSchema } from './schema.js';
import type { BoletoData } from './types.js';
import { uiRender } from './uiRender.js';

const defaultDueDate = '2026-08-31';
const defaultAmountCents = 12_345;
const defaultBarcode = buildBoletoBarcode({
  institutionCode: '001',
  dueDate: defaultDueDate,
  amountMode: 'fixed',
  documentValueCents: defaultAmountCents,
  freeField: '1234567890123456789012345',
});

const defaultData: BoletoData = {
  version: 1,
  kind: 'cobranca',
  registrationStatus: 'test',
  institution: { name: 'Banco de Teste', code: '001', codeDigit: '9' },
  beneficiaryMode: 'direct',
  beneficiary: {
    name: 'Empresa de Exemplo Ltda.',
    taxId: { type: 'cnpj', number: '11.222.333/0001-81' },
    address: {
      street: 'Avenida Paulista',
      number: '1000',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
    },
  },
  payer: {
    name: 'Cliente de Exemplo',
    taxId: { type: 'cpf', number: '529.982.247-25' },
    address: {
      street: 'Rua das Flores',
      number: '100',
      district: 'Centro',
      city: 'Curitiba',
      state: 'PR',
      postalCode: '80010-000',
    },
  },
  paymentLocation: 'Pagável em qualquer banco até o vencimento',
  dueDate: defaultDueDate,
  barcode: defaultBarcode,
  amountMode: 'fixed',
  documentValueCents: defaultAmountCents,
  agencyBeneficiaryCode: '1234 / 56789-0',
  documentDate: '2026-08-01',
  documentNumber: 'DOC-0001',
  documentSpecies: 'DM',
  acceptance: 'N',
  processingDate: '2026-08-01',
  ourNumber: '12345678901-2',
  portfolio: '17',
  instructions: ['Documento de demonstração sem valor de pagamento.'],
};

/**
 * Composite output-only boleto renderer. Supply the complete BoletoData object as JSON or through
 * data binding; the Form intentionally does not edit individual legal or payment fields.
 */
const boleto: Plugin<BoletoSchema> = {
  pdf: pdfRender,
  ui: uiRender,
  propPanel: {
    schema: {},
    defaultSchema: {
      name: 'boleto',
      type: 'boleto',
      variant: 'ficha-compensacao',
      content: JSON.stringify(defaultData),
      position: { x: 0, y: 0 },
      width: 200,
      height: 95,
      rotate: 0,
      opacity: DEFAULT_OPACITY,
      // The outer field must remain input-bound; uiRender forces every child into viewer mode.
      readOnly: false,
      required: true,
    },
  },
  icon: createSvgStr(ReceiptText),
};

export default boleto;
