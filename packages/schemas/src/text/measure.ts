import {
  getDefaultFont,
  mm2pt,
  pt2mm,
  treatsLikeBlank,
  type BasePdf,
  type CommonOptions,
  type LayoutMeasureResult,
  type TextLineRange,
} from '@pdfweave/common';
import type { Font as FontKitFont } from 'fontkit';
import {
  DEFAULT_CHARACTER_SPACING,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  TEXT_OVERFLOW_EXPAND,
} from './constants.js';
import {
  applyTextTransform,
  calculateDynamicFontSize,
  getFontKitFont,
  heightOfFontAtSize,
  splitTextToSize,
} from './helper.js';
import { parseInlineMarkdown } from './inlineMarkdown.js';
import {
  calculateDynamicRichTextFontSize,
  getRichTextLineHeightAtSize,
  isInlineMarkdownTextSchema,
  layoutRichTextLines,
  resolveRichTextRuns,
  type RichTextLine,
} from './richText.js';
import type { TextSchema } from './types.js';

const EPSILON = 0.01;

type TextMeasureLine = string | RichTextLine;

type MeasureTextLinesArgs = {
  value: string;
  schema: TextSchema;
  font: NonNullable<CommonOptions['font']>;
  _cache: Map<string | number, unknown>;
  ignoreDynamicFontSize?: boolean;
};

type MeasureTextLinesResult<TLine extends TextMeasureLine = TextMeasureLine> = {
  lines: TLine[];
  lineHeights: number[];
  measuredHeight: number;
  fontSize: number;
};

export const applyTextLineRange = <T>(lines: T[], range?: TextLineRange) => {
  if (!range) return lines;
  return lines.slice(range.start, range.end ?? lines.length);
};

export const getTextInnerWidthInPt = (schema: TextSchema) => {
  const [, padRight = 0, , padLeft = 0] = schema.padding ?? [0, 0, 0, 0];
  return Math.max(0, mm2pt(schema.width - padLeft - padRight));
};

const getDeclaredFontSize = (schema: TextSchema) => schema.fontSize ?? DEFAULT_FONT_SIZE;

const getLineHeight = (schema: TextSchema) => schema.lineHeight ?? DEFAULT_LINE_HEIGHT;

const getCharacterSpacing = (schema: TextSchema) =>
  schema.characterSpacing ?? DEFAULT_CHARACTER_SPACING;

const getLineHeights = (arg: {
  lines: TextMeasureLine[];
  firstLineHeightPt: number;
  fontSize: number;
  lineHeight: number;
}) => {
  const { lines, firstLineHeightPt, fontSize, lineHeight } = arg;
  return lines.map((_, index) =>
    pt2mm((index === 0 ? firstLineHeightPt : fontSize) * lineHeight),
  );
};

const shouldUseDynamicFontSize = (schema: TextSchema, ignoreDynamicFontSize?: boolean) =>
  !ignoreDynamicFontSize && schema.overflow !== TEXT_OVERFLOW_EXPAND && schema.dynamicFontSize;

async function measurePlainTextLines(
  arg: MeasureTextLinesArgs,
): Promise<MeasureTextLinesResult<string>> {
  const { value, schema, font, _cache, ignoreDynamicFontSize } = arg;
  const fontKitFont = await getFontKitFont(schema.fontName, font, _cache as Map<string, FontKitFont>);
  const fontSize = shouldUseDynamicFontSize(schema, ignoreDynamicFontSize)
    ? calculateDynamicFontSize({ textSchema: schema, fontKitFont, value })
    : getDeclaredFontSize(schema);
  const lines = splitTextToSize({
    value,
    characterSpacing: getCharacterSpacing(schema),
    fontSize,
    fontKitFont,
    boxWidthInPt: getTextInnerWidthInPt(schema),
  });
  const lineHeights = getLineHeights({
    lines,
    firstLineHeightPt: heightOfFontAtSize(fontKitFont, fontSize),
    fontSize,
    lineHeight: getLineHeight(schema),
  });

  return {
    lines,
    lineHeights,
    measuredHeight: lineHeights.reduce((sum, height) => sum + height, 0),
    fontSize,
  };
}

async function measureRichTextLines(
  arg: MeasureTextLinesArgs,
): Promise<MeasureTextLinesResult<RichTextLine>> {
  const { value, schema, font, _cache, ignoreDynamicFontSize } = arg;
  const fontSize = shouldUseDynamicFontSize(schema, ignoreDynamicFontSize)
    ? await calculateDynamicRichTextFontSize({ value, schema, font, _cache })
    : getDeclaredFontSize(schema);
  const richTextRuns = parseInlineMarkdown(value);
  const resolvedRuns = await resolveRichTextRuns({ runs: richTextRuns, schema, font, _cache });
  const lines = layoutRichTextLines({
    runs: resolvedRuns,
    fontSize,
    characterSpacing: getCharacterSpacing(schema),
    boxWidthInPt: getTextInnerWidthInPt(schema),
  });
  const lineHeights = lines.map((line, index) =>
    pt2mm(
      (index === 0 ? getRichTextLineHeightAtSize(line, fontSize) : fontSize) *
        getLineHeight(schema),
    ),
  );

  return {
    lines,
    lineHeights,
    measuredHeight: lineHeights.reduce((sum, height) => sum + height, 0),
    fontSize,
  };
}

export const measureTextLines = async (
  arg: MeasureTextLinesArgs,
): Promise<MeasureTextLinesResult> => {
  if (isInlineMarkdownTextSchema(arg.schema)) {
    return measureRichTextLines(arg);
  }
  return measurePlainTextLines(arg);
};

const getRemainingPageHeight = (schema: TextSchema, basePdf: BasePdf) => {
  if (!treatsLikeBlank(basePdf)) return Number.POSITIVE_INFINITY;
  const [, , paddingBottom] = basePdf.padding;
  const contentBottom = basePdf.height - paddingBottom;
  return Math.max(0, contentBottom - schema.position.y);
};

const toLineFragments = (lineHeights: number[]) =>
  lineHeights.map((height, index) => ({
    height,
    lineRange: { start: index, end: index + 1 },
  }));

export const measure = async (arg: {
  value: string;
  schema: TextSchema;
  basePdf: BasePdf;
  options: CommonOptions;
  _cache: Map<string | number, unknown>;
}): Promise<LayoutMeasureResult> => {
  const { value: rawValue, schema, basePdf, options, _cache } = arg;
  if (schema.overflow !== TEXT_OVERFLOW_EXPAND || !rawValue) {
    return { height: schema.height };
  }

  const font = options.font ?? getDefaultFont();
  const value = applyTextTransform(rawValue, schema.textTransform);
  const { lineHeights, measuredHeight } = await measureTextLines({
    value,
    schema,
    font,
    _cache,
    ignoreDynamicFontSize: true,
  });

  if (lineHeights.length === 0 || measuredHeight <= schema.height + EPSILON) {
    return { height: schema.height };
  }

  const remainingPageHeight = getRemainingPageHeight(schema, basePdf);
  if (measuredHeight <= remainingPageHeight + EPSILON) {
    return { height: measuredHeight };
  }

  return { fragments: toLineFragments(lineHeights) };
};
