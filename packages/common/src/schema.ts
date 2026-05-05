import { z } from 'zod';

const langs = ['en', 'zh', 'ja', 'ko', 'ar', 'th', 'pl', 'it', 'de', 'es', 'fr'] as const;

export const Lang = z.enum(langs);
export const Dict = z.object({
  // -----------------used in ui-----------------
  cancel: z.string(),
  close: z.string(),
  set: z.string(),
  clear: z.string(),
  field: z.string(),
  fieldName: z.string(),
  align: z.string(),
  width: z.string(),
  opacity: z.string(),
  height: z.string(),
  rotate: z.string(),
  edit: z.string(),
  required: z.string(),
  editable: z.string(),
  plsInputName: z.string(),
  fieldMustUniq: z.string(),
  notUniq: z.string(),
  noKeyName: z.string(),
  fieldsList: z.string(),
  editField: z.string(),
  type: z.string(),
  errorOccurred: z.string(),
  errorBulkUpdateFieldName: z.string(),
  commitBulkUpdateFieldName: z.string(),
  bulkUpdateFieldName: z.string(),
  addPageAfter: z.string(),
  removePage: z.string(),
  removePageConfirm: z.string(),
  // --------------------validation-------------------
  'validation.uniqueName': z.string(),
  'validation.hexColor': z.string(),
  'validation.dateTimeFormat': z.string(),
  'validation.outOfBounds': z.string(),

  // -----------------used in schemas-----------------
  'schemas.color': z.string(),
  'schemas.borderWidth': z.string(),
  'schemas.borderColor': z.string(),
  'schemas.backgroundColor': z.string(),
  'schemas.textColor': z.string(),
  'schemas.bgColor': z.string(),
  'schemas.horizontal': z.string(),
  'schemas.vertical': z.string(),
  'schemas.left': z.string(),
  'schemas.center': z.string(),
  'schemas.right': z.string(),
  'schemas.top': z.string(),
  'schemas.middle': z.string(),
  'schemas.bottom': z.string(),
  'schemas.padding': z.string(),
  'schemas.scale': z.string(),
  'schemas.showBorder': z.string(),
  'schemas.outputFormat': z.string(),
  'schemas.altText': z.string(),
  'schemas.textYOffset': z.string(),

  'schemas.qr.eclevel': z.string(),
  'schemas.qr.version': z.string(),
  'schemas.qr.mask': z.string(),
  'schemas.qr.qzone': z.string(),

  'schemas.pdf417.columns': z.string(),
  'schemas.pdf417.rows': z.string(),
  'schemas.pdf417.compact': z.string(),
  'schemas.pdf417.eclevel': z.string(),

  'schemas.text.fontName': z.string(),
  'schemas.text.size': z.string(),
  'schemas.text.spacing': z.string(),
  'schemas.text.textAlign': z.string(),
  'schemas.text.verticalAlign': z.string(),
  'schemas.text.lineHeight': z.string(),
  'schemas.text.min': z.string(),
  'schemas.text.max': z.string(),
  'schemas.text.fit': z.string(),
  'schemas.text.dynamicFontSize': z.string(),
  'schemas.text.format': z.string(),
  'schemas.text.plain': z.string(),
  'schemas.text.inlineMarkdown': z.string(),
  'schemas.text.markdownFonts': z.string(),
  'schemas.text.boldFont': z.string(),
  'schemas.text.italicFont': z.string(),
  'schemas.text.boldItalicFont': z.string(),
  'schemas.text.codeFont': z.string(),
  'schemas.text.variantFallback': z.string(),
  'schemas.text.synthetic': z.string(),
  'schemas.text.error': z.string(),
  'schemas.radius': z.string(),

  'schemas.mvt.typingInstructions': z.string(),
  'schemas.mvt.sampleField': z.string(),
  'schemas.mvt.variablesSampleData': z.string(),
  'schemas.mvt.placeholderDynamicVariable': z.string(),

  'schemas.barcodes.barColor': z.string(),
  'schemas.barcodes.includetext': z.string(),

  'schemas.table.alternateBackgroundColor': z.string(),
  'schemas.table.tableStyle': z.string(),
  'schemas.table.showHead': z.string(),
  'schemas.table.repeatHead': z.string(),
  'schemas.table.headStyle': z.string(),
  'schemas.table.bodyStyle': z.string(),
  'schemas.table.columnStyle': z.string(),

  'schemas.date.format': z.string(),
  'schemas.date.locale': z.string(),

  'schemas.select.options': z.string(),
  'schemas.select.optionPlaceholder': z.string(),

  'schemas.radioGroup.groupName': z.string(),
});
export const Mode = z.enum(['viewer', 'form', 'designer']);

export const ColorType = z.enum(['rgb', 'cmyk']).optional();

export const Size = z.object({ height: z.number(), width: z.number() });

const AnchorRef = z.object({ schemaId: z.string() });

const HorizontalAnchorRule = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pageLeft'), offsetMm: z.number() }),
  z.object({ mode: z.literal('afterRightEdge'), ref: AnchorRef, offsetMm: z.number() }),
  z.object({ mode: z.literal('alignRightEdge'), ref: AnchorRef, offsetMm: z.number().optional() }),
]);

const VerticalAnchorRule = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pageTop'), offsetMm: z.number() }),
  z.object({ mode: z.literal('belowBottomEdge'), ref: AnchorRef, offsetMm: z.number() }),
]);

