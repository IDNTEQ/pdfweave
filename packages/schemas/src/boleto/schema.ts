import type { Schema } from '@pdfweave/common';

export const BOLETO_FICHA_MIN_WIDTH_MM = 170;
export const BOLETO_FICHA_MAX_WIDTH_MM = 216;
export const BOLETO_FICHA_MIN_HEIGHT_MM = 95;
export const BOLETO_FICHA_MAX_HEIGHT_MM = 108;

export type BoletoSchema = Schema & {
  type: 'boleto';
  variant: 'ficha-compensacao';
};

export interface BoletoSchemaValidationOptions {
  /** Generator-adjusted PDF positions may be negative when page boxes have nonzero origins. */
  allowInternalPosition?: boolean;
}

const isZeroRotation = (rotation: number | undefined): boolean => {
  if (rotation === undefined) return true;
  return ((rotation % 360) + 360) % 360 === 0;
};

export const validateBoletoSchema = (
  schema: BoletoSchema,
  options: BoletoSchemaValidationOptions = {},
): void => {
  if (schema.variant !== 'ficha-compensacao') {
    throw new Error('[@pdfweave/schemas/boleto] Unsupported boleto layout variant');
  }
  if (
    !Number.isFinite(schema.width) ||
    schema.width < BOLETO_FICHA_MIN_WIDTH_MM ||
    schema.width > BOLETO_FICHA_MAX_WIDTH_MM
  ) {
    throw new Error(
      `[@pdfweave/schemas/boleto] Ficha width must be between ${String(BOLETO_FICHA_MIN_WIDTH_MM)} and ${String(BOLETO_FICHA_MAX_WIDTH_MM)} mm`,
    );
  }
  if (
    !Number.isFinite(schema.height) ||
    schema.height < BOLETO_FICHA_MIN_HEIGHT_MM ||
    schema.height > BOLETO_FICHA_MAX_HEIGHT_MM
  ) {
    throw new Error(
      `[@pdfweave/schemas/boleto] Ficha height must be between ${String(BOLETO_FICHA_MIN_HEIGHT_MM)} and ${String(BOLETO_FICHA_MAX_HEIGHT_MM)} mm`,
    );
  }
  if (!isZeroRotation(schema.rotate)) {
    throw new Error('[@pdfweave/schemas/boleto] Ficha rotation must be zero');
  }
  if (schema.opacity !== undefined && schema.opacity !== 1) {
    throw new Error('[@pdfweave/schemas/boleto] Ficha opacity must be 1');
  }
  if (
    !Number.isFinite(schema.position.x) ||
    (!options.allowInternalPosition && schema.position.x < 0)
  ) {
    throw new Error('[@pdfweave/schemas/boleto] Ficha x position must be non-negative');
  }
  if (
    !Number.isFinite(schema.position.y) ||
    (!options.allowInternalPosition && schema.position.y < 0)
  ) {
    throw new Error('[@pdfweave/schemas/boleto] Ficha y position must be non-negative');
  }
};
