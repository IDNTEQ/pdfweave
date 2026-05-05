import { Plugin, Schema, mm2pt } from '@pdfweave/common';
import { HEX_COLOR_PATTERN } from '../constants.js';
import { hex2PrintingColor, convertForPdfLayoutProps, createSvgStr } from '../utils.js';
import { toRadians } from '@pdfweave/pdf-lib';
import { Circle, Square } from 'lucide';

interface ShapeSchema extends Schema {
  type: 'ellipse' | 'rectangle';
  borderWidth: number;
  borderColor: string;
  color: string;
  radius?: number;
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
    div.style.borderStyle = schema.borderWidth && schema.borderColor ? 'solid' : 'none';
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

    const drawOptions = {
      rotate,
      borderWidth,
      borderColor: hex2PrintingColor(schema.borderColor, colorType),
      color: hex2PrintingColor(schema.color, colorType),
      opacity,
      borderOpacity: opacity,
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
    }),
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
