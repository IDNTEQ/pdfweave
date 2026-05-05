import { PDFFont, PDFDocument } from '@pdfweave/pdf-lib';
import type { Font as FontKitFont } from 'fontkit';
import type { TextSchema } from './types.js';
import {
  PDFRenderProps,
  ColorType,
  Font,
  getDefaultFont,
  getFallbackFontName,
  mm2pt,
} from '@pdfweave/common';
import {
  VERTICAL_ALIGN_TOP,
  VERTICAL_ALIGN_MIDDLE,
  VERTICAL_ALIGN_BOTTOM,
  DEFAULT_FONT_SIZE,
  DEFAULT_ALIGNMENT,
  DEFAULT_VERTICAL_ALIGNMENT,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_CHARACTER_SPACING,
  DEFAULT_FONT_COLOR,
} from './constants.js';
import {
  calculateDynamicFontSize,
  heightOfFontAtSize,
  getFontDescentInPt,
  getFontKitFont,
  fetchRemoteFontData,
  widthOfTextAtSize,
  splitTextToSize,
  applyTextTransform,
} from './helper.js';
import { stripInlineMarkdown } from './inlineMarkdown.js';
import { calculateDynamicRichTextFontSize, isInlineMarkdownTextSchema } from './richText.js';
import { renderInlineMarkdownText } from './richTextPdfRender.js';
import { convertForPdfLayoutProps, rotatePoint, hex2PrintingColor } from '../utils.js';

export const embedAndGetFontObj = async (arg: {
  pdfDoc: PDFDocument;
  font: Font;
  _cache: Map<PDFDocument, { [key: string]: PDFFont }>;
}) => {
  const { pdfDoc, font, _cache } = arg;
  if (_cache.has(pdfDoc)) {
    return _cache.get(pdfDoc) as { [key: string]: PDFFont };
  }

  const fontValues = await Promise.all(
    Object.values(font).map(async (v) => {
      let fontData = v.data;
      if (typeof fontData === 'string' && fontData.startsWith('http')) {
        fontData = await fetchRemoteFontData(fontData);
      }
      return pdfDoc.embedFont(fontData, {
        subset: typeof v.subset === 'undefined' ? true : v.subset,
      });
    }),
  );

  const fontObj = Object.keys(font).reduce(
    (acc, cur, i) => Object.assign(acc, { [cur]: fontValues[i] }),
    {} as { [key: string]: PDFFont },
  );

  _cache.set(pdfDoc, fontObj);
  return fontObj;
};

const getFontProp = ({
  value,
  fontKitFont,
  schema,
  colorType,
  fontSize: resolvedFontSize,
}: {
  value: string;
  fontKitFont: FontKitFont;
  colorType?: ColorType;
  schema: TextSchema;
  fontSize?: number;
}) => {
  const fontSize =
    resolvedFontSize ??
    (schema.dynamicFontSize
      ? calculateDynamicFontSize({ textSchema: schema, fontKitFont, value })
      : (schema.fontSize ?? DEFAULT_FONT_SIZE));
  const color = hex2PrintingColor(schema.fontColor || DEFAULT_FONT_COLOR, colorType);

  return {
    alignment: schema.alignment ?? DEFAULT_ALIGNMENT,
    verticalAlignment: schema.verticalAlignment ?? DEFAULT_VERTICAL_ALIGNMENT,
    lineHeight: schema.lineHeight ?? DEFAULT_LINE_HEIGHT,
    characterSpacing: schema.characterSpacing ?? DEFAULT_CHARACTER_SPACING,
    fontSize,
    color,
  };
};

