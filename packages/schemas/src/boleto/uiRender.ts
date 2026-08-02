import type { Schema, UIRenderProps } from '@pdfweave/common';
import type { BarcodeSchema } from '../barcodes/types.js';
import barcodes from '../barcodes/index.js';
import image from '../graphics/image.js';
import text from '../text/index.js';
import { createErrorElm } from '../utils.js';
import { formatDigitableLine } from './digits.js';
import { buildBoletoLayout, type BoletoLayout } from './layout.js';
import {
  getBoletoTextValue,
  preflightBoletoLayout,
  preflightBoletoLogo,
} from './renderPreflight.js';
import type { BoletoSchema } from './schema.js';
import { validateBoletoSchema } from './schema.js';
import { BOLETO_ERROR_PREFIX } from './types.js';
import { parseBoletoData } from './validation.js';

const createChildRoot = (
  root: HTMLDivElement,
  schema: BoletoSchema,
  x: number,
  y: number,
  width: number,
  height: number,
): HTMLDivElement => {
  const child = document.createElement('div');
  Object.assign(child.style, {
    position: 'absolute',
    left: `${(x / schema.width) * 100}%`,
    top: `${(y / schema.height) * 100}%`,
    width: `${(width / schema.width) * 100}%`,
    height: `${(height / schema.height) * 100}%`,
    overflow: 'hidden',
    boxSizing: 'border-box',
  });
  child.dataset.boletoPrimitive = 'true';
  root.appendChild(child);
  return child;
};

const createLine = (
  root: HTMLDivElement,
  schema: BoletoSchema,
  line: { x1: number; y1: number; x2: number; y2: number; thickness: number },
): void => {
  const element = document.createElement('div');
  element.dataset.boletoLine = 'true';
  const horizontal = line.y1 === line.y2;
  element.dataset.boletoLineOrientation = horizontal ? 'horizontal' : 'vertical';
  element.dataset.boletoLineX1 = String(line.x1);
  element.dataset.boletoLineY1 = String(line.y1);
  element.dataset.boletoLineX2 = String(line.x2);
  element.dataset.boletoLineY2 = String(line.y2);
  element.dataset.boletoLineThickness = String(line.thickness);
  Object.assign(element.style, {
    position: 'absolute',
    left: `${(Math.min(line.x1, line.x2) / schema.width) * 100}%`,
    top: `${(Math.min(line.y1, line.y2) / schema.height) * 100}%`,
    width: horizontal
      ? `${(Math.abs(line.x2 - line.x1) / schema.width) * 100}%`
      : `${line.thickness}mm`,
    height: horizontal
      ? `${line.thickness}mm`
      : `${(Math.abs(line.y2 - line.y1) / schema.height) * 100}%`,
    backgroundColor: '#000000',
    transform: horizontal
      ? `translateY(${-line.thickness / 2}mm)`
      : `translateX(${-line.thickness / 2}mm)`,
  });
  root.appendChild(element);
};

const createVectorDisplay = (
  root: HTMLDivElement,
  schema: BoletoSchema,
  display: BoletoLayout['vectorDisplays'][number],
): void => {
  const child = createChildRoot(root, schema, display.x, display.y, display.width, display.height);
  child.style.overflow = 'visible';
  child.dataset.boletoPrimitive = display.id;
  child.dataset.boletoVectorDisplay = display.id;
  child.dataset.boletoVectorValue = display.value;
  child.dataset.glyphHeightMm = String(display.glyphHeight);
  child.dataset.strokeWidthMm = String(display.strokeWidth);

  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${String(display.width)} ${String(display.height)}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', display.value);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  const title = document.createElementNS(namespace, 'title');
  title.textContent = display.value;
  svg.appendChild(title);
  for (const segment of display.segments) {
    const line = document.createElementNS(namespace, 'line');
    line.setAttribute('x1', String(segment.x1));
    line.setAttribute('y1', String(segment.y1));
    line.setAttribute('x2', String(segment.x2));
    line.setAttribute('y2', String(segment.y2));
    line.setAttribute('stroke', '#000000');
    line.setAttribute('stroke-width', String(display.strokeWidth));
    line.setAttribute('stroke-linecap', display.lineCap);
    svg.appendChild(line);
  }
  child.appendChild(svg);
};

