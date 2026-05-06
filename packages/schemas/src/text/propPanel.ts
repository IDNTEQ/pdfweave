import {
  DEFAULT_FONT_NAME,
  PropPanel,
  PropPanelWidgetProps,
  PropPanelSchema,
  ChangeSchemaItem,
  getFallbackFontName,
} from '@pdfweave/common';
import type { TextSchema } from './types.js';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_ALIGNMENT,
  DEFAULT_VERTICAL_ALIGNMENT,
  DEFAULT_CHARACTER_SPACING,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_FONT_COLOR,
  DYNAMIC_FIT_VERTICAL,
  DYNAMIC_FIT_HORIZONTAL,
  DEFAULT_DYNAMIC_FIT,
  DEFAULT_DYNAMIC_MIN_FONT_SIZE,
  DEFAULT_DYNAMIC_MAX_FONT_SIZE,
  DEFAULT_TEXT_FORMAT,
  TEXT_FORMAT_INLINE_MARKDOWN,
  TEXT_FORMAT_PLAIN,
  DEFAULT_FONT_VARIANT_FALLBACK,
  FONT_VARIANT_FALLBACK_ERROR,
  FONT_VARIANT_FALLBACK_PLAIN,
  FONT_VARIANT_FALLBACK_SYNTHETIC,
  TEXT_OVERFLOW_EXPAND,
  TEXT_OVERFLOW_HIDDEN,
  TEXT_OVERFLOW_VISIBLE,
} from './constants.js';
import { DEFAULT_OPACITY, HEX_COLOR_PATTERN } from '../constants.js';
import { getExtraFormatterSchema } from './extraFormatter.js';

const UseDynamicFontSize = (props: PropPanelWidgetProps) => {
  const { rootElement, changeSchemas, activeSchema, i18n } = props;
  const disabled = (activeSchema as { overflow?: unknown })?.overflow === TEXT_OVERFLOW_EXPAND;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean((activeSchema as { dynamicFontSize?: unknown })?.dynamicFontSize);
  checkbox.disabled = disabled;
  checkbox.title = disabled ? 'Disabled while Overflow is Expand' : '';
  checkbox.onchange = (e: Event) => {
    if (disabled) return;
    const val = (e.target as HTMLInputElement).checked
      ? {
          min: DEFAULT_DYNAMIC_MIN_FONT_SIZE,
          max: DEFAULT_DYNAMIC_MAX_FONT_SIZE,
          fit: DEFAULT_DYNAMIC_FIT,
        }
      : undefined;
    changeSchemas([{ key: 'dynamicFontSize', value: val, schemaId: activeSchema.id }]);
  };
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.innerText = i18n('schemas.text.dynamicFontSize') || '';
  span.style.cssText = 'margin-left: 0.5rem';
  span.title = disabled ? 'Disabled while Overflow is Expand' : '';
  label.style.cssText = 'display: flex; width: 100%;';
  label.title = disabled ? 'Disabled while Overflow is Expand' : '';
  label.appendChild(checkbox);
  label.appendChild(span);
  rootElement.appendChild(label);
};

const OverflowWidget = (props: PropPanelWidgetProps) => {
  const { rootElement, changeSchemas, activeSchema, i18n } = props;

  const wrapper = document.createElement('label');
  wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; width: 100%;';

  const label = document.createElement('span');
  label.innerText = i18n('schemas.text.overflow') || 'Overflow';

  const select = document.createElement('select');
  select.style.cssText = 'width: 100%;';
  const activeOverflow = (activeSchema as { overflow?: string }).overflow;
  select.value =
    activeOverflow === TEXT_OVERFLOW_EXPAND || activeOverflow === TEXT_OVERFLOW_HIDDEN
      ? activeOverflow
      : TEXT_OVERFLOW_VISIBLE;

  [
    {
      label: 'Visible',
      value: TEXT_OVERFLOW_VISIBLE,
      title: 'Visible (default - content may extend past the box)',
    },
    {
      label: 'Hidden',
      value: TEXT_OVERFLOW_HIDDEN,
      title: 'Hidden (clip content to the box; data past the box is hidden)',
    },
    {
      label: 'Expand',
      value: TEXT_OVERFLOW_EXPAND,
      title: 'Expand (grow vertically to fit content; splits across pages)',
    },
  ].forEach((optionConfig) => {
    const option = document.createElement('option');
    option.value = optionConfig.value;
    option.text = optionConfig.label;
    option.title = optionConfig.title;
    select.appendChild(option);
  });

  select.onchange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    const changes: ChangeSchemaItem[] = [{ key: 'overflow', value, schemaId: activeSchema.id }];
    if (value === TEXT_OVERFLOW_EXPAND) {
      changes.push({ key: 'dynamicFontSize', value: undefined, schemaId: activeSchema.id });
    }
    changeSchemas(changes);
  };

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  rootElement.appendChild(wrapper);
};

