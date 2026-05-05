import type { Schema, Plugin, PropPanelWidgetProps } from '@pdfweave/common';
import { mm2pt } from '@pdfweave/common';
import {
  rotatePoint,
  convertForPdfLayoutProps,
  hex2PrintingColor,
  createSvgStr,
} from '../utils.js';
import { HEX_COLOR_PATTERN } from '../constants.js';
import { Minus } from 'lucide';

const DEFAULT_LINE_COLOR = '#000000';
const HIT_POINT_HEIGHT = 16;

interface LineSchema extends Schema {
  color: string;
  /**
   * Optional dash pattern for the line (mm units; alternating dash / gap
   * lengths). Same shape as pdf-lib's `dashArray` — note pdf-lib uses
   * `dashArray` (not `borderDashArray`) for `drawLine`. Defaults to
   * undefined (solid line), preserving the previous render path.
   * pdfme/pdfme#530.
   */
  borderDashArray?: number[];
}

/** Same widget contract as the rect/ellipse one — see comment over there. */
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

const lineSchema: Plugin<LineSchema> = {
  pdf: (arg) => {
    const { page, schema, options } = arg;
    if (schema.width === 0 || schema.height === 0 || !schema.color) return;
    const { colorType } = options;
    const pageHeight = page.getHeight();
    const {
      width,
      height,
      rotate,
      position: { x, y },
      opacity,
    } = convertForPdfLayoutProps({ schema, pageHeight, applyRotateTranslate: false });
    const pivot = { x: x + width / 2, y: y + height / 2 };
    // pdf-lib's drawLine takes `dashArray` (not borderDashArray); same dash
    // semantics as rect/ellipse. mm → pt conversion for symmetry with the
    // rest of the schema. pdfme/pdfme#530.
    const dashArray = Array.isArray(schema.borderDashArray)
      ? schema.borderDashArray.map(mm2pt)
      : undefined;
    page.drawLine({
      start: rotatePoint({ x, y: y + height / 2 }, pivot, rotate.angle),
      end: rotatePoint({ x: x + width, y: y + height / 2 }, pivot, rotate.angle),
      thickness: height,
      color: hex2PrintingColor(schema.color ?? DEFAULT_LINE_COLOR, colorType),
      opacity: opacity,
      ...(dashArray ? { dashArray } : {}),
    });
  },
  ui: (arg) => {
    const { schema, rootElement } = arg;
    Object.assign(rootElement.style, { position: 'relative', overflow: 'visible' });

    const baseStyles = {
      position: 'absolute',
      top: '50%',
      left: '0',
      transform: 'translateY(-50%)',
      width: '100%',
    } as const;

    const hitArea = document.createElement('div');
    Object.assign(hitArea.style, baseStyles, {
      height: `${HIT_POINT_HEIGHT}px`,
      backgroundColor: 'transparent',
    });

    const div = document.createElement('div');
    Object.assign(div.style, baseStyles, {
      height: '100%',
      backgroundColor: schema.color ?? 'transparent',
      pointerEvents: 'none',
    });

    // Dashed-line preview in the Designer / Viewer. CSS `background` doesn't
    // accept arbitrary dash arrays, so we approximate with a repeating
    // linear-gradient: dash mm of color, then gap mm transparent. Falls back
    // to solid when no dash is configured. pdfme/pdfme#530.
    if (Array.isArray(schema.borderDashArray) && schema.borderDashArray.length >= 2) {
      const dashMm = schema.borderDashArray[0];
      const gapMm = schema.borderDashArray[1];
      const color = schema.color ?? 'transparent';
      div.style.backgroundColor = 'transparent';
      div.style.backgroundImage = `linear-gradient(to right, ${color} 0 ${dashMm}mm, transparent ${dashMm}mm ${dashMm + gapMm}mm)`;
      div.style.backgroundSize = `${dashMm + gapMm}mm 100%`;
      div.style.backgroundRepeat = 'repeat-x';
    }

    rootElement.append(hitArea, div);
  },
  propPanel: {
    schema: ({ i18n }) => ({
      color: {
        title: i18n('schemas.color'),
        type: 'string',
        widget: 'color',
        props: {
          disabledAlpha: true,
        },
        required: true,
        rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
      },
      // pdfme/pdfme#530 — see widget JSDoc above.
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
      type: 'line',
      position: { x: 0, y: 0 },
      width: 50,
      height: 0.5,
      rotate: 0,
      opacity: 1,
      readOnly: true,
      color: DEFAULT_LINE_COLOR,
    },
  },
  icon: createSvgStr(Minus),
};
export default lineSchema;
