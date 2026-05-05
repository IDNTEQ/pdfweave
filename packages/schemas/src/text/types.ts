import type { Schema } from '@pdfweave/common';
import type { Font as FontKitFont } from 'fontkit';

export type ALIGNMENT = 'left' | 'center' | 'right' | 'justify';
export type VERTICAL_ALIGNMENT = 'top' | 'middle' | 'bottom';
export type DYNAMIC_FONT_SIZE_FIT = 'horizontal' | 'vertical';
export type TEXT_FORMAT = 'plain' | 'inline-markdown';
export type FONT_VARIANT_FALLBACK = 'synthetic' | 'plain' | 'error';

export type FontVariants = {
  bold?: string;
  italic?: string;
  boldItalic?: string;
  code?: string;
};

export type RichTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

export type FontWidthCalcValues = {
  font: FontKitFont;
  fontSize: number;
  characterSpacing: number;
  boxWidthInPt: number;
};

/**
 * CSS-equivalent `text-transform` values applied at render time only — the
 * schema's stored `content` is unchanged. See `applyTextTransform` for the
 * exact per-mode semantics. pdfme/pdfme#707.
 */
export type TEXT_TRANSFORM = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

export type TextSchema = Schema & {
  fontName?: string;
  textFormat?: TEXT_FORMAT;
  fontVariants?: FontVariants;
  fontVariantFallback?: FONT_VARIANT_FALLBACK;
  alignment: ALIGNMENT;
  verticalAlignment: VERTICAL_ALIGNMENT;
  fontSize: number;
  lineHeight: number;
  strikethrough?: boolean;
  underline?: boolean;
  characterSpacing: number;
  dynamicFontSize?: {
    min: number;
    max: number;
    fit: DYNAMIC_FONT_SIZE_FIT;
  };
  fontColor: string;
  backgroundColor: string;
  /** See `TEXT_TRANSFORM` JSDoc. Default: `'none'`. pdfme/pdfme#707. */
  textTransform?: TEXT_TRANSFORM;
};