/**
 * Edit `schema.padding` ([top, right, bottom, left] in mm) as a single
 * comma-separated text input. Form-panel libraries don't bind nested arrays
 * cleanly; surfacing as text + parse round-trip keeps the underlying
 * tuple-of-numbers shape that pdf/uiRender expect. pdfme/pdfme#851.
 */
const PaddingTupleWidget = (props: PropPanelWidgetProps) => {
  const { rootElement, changeSchemas, activeSchema } = props;

  const padding = (activeSchema as { padding?: number[] }).padding;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '0,0,0,0';
  input.value = Array.isArray(padding) ? padding.join(',') : '';
  input.style.cssText = 'width: 100%;';
  input.onchange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw === '') {
      changeSchemas([{ key: 'padding', value: undefined, schemaId: activeSchema.id }]);
      return;
    }
    // Accept up to 4 comma-separated numbers; pad/truncate to exactly 4 so
    // downstream code can rely on the tuple shape. Bad tokens → 0.
    const parts = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .map((n) => (Number.isFinite(n) ? n : 0));
    while (parts.length < 4) parts.push(0);
    const tuple = parts.slice(0, 4);
    changeSchemas([{ key: 'padding', value: tuple, schemaId: activeSchema.id }]);
  };
  rootElement.appendChild(input);
};

const UseInlineMarkdown = (props: PropPanelWidgetProps) => {
  const { rootElement, changeSchemas, activeSchema, i18n } = props;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked =
    (activeSchema as { textFormat?: unknown })?.textFormat === TEXT_FORMAT_INLINE_MARKDOWN;
  checkbox.onchange = (e: Event) => {
    const value = (e.target as HTMLInputElement).checked
      ? TEXT_FORMAT_INLINE_MARKDOWN
      : TEXT_FORMAT_PLAIN;
    changeSchemas([{ key: 'textFormat', value, schemaId: activeSchema.id }]);
  };
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.innerText = i18n('schemas.text.inlineMarkdown') || '';
  span.style.cssText = 'margin-left: 0.5rem';
  label.style.cssText = 'display: flex; width: 100%;';
  label.appendChild(checkbox);
  label.appendChild(span);
  rootElement.appendChild(label);
};

