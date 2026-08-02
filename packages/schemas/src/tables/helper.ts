import {
  DEFAULT_ALIGNMENT,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_CHARACTER_SPACING,
  DEFAULT_FONT_COLOR,
  ALIGN_RIGHT,
  ALIGN_CENTER,
  ALIGN_LEFT,
  VERTICAL_ALIGN_TOP,
  VERTICAL_ALIGN_MIDDLE,
  VERTICAL_ALIGN_BOTTOM,
} from '../text/constants.js';
import { HEX_COLOR_PATTERN } from '../constants.js';

export const getDefaultCellStyles = () => ({
  fontName: undefined,
  alignment: DEFAULT_ALIGNMENT,
  verticalAlignment: VERTICAL_ALIGN_MIDDLE,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  characterSpacing: DEFAULT_CHARACTER_SPACING,
  fontColor: DEFAULT_FONT_COLOR,
  backgroundColor: '',
  borderColor: '#888888',
  borderWidth: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
  padding: { top: 5, bottom: 5, left: 5, right: 5 },
});

const getBoxDimensionProp = (step = 1) => {
  const getCommonProp = () => ({
    type: 'number',
    widget: 'inputNumber',
    props: { min: 0, step },
    span: 6,
  });
  return {
    top: { title: 'Top', ...getCommonProp() },
    right: { title: 'Right', ...getCommonProp() },
    bottom: { title: 'Bottom', ...getCommonProp() },
    left: { title: 'Left', ...getCommonProp() },
  };
};

export const getCellPropPanelSchema = (arg: {
  i18n: (key: string) => string;
  fallbackFontName: string;
  fontNames: string[];
  isBody?: boolean;
}) => {
  const { i18n, fallbackFontName, fontNames, isBody } = arg;

  return {
    fontName: {
      title: i18n('schemas.text.fontName'),
      type: 'string',
      widget: 'select',
      default: fallbackFontName,
      placeholder: fallbackFontName,
      props: { options: fontNames.map((name) => ({ label: name, value: name })) },
      span: 12,
    },
    fontSize: {
      title: i18n('schemas.text.size'),
      type: 'number',
      widget: 'inputNumber',
      props: { min: 0 },
      span: 6,
    },
    characterSpacing: {
      title: i18n('schemas.text.spacing'),
      type: 'number',
      widget: 'inputNumber',
      props: { min: 0 },
      span: 6,
    },
    alignment: {
      title: i18n('schemas.text.textAlign'),
      type: 'string',
      widget: 'select',
      props: {
        options: [
          { label: i18n('schemas.left'), value: ALIGN_LEFT },
          { label: i18n('schemas.center'), value: ALIGN_CENTER },
          { label: i18n('schemas.right'), value: ALIGN_RIGHT },
        ],
      },
      span: 8,
    },
    verticalAlignment: {
      title: i18n('schemas.text.verticalAlign'),
      type: 'string',
      widget: 'select',
      props: {
        options: [
          { label: i18n('schemas.top'), value: VERTICAL_ALIGN_TOP },
          { label: i18n('schemas.middle'), value: VERTICAL_ALIGN_MIDDLE },
          { label: i18n('schemas.bottom'), value: VERTICAL_ALIGN_BOTTOM },
        ],
      },
      span: 8,
    },
    lineHeight: {
      title: i18n('schemas.text.lineHeight'),
      type: 'number',
      widget: 'inputNumber',
      props: { step: 0.1, min: 0 },
      span: 8,
    },
    fontColor: {
      title: i18n('schemas.textColor'),
      type: 'string',
      widget: 'color',
      props: {
        disabledAlpha: true,
      },
      rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
    },
    borderColor: {
      title: i18n('schemas.borderColor'),
      type: 'string',
      widget: 'color',
      props: {
        disabledAlpha: true,
      },
      rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
    },
    backgroundColor: {
      title: i18n('schemas.backgroundColor'),
      type: 'string',
      widget: 'color',
      props: {
        disabledAlpha: true,
      },
      rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
    },
    ...(isBody
      ? {
          alternateBackgroundColor: {
            title: i18n('schemas.table.alternateBackgroundColor'),
            type: 'string',
            widget: 'color',
            props: {
              disabledAlpha: true,
            },
            rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
          },
        }
      : {}),
    '-': { type: 'void', widget: 'Divider' },
    borderWidth: {
      title: i18n('schemas.borderWidth'),
      type: 'object',
      widget: 'lineTitle',
      span: 24,
      properties: getBoxDimensionProp(0.1),
    },
    '--': { type: 'void', widget: 'Divider' },
    padding: {
      title: i18n('schemas.padding'),
      type: 'object',
      widget: 'lineTitle',
      span: 24,
      properties: getBoxDimensionProp(),
    },
  };
};

