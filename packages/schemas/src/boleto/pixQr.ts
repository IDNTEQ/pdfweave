import { getQrCodeModuleCount } from '../barcodes/helper.js';
import { BOLETO_PIX_QR_SIZE_MM } from './layout.js';
import { BOLETO_PIX_QR_PADDING_POINTS } from './pix.js';
import { BOLETO_ERROR_PREFIX } from './types.js';

export const BOLETO_PIX_QR_MAX_MODULES = 49;
export const BOLETO_PIX_QR_MIN_PRINT_DPI = 300;
export const BOLETO_PIX_QR_MIN_DOTS_PER_MODULE = 4;

export interface BoletoPixQrMetrics {
  moduleCount: number;
  moduleSizeMillimeters: number;
  dotsPerModuleAtMinimumDpi: number;
}

const POINTS_PER_INCH = 72;
const MILLIMETERS_PER_INCH = 25.4;

const getModuleSizeMillimeters = (moduleCount: number): number => {
  const requestedInkWidthPoints = (BOLETO_PIX_QR_SIZE_MM * POINTS_PER_INCH) / MILLIMETERS_PER_INCH;
  const inkFraction =
    requestedInkWidthPoints / (requestedInkWidthPoints + BOLETO_PIX_QR_PADDING_POINTS * 2);
  return (BOLETO_PIX_QR_SIZE_MM * inkFraction) / moduleCount;
};

/** Measures the encoded EC-M symbol and rejects density unsuitable for the fixed print box. */
export const inspectBoletoPixQrDensity = async (payload: string): Promise<BoletoPixQrMetrics> => {
  const moduleCount = await getQrCodeModuleCount(payload, 'M');
  if (moduleCount > BOLETO_PIX_QR_MAX_MODULES) {
    throw new Error(
      `${BOLETO_ERROR_PREFIX} Pix payload requires a ${String(moduleCount)} x ${String(moduleCount)} QR symbol; the fixed ${String(BOLETO_PIX_QR_SIZE_MM)} mm placement supports at most ${String(BOLETO_PIX_QR_MAX_MODULES)} x ${String(BOLETO_PIX_QR_MAX_MODULES)} modules at ${String(BOLETO_PIX_QR_MIN_PRINT_DPI)} DPI`,
    );
  }

  const moduleSizeMillimeters = getModuleSizeMillimeters(moduleCount);
  const dotsPerModuleAtMinimumDpi =
    (moduleSizeMillimeters * BOLETO_PIX_QR_MIN_PRINT_DPI) / MILLIMETERS_PER_INCH;
  if (dotsPerModuleAtMinimumDpi < BOLETO_PIX_QR_MIN_DOTS_PER_MODULE) {
    throw new Error(
      `${BOLETO_ERROR_PREFIX} Pix QR module size falls below ${String(BOLETO_PIX_QR_MIN_DOTS_PER_MODULE)} printer dots at ${String(BOLETO_PIX_QR_MIN_PRINT_DPI)} DPI`,
    );
  }

  return { moduleCount, moduleSizeMillimeters, dotsPerModuleAtMinimumDpi };
};