export const propPanel: PropPanel<TextSchema> = {
  schema: ({ options, activeSchema, i18n }) => {
    const font = options.font || { [DEFAULT_FONT_NAME]: { data: '', fallback: true } };
    const fontNames = Object.keys(font);
    const fallbackFontName = getFallbackFontName(font);

    const activeTextSchema = activeSchema as unknown as TextSchema;
    const isOverflowExpand = activeTextSchema.overflow === TEXT_OVERFLOW_EXPAND;
    const enableDynamicFont =
      !isOverflowExpand &&
      Boolean((activeSchema as { dynamicFontSize?: unknown })?.dynamicFontSize);
    const hideTextFormat = activeTextSchema.type === 'text' && activeTextSchema.readOnly !== true;
    const enableInlineMarkdown =
      activeTextSchema.textFormat === TEXT_FORMAT_INLINE_MARKDOWN && !hideTextFormat;
    const baseFontName =
      activeTextSchema.fontName && font[activeTextSchema.fontName]
        ? activeTextSchema.fontName
        : fallbackFontName;
    const optionalFontNames = [
      { label: baseFontName, value: '' },
      ...fontNames
        .filter((name) => name !== baseFontName)
        .map((name) => ({ label: name, value: name })),
    ];

    const textSchema: Record<string, PropPanelSchema> = {
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
        span: 6,
        disabled: enableDynamicFont,
        props: { min: 0 },
      },
      characterSpacing: {
        title: i18n('schemas.text.spacing'),
        type: 'number',
        widget: 'inputNumber',
        span: 6,
        props: { min: 0 },
      },
      formatter: getExtraFormatterSchema(i18n),
      lineHeight: {
        title: i18n('schemas.text.lineHeight'),
        type: 'number',
        widget: 'inputNumber',
        props: { step: 0.1, min: 0 },
        span: 8,
      },
      useDynamicFontSize: { type: 'boolean', widget: 'UseDynamicFontSize', bind: false, span: 16 },
      dynamicFontSize: {
        type: 'object',
        widget: 'card',
        column: 3,
        properties: {
          min: {
            title: i18n('schemas.text.min'),
            type: 'number',
            widget: 'inputNumber',
            hidden: !enableDynamicFont,
            props: { min: 0 },
          },
          max: {
            title: i18n('schemas.text.max'),
            type: 'number',
            widget: 'inputNumber',
            hidden: !enableDynamicFont,
            props: { min: 0 },
          },
          fit: {
            title: i18n('schemas.text.fit'),
            type: 'string',
            widget: 'select',
            hidden: !enableDynamicFont,
            props: {
              options: [
                { label: i18n('schemas.horizontal'), value: DYNAMIC_FIT_HORIZONTAL },
                { label: i18n('schemas.vertical'), value: DYNAMIC_FIT_VERTICAL },
              ],
            },
          },
        },
      },
      overflow: { type: 'string', widget: 'OverflowWidget', bind: false, span: 24 },
      fontColor: {
        title: i18n('schemas.textColor'),
        type: 'string',
        widget: 'color',
        props: {
          disabledAlpha: true,
        },
        rules: [
          {
            pattern: HEX_COLOR_PATTERN,
            message: i18n('validation.hexColor'),
          },
        ],
      },
      backgroundColor: {
        title: i18n('schemas.bgColor'),
        type: 'string',
        widget: 'color',
        props: {
          disabledAlpha: true,
        },
        rules: [
          {
            pattern: HEX_COLOR_PATTERN,
            message: i18n('validation.hexColor'),
          },
        ],
      },
      useInlineMarkdown: {
        type: 'boolean',
        widget: 'UseInlineMarkdown',
        bind: false,
        hidden: hideTextFormat,
        span: enableInlineMarkdown ? 12 : 24,
      },
      fontVariantFallback: {
        title: i18n('schemas.text.variantFallback'),
        type: 'string',
        widget: 'select',
        default: DEFAULT_FONT_VARIANT_FALLBACK,
        hidden: !enableInlineMarkdown,
        props: {
          options: [
            { label: i18n('schemas.text.synthetic'), value: FONT_VARIANT_FALLBACK_SYNTHETIC },
            { label: i18n('schemas.text.plain'), value: FONT_VARIANT_FALLBACK_PLAIN },
            { label: i18n('schemas.text.error'), value: FONT_VARIANT_FALLBACK_ERROR },
          ],
        },
        span: 12,
      },
      fontVariants: {
        title: i18n('schemas.text.markdownFonts'),
        type: 'object',
        widget: 'card',
        column: 2,
        hidden: !enableInlineMarkdown,
        properties: {
          bold: {
            title: i18n('schemas.text.boldFont'),
            type: 'string',
            widget: 'select',
            props: { options: optionalFontNames },
          },
          italic: {
            title: i18n('schemas.text.italicFont'),
            type: 'string',
            widget: 'select',
            props: { options: optionalFontNames },
          },
          boldItalic: {
            title: i18n('schemas.text.boldItalicFont'),
            type: 'string',
            widget: 'select',
            props: { options: optionalFontNames },
          },
          code: {
            title: i18n('schemas.text.codeFont'),
            type: 'string',
            widget: 'select',
            props: { options: optionalFontNames },
          },
        },
      },
      // CSS-equivalent text transform applied at render time only; the
      // schema's stored `content` is left untouched. pdfme/pdfme#707.
      textTransform: {
        title: i18n('schemas.text.textTransform') || 'Text transform',
        type: 'string',
        widget: 'select',
        default: 'none',
        props: {
          options: [
            { label: i18n('schemas.text.transformNone') || 'none', value: 'none' },
            { label: i18n('schemas.text.transformUppercase') || 'UPPERCASE', value: 'uppercase' },
            { label: i18n('schemas.text.transformLowercase') || 'lowercase', value: 'lowercase' },
            {
              label: i18n('schemas.text.transformCapitalize') || 'Capitalize',
              value: 'capitalize',
            },
          ],
        },
        span: 12,
      },
      // Optional inner padding (mm) — pdfme/pdfme#851. Backed by a custom
      // widget (`PaddingTupleWidget`) that surfaces the [top,right,bottom,
      // left] tuple as a comma-separated string, then parses it back to an
      // array on change. Nested arrays in the form-panel framework are
      // awkward to bind; the string round-trip keeps the underlying schema
      // shape (`number[4]`) unchanged.
      padding: {
        title: i18n('schemas.text.padding') || 'Padding (top,right,bottom,left mm)',
        type: 'void',
        widget: 'PaddingTupleWidget',
        span: 24,
      },
      // Optional decorative border (mm / hex). Standard `card` group whose
      // sub-properties bind directly to `schema.border.{width,color,radius}`
      // — same pattern position uses for x/y. pdfme/pdfme#851.
      border: {
        title: i18n('schemas.text.border') || 'Border',
        type: 'object',
        widget: 'card',
        column: 3,
        properties: {
          width: {
            title: i18n('schemas.text.borderWidth') || 'Width (mm)',
            type: 'number',
            widget: 'inputNumber',
            props: { min: 0, step: 0.1 },
          },
          color: {
            title: i18n('schemas.text.borderColor') || 'Color',
            type: 'string',
            widget: 'color',
            props: { disabledAlpha: true },
            rules: [{ pattern: HEX_COLOR_PATTERN, message: i18n('validation.hexColor') }],
          },
          radius: {
            title: i18n('schemas.text.borderRadius') || 'Radius (mm)',
            type: 'number',
            widget: 'inputNumber',
            props: { min: 0, step: 0.1 },
          },
        },
      },
    };

    return textSchema;
  },
  widgets: { UseDynamicFontSize, OverflowWidget, UseInlineMarkdown, PaddingTupleWidget },
  defaultSchema: {
    name: '',
    type: 'text',
    content: 'Type Something...',
    position: { x: 0, y: 0 },
    width: 45,
    height: 10,
    // If the value of "rotate" is set to undefined or not set at all, rotation will be disabled in the UI.
    // Check this document: https://pdfme.com//docs/custom-schemas#learning-how-to-create-from-pdfmeschemas-code
    rotate: 0,
    alignment: DEFAULT_ALIGNMENT,
    verticalAlignment: DEFAULT_VERTICAL_ALIGNMENT,
    fontSize: DEFAULT_FONT_SIZE,
    textFormat: DEFAULT_TEXT_FORMAT,
    fontVariantFallback: DEFAULT_FONT_VARIANT_FALLBACK,
    lineHeight: DEFAULT_LINE_HEIGHT,
    characterSpacing: DEFAULT_CHARACTER_SPACING,
    dynamicFontSize: undefined,
    overflow: TEXT_OVERFLOW_VISIBLE,
    fontColor: DEFAULT_FONT_COLOR,
    fontName: undefined,
    backgroundColor: '',
    opacity: DEFAULT_OPACITY,
    strikethrough: false,
    underline: false,
  },
};