export const getColumnStylesPropPanelSchema = ({
  head,
  i18n,
}: {
  head: string[];
  i18n: (key: string) => string;
}) => ({
  alignment: {
    type: 'object',
    widget: 'lineTitle',
    title: i18n('schemas.text.textAlign'),
    column: 3,
    properties: head.reduce(
      (acc, cur, i) =>
        Object.assign(acc, {
          [i]: {
            title: cur || 'Column ' + String(i + 1),
            type: 'string',
            widget: 'select',
            props: {
              options: [
                { label: i18n('schemas.left'), value: ALIGN_LEFT },
                { label: i18n('schemas.center'), value: ALIGN_CENTER },
                { label: i18n('schemas.right'), value: ALIGN_RIGHT },
              ],
            },
          },
        }),
      {},
    ),
  },
});

/**
 * Decode a table body from either:
 *   - the canonical `string[][]` shape
 *   - a JSON-encoded `string` (`'[["a","b"]]'`)
 *   - the comma-flattened fallback shape that results from
 *     `replacePlaceholders` substituting an array variable into a
 *     readOnly table's `content` (regression: pdfme/pdfme#1299).
 *
 * The third case happens because `replacePlaceholders` evaluates the
 * placeholder expression and concatenates the result via `String(value)`;
 * for an array `[["a","b"]]` that yields `"a,b"`, which would then crash
 * `JSON.parse`. When `columnCount` is provided (the schema's head length),
 * we reshape the comma-split tokens back into N-column rows so the table
 * still renders correctly. Without `columnCount`, we fall back to a single
 * row containing the split tokens — better than throwing.
 */
const normalizeCell = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value) ?? '';
  return '';
};

const normalizeRows = (rows: unknown[][]): string[][] =>
  rows.map((row) => row.map((cell) => normalizeCell(cell)));

export const getBody = (value: string | string[][], columnCount?: number): string[][] => {
  if (Array.isArray(value)) return normalizeRows(value);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      // Tolerate either `[[...rows]]` or a single row `[...]`. The latter is
      // what some upstream callers produce when the inputs themselves are an
      // array (not a JSON string of an array).
      if (parsed.every((row) => Array.isArray(row))) {
        return normalizeRows(parsed as unknown[][]);
      }
      return [parsed.map((cell) => normalizeCell(cell))];
    }
    // JSON parsed but isn't an array (e.g. `"foo"`). Drop into the
    // comma-recovery path below.
  } catch {
    // not valid JSON — fall through to the comma-recovery path.
  }
  // Recovery for the pdfme/pdfme#1299 path: comma-flattened from
  // String(arrayOfArrays). If we know the target column count we can
  // reshape into rows; otherwise emit one row.
  const tokens = trimmed.split(',');
  if (columnCount && columnCount > 0 && tokens.length % columnCount === 0) {
    const rows: string[][] = [];
    for (let i = 0; i < tokens.length; i += columnCount) {
      rows.push(tokens.slice(i, i + columnCount));
    }
    return rows;
  }
  return [tokens];
};

export const getBodyWithRange = (
  value: string | string[][],
  range?: { start: number; end?: number | undefined },
  columnCount?: number,
) => {
  const body = getBody(value, columnCount);
  if (!range) return body;
  return body.slice(range.start, range.end);
};
