import { Plugin, type PDFRenderProps, type UIRenderProps, mm2pt } from '@pdfweave/common';
import type { Schema } from '@pdfweave/common';
import { Link as LinkIcon } from 'lucide';
import { DEFAULT_OPACITY, HEX_COLOR_PATTERN } from '../constants.js';
import { convertForPdfLayoutProps, createSvgStr, hex2PrintingColor } from '../utils.js';

export type LinkSchema = Schema & {
  type: 'link';
  url: string;
  label?: string;
  color?: string;
  underline?: boolean;
  fontSize?: number;
};

const DEFAULT_LINK_COLOR = '#0066cc';
const DEFAULT_LINK_FONT_SIZE = 12;

const getUrl = (schema: LinkSchema, value: string) => schema.url || value;
const getLabel = (schema: LinkSchema, value: string) => schema.label || value || schema.url;

const addLinkAnnotation = (arg: PDFRenderProps<LinkSchema> & { url: string }) => {
  const { schema, page, pdfDoc, pdfLib, url } = arg;
  const pageHeight = page.getHeight();
  const {
    position: { x, y },
    width,
    height,
  } = convertForPdfLayoutProps({ schema, pageHeight, applyRotateTranslate: false });

  const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    F: 4,
    A: {
      Type: 'Action',
      S: 'URI',
      URI: pdfLib.PDFString.of(url),
    },
  });
  const annotationRef = pdfDoc.context.register(annotation);
  page.node.addAnnot(annotationRef);
};

const pdf = (arg: PDFRenderProps<LinkSchema>) => {
  const { schema, value, page, options } = arg;
  const url = getUrl(schema, value);
  if (!url) return;

  addLinkAnnotation({ ...arg, url });

  const label = getLabel(schema, value);
  if (!label) return;

  const pageHeight = page.getHeight();
  const {
    position: { x, y },
    width,
    height,
    opacity,
  } = convertForPdfLayoutProps({ schema, pageHeight, applyRotateTranslate: false });
  const fontSize = schema.fontSize ?? DEFAULT_LINK_FONT_SIZE;
  const textY = y + Math.max(0, (height - fontSize) / 2);
  const color = hex2PrintingColor(schema.color || DEFAULT_LINK_COLOR, options.colorType);

  page.drawText(label, {
    x,
    y: textY,
    size: fontSize,
    color,
    opacity,
    maxWidth: width,
  });

  if (schema.underline) {
    page.drawLine({
      start: { x, y: textY - fontSize * 0.15 },
      end: {
        x: x + Math.min(width, mm2pt(label.length * fontSize * 0.4)),
        y: textY - fontSize * 0.15,
      },
      thickness: Math.max(0.5, fontSize / 14),
      color,
      opacity,
    });
  }
};

const ui = (arg: UIRenderProps<LinkSchema>) => {
  const { schema, value, rootElement, mode } = arg;
  const url = getUrl(schema, value);
  const label = getLabel(schema, value);
  const anchor = document.createElement('a');
  anchor.href = url || '#';
  anchor.title = url;
  anchor.textContent = label || url;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  anchor.style.display = 'flex';
  anchor.style.width = '100%';
  anchor.style.height = '100%';
  anchor.style.alignItems = 'center';
  anchor.style.color = schema.color || DEFAULT_LINK_COLOR;
  anchor.style.fontSize = `${schema.fontSize ?? DEFAULT_LINK_FONT_SIZE}pt`;
  anchor.style.textDecoration = schema.underline === false ? 'none' : 'underline';
  anchor.style.overflow = 'hidden';
  anchor.style.whiteSpace = 'pre-wrap';
  anchor.style.wordBreak = 'break-word';

  if (mode !== 'viewer') {
    anchor.addEventListener('click', (event) => event.preventDefault());
  }

  rootElement.appendChild(anchor);
};

const link: Plugin<LinkSchema> = {
  pdf,
  ui,
  propPanel: {
    schema: ({ i18n }) => ({
      url: {
        title: i18n('schemas.link.url') || 'URL',
        type: 'string',
        widget: 'input',
        required: true,
        span: 24,
      },
      label: {
        title: i18n('schemas.link.label') || 'Label',
        type: 'string',
        widget: 'input',
        span: 24,
      },
      color: {
        title: i18n('schemas.color'),
        type: 'string',
        widget: 'color',
        props: { disabledAlpha: true },
        rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
        span: 12,
      },
      fontSize: {
        title: i18n('schemas.text.size'),
        type: 'number',
        widget: 'inputNumber',
        props: { min: 0 },
        span: 12,
      },
      underline: {
        title: i18n('schemas.link.underline') || 'Underline',
        type: 'boolean',
        widget: 'checkbox',
        span: 12,
      },
    }),
    defaultSchema: {
      name: '',
      type: 'link',
      content: '',
      position: { x: 0, y: 0 },
      width: 60,
      height: 10,
      url: 'https://example.com',
      label: 'Example link',
      color: DEFAULT_LINK_COLOR,
      underline: true,
      fontSize: DEFAULT_LINK_FONT_SIZE,
      opacity: DEFAULT_OPACITY,
      readOnly: true,
    },
  },
  icon: createSvgStr(LinkIcon),
};

export default link;