const asViewerArgs = <T extends Schema>(
  arg: UIRenderProps<BoletoSchema>,
  rootElement: HTMLDivElement,
  schema: T,
  value: string,
): UIRenderProps<T> => ({
  ...arg,
  mode: 'viewer',
  rootElement,
  schema,
  value,
  onChange: undefined,
  stopEditing: undefined,
});

const decodeLogoElement = async (rootElement: HTMLDivElement): Promise<void> => {
  const logo = rootElement.querySelector('img');
  if (!(logo instanceof HTMLImageElement)) {
    throw new TypeError(`${BOLETO_ERROR_PREFIX} Institution logo renderer did not create an image`);
  }
  if (typeof logo.decode !== 'function') {
    return;
  }

  try {
    await logo.decode();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${BOLETO_ERROR_PREFIX} Institution logo cannot be decoded: ${detail}`);
  }
};

export const uiRender = async (arg: UIRenderProps<BoletoSchema>): Promise<void> => {
  const { rootElement, schema } = arg;
  Object.assign(rootElement.style, {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontFamily: "'Open Sans', sans-serif",
  });

  try {
    validateBoletoSchema(schema);
    const data = parseBoletoData(arg.value);
    const layout = buildBoletoLayout(data, schema, formatDigitableLine(data.barcode));
    for (const primitive of layout.images) {
      await preflightBoletoLogo(primitive.value, arg._cache);
    }
    const resolvedTextSchemas = await preflightBoletoLayout({
      layout,
      font: arg.options.font,
      _cache: arg._cache,
    });
    const stagedRoot = document.createElement('div');

    for (const line of layout.lines) {
      createLine(stagedRoot, schema, line);
    }
    for (const display of layout.vectorDisplays) {
      createVectorDisplay(stagedRoot, schema, display);
    }

    for (const primitive of layout.texts) {
      const resolvedSchema = resolvedTextSchemas.get(primitive.id);
      if (!resolvedSchema) {
        throw new Error(
          `[@pdfweave/schemas/boleto] Missing resolved text schema for "${primitive.id}"`,
        );
      }
      const child = createChildRoot(
        stagedRoot,
        schema,
        primitive.x,
        primitive.y,
        primitive.width,
        primitive.height,
      );
      child.style.opacity = String(primitive.opacity ?? 1);
      child.dataset.boletoPrimitive = primitive.id;
      await text.ui(asViewerArgs(arg, child, resolvedSchema, getBoletoTextValue(primitive)));
    }

    for (const primitive of layout.images) {
      const child = createChildRoot(
        stagedRoot,
        schema,
        primitive.x,
        primitive.y,
        primitive.width,
        primitive.height,
      );
      await image.ui(
        asViewerArgs(
          arg,
          child,
          {
            ...(image.propPanel.defaultSchema as Schema),
            name: '__boleto-institution-logo',
            type: 'image',
            content: '',
            position: { x: 0, y: 0 },
            width: primitive.width,
            height: primitive.height,
            rotate: 0,
            opacity: 1,
            objectFit: 'contain',
            imagePosition: { x: 'center', y: 'middle' },
            readOnly: true,
          },
          primitive.value,
        ),
      );
      await decodeLogoElement(child);
    }

    if (layout.barcode) {
      const barcodeRoot = createChildRoot(
        stagedRoot,
        schema,
        layout.barcode.x,
        layout.barcode.y,
        layout.barcode.width,
        layout.barcode.height,
      );
      barcodeRoot.dataset.boletoPrimitive = 'barcode';
      const barcodeSchema: BarcodeSchema = {
        ...(barcodes.itf.propPanel.defaultSchema as BarcodeSchema),
        name: '__boleto-barcode',
        type: 'itf',
        content: '',
        position: { x: 0, y: 0 },
        width: layout.barcode.width,
        height: layout.barcode.height,
        rotate: 0,
        opacity: 1,
        backgroundColor: '#ffffff',
        barColor: '#000000',
        includetext: false,
        padding: 0,
        paddingtop: 0,
        paddingleft: 0,
        paddingright: 0,
        paddingbottom: 0,
        showBorder: false,
        format: 'svg',
        readOnly: true,
      };
      await barcodes.itf.ui(asViewerArgs(arg, barcodeRoot, barcodeSchema, layout.barcode.value));
    }
    rootElement.replaceChildren(...stagedRoot.childNodes);
  } catch (error) {
    const errorElement = createErrorElm();
    errorElement.dataset.boletoError = 'true';
    errorElement.title = error instanceof Error ? error.message : String(error);
    rootElement.replaceChildren(errorElement);
  }
};
