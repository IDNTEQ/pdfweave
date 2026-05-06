import type { Schema, TextLineRange, TextOverflow } from '@pdfweave/common';
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
export type TEXT_TRANSFORM = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

/**
 * Optional inner padding for a text schema (mm).
 *
 * Tuple ordering follows the CSS shorthand convention: [top, right, bottom, left].
 * When set, the text-render rect (and the background color, border, etc.) is
 * shrunk by these values before drawing — i.e., the schema's outer
 * width × height stays the same, only the area available for glyphs changes.
 *
 * Purely additive. Schemas without `padding` keep the previous render path
 * (no inset). See pdfme/pdfme#851.
 */
export type TextPadding = [number, number, number, number];

/**
 * Optional decorative border drawn just inside the text schema's bounds (mm / hex).
 *
 * - `width`  is in mm; the stroke is drawn inset by `width / 2` so the outer
 *            edge sits on the schema's bounding box (matches CSS `box-sizing:
 *            border-box` and the rectangle-shape convention).
 * - `color`  is a CSS-style hex string (e.g. `#cccccc`).
 * - `radius` is corner radius in mm. Ignored if 0/undefined.
 *
 * If `border` is omitted no border is drawn — pre-existing schemas are unaffected.
 * See pdfme/pdfme#851.
 */
export type TextBorder = {
  width?: number;
  color?: string;
  radius?: number;
};

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
  overflow?: TextOverflow;
  /** See `TextTransform` JSDoc. Default: `'none'`. pdfme/pdfme#707. */
  textTransform?: TEXT_TRANSFORM;
  /** See `TextPadding` JSDoc. pdfme/pdfme#851. */
  padding?: TextPadding;
  /** See `TextBorder` JSDoc. pdfme/pdfme#851. */
  border?: TextBorder;
  __textLineRange?: TextLineRange;
};
