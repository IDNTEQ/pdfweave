import { DEFAULT_FONT_NAME, Plugin, PDFRenderProps, getFallbackFontName } from '@pdfweave/common';
import { uiRender as textUiRender } from '../text/uiRender.js';
import { pdfRender as textPdfRender } from '../text/pdfRender.js';
import line from '../shapes/line.js';
import { rectangle } from '../shapes/rectAndEllipse.js';
import type { CellSchema } from './types.js';
import { getCellPropPanelSchema, getDefaultCellStyles } from './helper.js';
const linePdfRender = line.pdf;
const rectanglePdfRender = rectangle.pdf;

const renderLine = async (
  arg: PDFRenderProps<CellSchema>,
  schema: CellSchema,
  position: { x: number; y: number },
  width: number,
  height: number,
) =>
  linePdfRender({
    ...arg,
    schema: { ...schema, type: 'line', position, width, height, color: schema.borderColor },
  });

const createTextDiv = (schema: CellSchema) => {
  const { borderWidth: bw, width, height, padding: pd } = schema;
  const textDiv = document.createElement('div');
  textDiv.style.position = 'absolute';
  textDiv.style.zIndex = '1';
  textDiv.style.width = `${width - bw.left - bw.right - pd.left - pd.right}mm`;
  textDiv.style.height = `${height - bw.top - bw.bottom - pd.top - pd.bottom}mm`;
  textDiv.style.top = `${bw.top + pd.top}mm`;
  textDiv.style.left = `${bw.left + pd.left}mm`;
  return textDiv;
};

const createLineDiv = (
  width: string,
  height: string,
  top: string | null,
  right: string | null,
  bottom: string | null,
  left: string | null,
  borderColor: string,
) => {
  const div = document.createElement('div');
  div.style.width = width;
  div.style.height = height;
  div.style.position = 'absolute';
  if (top !== null) div.style.top = top;
  if (right !== null) div.style.right = right;
  if (bottom !== null) div.style.bottom = bottom;
  if (left !== null) div.style.left = left;
  div.style.backgroundColor = borderColor;
  return div;
};

const cellSchema: Plugin<CellSchema> = {
  pdf: async (arg) => {
    const { schema } = arg;
    const { position, width, height, borderWidth, padding } = schema;

    await Promise.all([
      // BACKGROUND
      rectanglePdfRender({
        ...arg,
        schema: {
          ...schema,
          type: 'rectangle',
          width: schema.width,
          height: schema.height,
          borderWidth: 0,
          borderColor: '',
          color: schema.backgroundColor,
        },
      }),
      // TOP
      renderLine(arg, schema, { x: position.x, y: position.y }, width, borderWidth.top),
      // RIGHT
      renderLine(
        arg,
        schema,
        { x: position.x + width - borderWidth.right, y: position.y },
        borderWidth.right,
        height,
      ),
      // BOTTOM
      renderLine(
        arg,
        schema,
        { x: position.x, y: position.y + height - borderWidth.bottom },
        width,
        borderWidth.bottom,
      ),
      // LEFT
      renderLine(arg, schema, { x: position.x, y: position.y }, borderWidth.left, height),
    ]);
    // TEXT
    // The cell schema's `padding` is a `Spacing` *object* (top/right/bottom/
    // left), already applied above to inset the text rect. The text schema's
    // own optional `padding` field added in pdfme/pdfme#851 is a 4-tuple — a
    // structurally incompatible shape. Strip both so the cell's text doesn't
    // accidentally inherit a tuple/spread from the cell schema. `border`
    // (text decorative border, pdfme/pdfme#851) is also stripped because the
    // cell renders its own per-side borders explicitly above.
    const {
      padding: _cellPadding,
      border: _cellBorder,
      ...textSchemaBase
    } = schema as CellSchema & { border?: unknown };
    await textPdfRender({
      ...arg,
      schema: {
        ...textSchemaBase,
        type: 'text',
        backgroundColor: '',
        position: {
          x: position.x + borderWidth.left + padding.left,
          y: position.y + borderWidth.top + padding.top,
        },
        width: width - borderWidth.left - borderWidth.right - padding.left - padding.right,
        height: height - borderWidth.top - borderWidth.bottom - padding.top - padding.bottom,
      } as unknown as Parameters<typeof textPdfRender>[0]['schema'],
    });
  },
  ui: async (arg) => {
    const { schema, rootElement } = arg;
    const { borderWidth, width, height, borderColor, backgroundColor } = schema;
    rootElement.style.backgroundColor = backgroundColor;

    const textDiv = createTextDiv(schema);
    // Same shape-stripping as the pdf path above — see comment there.
    const {
      padding: _cellPaddingUi,
      border: _cellBorderUi,
      ...textSchemaBase
    } = schema as CellSchema & { border?: unknown };
    await textUiRender({
      ...arg,
      schema: { ...textSchemaBase, backgroundColor: '' } as unknown as Parameters<
        typeof textUiRender
      >[0]['schema'],
      rootElement: textDiv,
    });
    rootElement.appendChild(textDiv);

    const lines = [
      createLineDiv(`${width}mm`, `${borderWidth.top}mm`, '0mm', null, null, '0mm', borderColor),
      createLineDiv(`${width}mm`, `${borderWidth.bottom}mm`, null, null, '0mm', '0mm', borderColor),
      createLineDiv(`${borderWidth.left}mm`, `${height}mm`, '0mm', null, null, '0mm', borderColor),
      createLineDiv(`${borderWidth.right}mm`, `${height}mm`, '0mm', '0mm', null, null, borderColor),
    ];

    lines.forEach((line) => rootElement.appendChild(line));
  },
  propPanel: {
    schema: ({ options, i18n }) => {
      const font = options.font || { [DEFAULT_FONT_NAME]: { data: '', fallback: true } };
      const fontNames = Object.keys(font);
      const fallbackFontName = getFallbackFontName(font);
      return getCellPropPanelSchema({ i18n, fontNames, fallbackFontName });
    },
    defaultSchema: {
      name: '',
      type: 'cell',
      content: 'Type Something...',
      position: { x: 0, y: 0 },
      width: 50,
      height: 15,
      ...getDefaultCellStyles(),
    },
  },
};
export default cellSchema;
