import { Plugin, Schema, mm2pt, type PropPanelWidgetProps } from '@pdfweave/common';
import { HEX_COLOR_PATTERN } from '../constants.js';
import { hex2PrintingColor, convertForPdfLayoutProps, createSvgStr } from '../utils.js';
import { toRadians } from '@pdfweave/pdf-lib';
import { Circle, Square } from 'lucide';

/**
 * Edit `schema.borderDashArray` (number[] in mm) as a comma-separated text
 * input. Form-panel libraries don't bind nested arrays cleanly; surfacing
 * as text + parse round-trip keeps the underlying number[] shape that
 * pdf-lib and the SVG renderer expect. Empty / blank input clears the
 * field (= solid stroke). pdfme/pdfme#530.
 */
const BorderDashArrayWidget = (props: PropPanelWidgetProps) => {
  const { rootElement, changeSchemas, activeSchema } = props;
  const dash = (activeSchema as { borderDashArray?: number[] }).borderDashArray;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '4,2';
  input.value = Array.isArray(dash) ? dash.join(',') : '';
  input.style.cssText = 'width: 100%;';
  input.onchange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw === '') {
      changeSchemas([{ key: 'borderDashArray', value: undefined, schemaId: activeSchema.id }]);
      return;
    }
    const parts = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    changeSchemas([
      {
        key: 'borderDashArray',
        value: parts.length > 0 ? parts : undefined,
        schemaId: activeSchema.id,
      },
    ]);
  };
  rootElement.appendChild(input);
};

interface ShapeSchema extends Schema {
  type: 'ellipse' | 'rectangle';
  borderWidth: number;
  borderColor: string;
  color: string;
  radius?: number;
  /**
   * Optional dash pattern for the border stroke (mm units; pdf-lib expects
   * the same units as the stroke width). Same shape as pdf-lib's
   * `borderDashArray` — alternating dash / gap lengths. Defaults to
   * `undefined` (solid stroke), preserving the previous render path.
   * pdfme/pdfme#530.
   */
  borderDashArray?: number[];
}

