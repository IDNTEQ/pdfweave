import multiVariableText from './multiVariableText/index.js';
import text from './text/index.js';
import image from './graphics/image.js';
import signature from './graphics/signature.js';
import svg from './graphics/svg.js';
import barcodes from './barcodes/index.js';
import line from './shapes/line.js';
import table from './tables/index.js';
import { rectangle, ellipse } from './shapes/rectAndEllipse.js';
import dateTime from './date/dateTime.js';
import date from './date/date.js';
import time from './date/time.js';
import select from './select/index.js';
import radioGroup from './radioGroup/index.js';
import checkbox from './checkbox/index.js';
import link from './link/index.js';
import boleto from './boleto/index.js';
export { builtInPlugins } from './builtins.js';

export {
  // schemas
  text,
  multiVariableText,
  image,
  signature,
  svg,
  table,
  barcodes,
  line,
  rectangle,
  ellipse,
  dateTime,
  date,
  time,
  select,
  radioGroup,
  checkbox,
  link,
  boleto,
};

// Export utility functions
export { getDynamicHeightsForTable } from './tables.js';
export type { DynamicTableArgs } from './tables.js';

export {
  BOLETO_DATA_VERSION,
  BOLETO_ERROR_PREFIX,
  BOLETO_BARCODE_WIDTH_MM,
  BOLETO_BARCODE_HEIGHT_MM,
  BOLETO_BARCODE_LEFT_MM,
  BOLETO_BARCODE_CENTER_FROM_BOTTOM_MM,
  BOLETO_PIX_QR_SIZE_MM,
  BOLETO_PIX_QR_GAP_MM,
  BOLETO_PIX_PAYLOAD_MAX_CHARACTERS,
  BOLETO_PIX_QR_MAX_MODULES,
  BOLETO_PIX_QR_MIN_DOTS_PER_MODULE,
  BOLETO_PIX_QR_MIN_PRINT_DPI,
  BOLETO_FICHA_MIN_WIDTH_MM,
  BOLETO_FICHA_MAX_WIDTH_MM,
  BOLETO_FICHA_MIN_HEIGHT_MM,
  BOLETO_FICHA_MAX_HEIGHT_MM,
  calculateDueDateFactor,
  calculateModulo10FieldDigit,
  calculateModulo11GeneralDigit,
  validateBoletoBarcode,
  deriveDigitableLine,
  normalizeDigitableLine,
  digitableLineToBarcode,
  formatDigitableLine,
  buildBoletoBarcode,
  inspectBoletoPixQrDensity,
  validateBoletoSchema,
  BoletoDataSchema,
  parseBoletoData,
  isBoletoData,
  parsePixPayload,
  validatePixPayload,
} from './boleto.js';
export type {
  BoletoAmountMode,
  BoletoBaseData,
  BoletoBeneficiaryMode,
  BoletoData,
  BoletoInstitution,
  BoletoKind,
  BoletoParty,
  BoletoPartyIdentity,
  BoletoPixData,
  BoletoPixQrMetrics,
  BoletoRegistrationStatus,
  BoletoTestPaymentIdentifiers,
  BoletoSchema,
  BrazilianAddress,
  BrazilianTaxId,
  BrazilianTaxIdType,
  BuildBoletoBarcodeInput,
  FixedAmountBoletoData,
  VariableAmountBoletoData,
  ParsedPixPayload,
  PixTlvField,
} from './boleto.js';