export const pdfRender = async (arg: PDFRenderProps<TextSchema>) => {
  const { value: rawValue, pdfDoc, pdfLib, page, options, schema, _cache } = arg;
  if (!rawValue) return;

  const { font = getDefaultFont(), colorType } = options;

  // textTransform is applied at render time only — the schema's stored value
  // is left untouched so a Designer toggling between transforms always sees
  // the user's original input. Inline markdown is transformed *after* parsing
  // to avoid mangling delimiters like `**bold**` → `**BOLD**` (still parses).
  // pdfme/pdfme#707.
  const value = applyTextTransform(rawValue, schema.textTransform);

  const [pdfFontObj, fontKitFont] = await Promise.all([
    embedAndGetFontObj({
      pdfDoc,
      font,
      _cache: _cache as unknown as Map<PDFDocument, { [key: string]: PDFFont }>,
    }),
    getFontKitFont(schema.fontName, font, _cache as Map<string, FontKitFont>),
  ]);
  const enableInlineMarkdown = isInlineMarkdownTextSchema(schema);
  const displayValue = enableInlineMarkdown ? stripInlineMarkdown(value) : value;
  const dynamicRichTextFontSize =
    enableInlineMarkdown && schema.dynamicFontSize
      ? await calculateDynamicRichTextFontSize({ value, schema, font, _cache })
      : undefined;
  const fontProp = getFontProp({
    value: displayValue,
    fontKitFont,
    schema,
    colorType,
    fontSize: dynamicRichTextFontSize,
  });

  const { fontSize, color, alignment, verticalAlignment, lineHeight, characterSpacing } = fontProp;

  const fontName = (
    schema.fontName ? schema.fontName : getFallbackFontName(font)
  ) as keyof typeof pdfFontObj;
  const pdfFontValue = pdfFontObj && pdfFontObj[fontName];

  const pageHeight = page.getHeight();
  const {
    width: outerWidth,
    height: outerHeight,
    rotate,
    position: { x: outerX, y: outerY },
    opacity,
  } = convertForPdfLayoutProps({ schema, pageHeight, applyRotateTranslate: false });

  // Pivot stays at the schema's outer center so any rotation is around the
  // schema box center — same as the UI does — independent of inner padding.
  const pivotPoint = {
    x: outerX + outerWidth / 2,
    y: pageHeight - mm2pt(schema.position.y) - outerHeight / 2,
  };

  if (schema.backgroundColor) {
    const color = hex2PrintingColor(schema.backgroundColor, colorType);
    if (rotate.angle !== 0) {
      // Apply the same rotation logic as text rendering to match UI behavior
      const rotatedPoint = rotatePoint({ x: outerX, y: outerY }, pivotPoint, rotate.angle);
      page.drawRectangle({
        x: rotatedPoint.x,
        y: rotatedPoint.y,
        width: outerWidth,
        height: outerHeight,
        rotate,
        color,
      });
    } else {
      page.drawRectangle({
        x: outerX,
        y: outerY,
        width: outerWidth,
        height: outerHeight,
        rotate,
        color,
      });
    }
  }

  // Optional border drawn just inside the schema box (matches CSS
  // `box-sizing: border-box` — same convention as the rectangle shape).
  // pdfme/pdfme#851.
  if (schema.border?.width && schema.border.width > 0) {
    const borderColorHex = schema.border.color ?? '#000000';
    const borderWidthPt = mm2pt(schema.border.width);
    const half = borderWidthPt / 2;
    const angle = rotate.angle * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Same inset-rotation trick as packages/schemas/src/shapes/rectAndEllipse.ts
    // — pdf-lib rotates around (x, y), so the (half, half) offset has to be
    // rotated around the schema's outer corner to keep the inner border
    // concentric with the schema box at any angle.
    const dx = half * cos - half * sin;
    const dy = half * sin + half * cos;
    page.drawRectangle({
      x: outerX + dx,
      y: outerY + dy,
      width: outerWidth - borderWidthPt,
      height: outerHeight - borderWidthPt,
      ...(schema.border.radius ? { radius: mm2pt(schema.border.radius) } : {}),
      rotate,
      borderWidth: borderWidthPt,
      borderColor: hex2PrintingColor(borderColorHex, colorType),
      borderOpacity: opacity,
      opacity,
    });
  }

  // Padding shrinks the text-render rect; the schema's outer bounds are
  // unchanged. Defaults to [0,0,0,0] so any schema without `padding` keeps
  // the previous render geometry exactly.
  const [padTopMm, padRightMm, padBottomMm, padLeftMm] = schema.padding ?? [0, 0, 0, 0];
  const padTop = mm2pt(padTopMm);
  const padRight = mm2pt(padRightMm);
  const padBottom = mm2pt(padBottomMm);
  const padLeft = mm2pt(padLeftMm);
  const x = outerX + padLeft;
  // No `y` for the inner box: the text-render path computes line y positions
  // from `pageHeight - mm2pt(schema.position.y) - padTop` directly, so it
  // doesn't need the inner box's bottom-left in PDF coords. Padding-bottom
  // (padBottom) is implicitly honoured because `height` (below) is reduced,
  // shrinking the area used for vertical-alignment math.
  const width = outerWidth - padLeft - padRight;
  const height = outerHeight - padTop - padBottom;

  if (enableInlineMarkdown) {
    await renderInlineMarkdownText({
      value,
      schema,
      font,
      pdfFontObj,
      fontKitFont,
      page,
      pdfLib,
      _cache,
      colorType,
      fontSize,
      color,
      alignment,
      verticalAlignment,
      lineHeight,
      characterSpacing,
      x,
      width,
      height,
      pageHeight,
      pivotPoint,
      rotate,
      opacity,
      padTop,
    });
    return;
  }

  const firstLineTextHeight = heightOfFontAtSize(fontKitFont, fontSize);
  const descent = getFontDescentInPt(fontKitFont, fontSize);
  const halfLineHeightAdjustment = lineHeight === 0 ? 0 : ((lineHeight - 1) * fontSize) / 2;

  const lines = splitTextToSize({
    value,
    characterSpacing,
    fontSize,
    fontKitFont,
    boxWidthInPt: width,
  });

  // Text lines are rendered from the bottom upwards, we need to adjust the position down
  let yOffset = 0;
  if (verticalAlignment === VERTICAL_ALIGN_TOP) {
    yOffset = firstLineTextHeight + halfLineHeightAdjustment;
  } else {
    const otherLinesHeight = lineHeight * fontSize * (lines.length - 1);

    if (verticalAlignment === VERTICAL_ALIGN_BOTTOM) {
      yOffset = height - otherLinesHeight + descent - halfLineHeightAdjustment;
    } else if (verticalAlignment === VERTICAL_ALIGN_MIDDLE) {
      yOffset =
        (height - otherLinesHeight - firstLineTextHeight + descent) / 2 + firstLineTextHeight;
    }
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  lines.forEach((line, rowIndex) => {
    const trimmed = line.replace('\n', '');
    const textWidth = widthOfTextAtSize(trimmed, fontKitFont, fontSize, characterSpacing);
    const textHeight = heightOfFontAtSize(fontKitFont, fontSize);
    const rowYOffset = lineHeight * fontSize * rowIndex;

    // Adobe Acrobat Reader shows an error if `drawText` is called with an empty text
    if (line === '') {
      // return; // this also works
      line = '\r\n';
    }

    let xLine = x;
    if (alignment === 'center') {
      xLine += (width - textWidth) / 2;
    } else if (alignment === 'right') {
      xLine += width - textWidth;
    }

    // `pageHeight - mm2pt(schema.position.y)` is the top of the schema's
    // outer box in PDF coords (y grows up); subtracting `padTop` moves the
    // top of the text area down by the padding. Schemas with no padding pass
    // padTop=0 so the math is identical to the pre-padding render path.
    let yLine = pageHeight - mm2pt(schema.position.y) - padTop - yOffset - rowYOffset;

    // draw strikethrough
    if (schema.strikethrough && textWidth > 0) {
      const _x = xLine + textWidth + 1;
      const _y = yLine + textHeight / 3;
      page.drawLine({
        start: rotatePoint({ x: xLine, y: _y }, pivotPoint, rotate.angle),
        end: rotatePoint({ x: _x, y: _y }, pivotPoint, rotate.angle),
        thickness: (1 / 12) * fontSize,
        color: color,
        opacity,
      });
    }

    // draw underline
    if (schema.underline && textWidth > 0) {
      const _x = xLine + textWidth + 1;
      const _y = yLine - textHeight / 12;
      page.drawLine({
        start: rotatePoint({ x: xLine, y: _y }, pivotPoint, rotate.angle),
        end: rotatePoint({ x: _x, y: _y }, pivotPoint, rotate.angle),
        thickness: (1 / 12) * fontSize,
        color: color,
        opacity,
      });
    }

    if (rotate.angle !== 0) {
      // As we draw each line individually from different points, we must translate each lines position
      // relative to the UI rotation pivot point. see comments in convertForPdfLayoutProps() for more info.
      const rotatedPoint = rotatePoint({ x: xLine, y: yLine }, pivotPoint, rotate.angle);
      xLine = rotatedPoint.x;
      yLine = rotatedPoint.y;
    }

    let spacing = characterSpacing;
    if (alignment === 'justify' && line.slice(-1) !== '\n') {
      // if alignment is `justify` but the end of line is not newline, then adjust the spacing
      const iterator = segmenter.segment(trimmed)[Symbol.iterator]();
      const len = Array.from(iterator).length;
      spacing += (width - textWidth) / len;
    }
    page.pushOperators(pdfLib.setCharacterSpacing(spacing));

    page.drawText(trimmed, {
      x: xLine,
      y: yLine,
      rotate,
      size: fontSize,
      color,
      lineHeight: lineHeight * fontSize,
      font: pdfFontValue,
      opacity,
    });
  });
};