const SchemaLayoutRule = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('absolute') }),
  z.object({ mode: z.literal('anchored'), x: HorizontalAnchorRule, y: VerticalAnchorRule }),
]);

export const SchemaBindingColumn = z
  .object({
    path: z.string(),
    label: z.string().optional(),
    format: z.unknown().optional(),
    widthPercentage: z.number().optional(),
  })
  .passthrough();

export const SchemaBinding = z
  .object({
    path: z.string(),
    format: z.unknown().optional(),
    columns: z.array(SchemaBindingColumn).optional(),
  })
  .passthrough();

export const Schema = z
  .object({
    name: z.string(),
    id: z.string().optional(),
    type: z.string(),
    content: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    width: z.number(),
    height: z.number(),
    rotate: z.number().optional(),
    opacity: z.number().optional(),
    readOnly: z.boolean().optional(),
    required: z.boolean().optional(),
    binding: SchemaBinding.optional(),
    layout: SchemaLayoutRule.optional(),
    __bodyRange: z.object({ start: z.number(), end: z.number().optional() }).optional(),
    __isSplit: z.boolean().optional(),
  })
  .passthrough();

const SchemaForUIAdditionalInfo = z.object({ id: z.string() });
export const SchemaForUI = Schema.merge(SchemaForUIAdditionalInfo);

// Use z.custom<T>() for binary blob types instead of z.any().refine() with a
// generic ZodSchema<Uint8Array<ArrayBuffer>>. The latter is inferred as
// `unknown` by TypeScript 5.x+ (the generic Uint8Array<ArrayBuffer> form
// regressed inference), which then propagates up and makes the exported
// Template type effectively unusable for consumers. Switching to z.custom
// preserves the precise output type and matches the rest of the schema's
// validator-style declarations.
// Original upstream issue: https://github.com/pdfme/pdfme/issues/1021
const ArrayBufferSchema = z.custom<ArrayBuffer>((v) => v instanceof ArrayBuffer);
const Uint8ArraySchema = z.custom<Uint8Array>(
  (v) => v instanceof Uint8Array && v.buffer instanceof ArrayBuffer,
);

export const BlankPdf = z.object({
  width: z.number(),
  height: z.number(),
  padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  staticSchema: z.array(Schema).optional(),
});

export const CustomPdf = z.union([z.string(), ArrayBufferSchema, Uint8ArraySchema]);

export const StationeryPdf = z.object({
  stationeryPdf: z.union([z.string(), ArrayBufferSchema, Uint8ArraySchema]),
  width: z.number(),
  height: z.number(),
  padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  staticSchema: z.array(Schema).optional(),
});

export const BasePdf = z.union([CustomPdf, BlankPdf, StationeryPdf]);

// Legacy keyed structure for BC - we convert to SchemaPageArray on import
export const LegacySchemaPageArray = z.array(z.record(z.string(), Schema));
export const SchemaPageArray = z.array(z.array(Schema));

export const Template = z
  .object({
    schemas: SchemaPageArray,
    basePdf: BasePdf,
    pdfmeVersion: z.string().optional(),
  })
  .passthrough();

export const Inputs = z.array(z.record(z.string(), z.any())).min(1);

export const Font = z.record(
  z.string(),
  z.object({
    data: z.union([z.string(), ArrayBufferSchema, Uint8ArraySchema]),
    fallback: z.boolean().optional(),
    subset: z.boolean().optional(),
  }),
);

export const Plugin = z
  .object({
    ui: z.any(),
    pdf: z.any(),
    propPanel: z.object({
      schema: z.unknown(),
      widgets: z.record(z.string(), z.any()).optional(),
      defaultSchema: Schema,
    }),
    icon: z.string().optional(),
  })
  .passthrough();

export const CommonOptions = z.object({ font: Font.optional() }).passthrough();

const CommonProps = z.object({
  template: Template,
  options: CommonOptions.optional(),
  plugins: z.record(z.string(), Plugin).optional(),
});

// -------------------generate-------------------

export const GeneratorOptions = CommonOptions.extend({
  colorType: ColorType,
  author: z.string().optional(),
  creationDate: z.date().optional(),
  creator: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  lang: Lang.optional(),
  modificationDate: z.date().optional(),
  producer: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export const GenerateProps = CommonProps.extend({
  inputs: Inputs,
  options: GeneratorOptions.optional(),
}).strict();

// ---------------------ui------------------------

const DesignDataPackage = z
  .object({
    data: z.unknown().optional(),
    schema: z.unknown().optional(),
  })
  .passthrough();

export const UIOptions = CommonOptions.extend({
  lang: Lang.optional(),
  labels: z.record(z.string(), z.string()).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  icons: z.record(z.string(), z.string()).optional(),
  designData: DesignDataPackage.optional(),
  requiredByDefault: z.boolean().optional(),
  maxZoom: z.number().optional(),
  sidebarOpen: z.boolean().optional(),
  zoomLevel: z.number().optional(),
});

const HTMLElementSchema: z.ZodSchema<HTMLElement> = z.any().refine((v) => v instanceof HTMLElement);

export const UIProps = CommonProps.extend({
  domContainer: HTMLElementSchema,
  options: UIOptions.optional(),
});

export const PreviewProps = UIProps.extend({ inputs: Inputs }).strict();

export const DesignerProps = UIProps.extend({}).strict();