const shape: Plugin<ShapeSchema> = {
  ui: (arg) => {
    const { schema, rootElement } = arg;
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.boxSizing = 'border-box';
    if (schema.type === 'ellipse') {
      div.style.borderRadius = '50%';
    } else if (schema.radius && schema.radius > 0) {
      div.style.borderRadius = `${schema.radius}mm`;
    }
    div.style.borderWidth = `${schema.borderWidth ?? 0}mm`;
    // CSS border-style approximates pdf-lib's dash render. CSS doesn't
    // accept arbitrary dash arrays on borders (it's `dashed` / `dotted` /
    // `solid` only), so the UI shows "dashed" whenever a dash array is
    // present and "solid" otherwise. The PDF still draws the exact
    // pattern via borderDashArray. pdfme/pdfme#530.
    const hasDash = Array.isArray(schema.borderDashArray) && schema.borderDashArray.length > 0;
    div.style.borderStyle =
      schema.borderWidth && schema.borderColor ? (hasDash ? 'dashed' : 'solid') : 'none';
    div.style.borderColor = schema.borderColor ?? 'transparent';
    div.style.backgroundColor = schema.color ?? 'transparent';

    rootElement.appendChild(div);
  },
  pdf: (arg) => {
    const { schema, page, options } = arg;
    if (!schema.color && !schema.borderColor) return;
    const { colorType } = options;
    const pageHeight = page.getHeight();
    const cArg = { schema, pageHeight };
    const { position, width, height, rotate, opacity } = convertForPdfLayoutProps(cArg);
    const {
      position: { x: x4Ellipse, y: y4Ellipse },
    } = convertForPdfLayoutProps({ ...cArg, applyRotateTranslate: false });
    const borderWidth = schema.borderWidth ? mm2pt(schema.borderWidth) : 0;

    // borderDashArray values are in mm (matching how borderWidth is
    // expressed at the schema level) and converted to pt here so callers
    // don't have to think about pdf-lib's unit. Empty array == solid
    // stroke; pdf-lib treats `[]` as no-dash. pdfme/pdfme#530.
    const borderDashArray = Array.isArray(schema.borderDashArray)
      ? schema.borderDashArray.map(mm2pt)
      : undefined;

    const drawOptions = {
      rotate,
      borderWidth,
      borderColor: hex2PrintingColor(schema.borderColor, colorType),
      color: hex2PrintingColor(schema.color, colorType),
      opacity,
      borderOpacity: opacity,
      ...(borderDashArray ? { borderDashArray } : {}),
    };
    if (schema.type === 'ellipse') {
      page.drawEllipse({
        x: x4Ellipse + width / 2,
        y: y4Ellipse + height / 2,
        xScale: width / 2 - borderWidth / 2,
        yScale: height / 2 - borderWidth / 2,
        ...drawOptions,
      });
    } else if (schema.type === 'rectangle') {
      const radius = schema.radius ?? 0;

      // SVG (the UI) uses `box-sizing: border-box`, so the border is drawn
      // *inside* the schema's width × height. pdf-lib's drawRectangle
      // centers the border on the rectangle's edge — half-inside,
      // half-outside. To match the UI, draw an inner rectangle inset by
      // borderWidth/2 on each side. When the schema is rotated, the
      // (borderWidth/2, borderWidth/2) offset has to be rotated too,
      // because pdf-lib rotates around the rectangle's corner.
      //
      // The previous formula attempted this with arbitrary terms involving
      // `Math.tan(toRadians(rotate)) * Math.PI ** 2`, which is unbounded
      // (Infinity at 90°) and bears no relation to the geometry. The
      // upshot was that any thick-bordered rectangle with rotation rendered
      // miles away from where the SVG showed it (regression: pdfme/pdfme#382).
      const half = borderWidth / 2;
      const angle = toRadians(rotate);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Rotate the (half, half) inset around the unrotated origin. pdf-lib's
      // toRadians(degrees) yields the math-convention angle (CCW positive).
      const dx = half * cos - half * sin;
      const dy = half * sin + half * cos;

      page.drawRectangle({
        x: position.x + dx,
        y: position.y + dy,
        width: width - borderWidth,
        height: height - borderWidth,
        ...(radius ? { radius: mm2pt(radius) } : {}),
        ...drawOptions,
      });
    }
  },
  propPanel: {
    schema: ({ i18n }) => ({
      borderWidth: {
        title: i18n('schemas.borderWidth'),
        type: 'number',
        widget: 'inputNumber',
        props: { min: 0, step: 1 },
        span: 12,
      },
      borderColor: {
        title: i18n('schemas.borderColor'),
        type: 'string',
        widget: 'color',
        props: {
          disabledAlpha: true,
        },
        rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
        span: 12,
      },
      color: {
        title: i18n('schemas.color'),
        type: 'string',
        widget: 'color',
        props: {
          disabledAlpha: true,
        },
        rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
      },
      radius: {
        title: i18n('schemas.radius'),
        type: 'number',
        widget: 'inputNumber',
        props: { min: 0, step: 1 },
        span: 12,
      },
      // Custom widget — surfaces the number[] as a comma-separated string
      // since arrays are awkward to bind in form panels (same trick used
      // for text padding). pdfme/pdfme#530.
      borderDashArray: {
        title: i18n('schemas.borderDashArray') || 'Dash pattern (mm: dash,gap,...)',
        type: 'void',
        widget: 'BorderDashArrayWidget',
        span: 24,
      },
    }),
    widgets: { BorderDashArrayWidget },
    defaultSchema: {
      name: '',
      type: 'rectangle',
      position: { x: 0, y: 0 },
      width: 62.5,
      height: 37.5,
      rotate: 0,
      opacity: 1,
      borderWidth: 1,
      borderColor: '#000000',
      color: '',
      readOnly: true,
      radius: 0,
    },
  },
};

const getPropPanelSchema = (type: 'rectangle' | 'ellipse') => ({
  ...shape.propPanel,
  defaultSchema: {
    ...(shape.propPanel.defaultSchema as ShapeSchema),
    type,
  },
});

export const rectangle: Plugin<ShapeSchema> = {
  ...shape,
  propPanel: getPropPanelSchema('rectangle'),
  icon: createSvgStr(Square),
};

export const ellipse: Plugin<ShapeSchema> = {
  ...shape,
  propPanel: getPropPanelSchema('ellipse'),
  icon: createSvgStr(Circle),
};
