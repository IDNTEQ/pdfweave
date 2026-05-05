import * as fontkit from 'fontkit';
import {
  Schema,
  Plugins,
  GeneratorOptions,
  Template,
  PDFRenderProps,
  LayoutMeasureProps,
  LayoutMeasureResult,
  getB64BasePdf,
  isBlankPdf,
  isStationeryPdf,
  treatsLikeBlank,
  mm2pt,
  pluginRegistry,
  BasePdf,
  getValueByPath,
} from '@pdfweave/common';
import { builtInPlugins } from '@pdfweave/schemas/builtins';
import { PDFPage, PDFDocument, PDFEmbeddedPage, TransformationMatrix } from '@pdfweave/pdf-lib';
import { TOOL_NAME } from './constants.js';
import type { EmbedPdfBox } from './types.js';

/**
 * Resources produced by the one-time basePdf embed step. Lives for a single
 * generate() invocation and is reused for every input row.
 *
 * - For a custom PDF basePdf, this captures the already-embedded source pages
 *   plus their boxes — so the same PDF parse + embedPages() call doesn't run
 *   per-input (see pdfme#729 — O(N) re-parsing of the same basePdf was the
 *   bottleneck for batch generation against a heavy basePdf).
 * - For a StationeryPdf, this captures the single embedded stationery page
 *   that gets `drawPage`d onto a fresh blank page per dynamic-schema page.
 * - For a BlankPdf, no resources are captured: page creation is already cheap.
 */
export type BasePdfResources =
  | {
      kind: 'blank';
      width: number;
      height: number;
    }
  | {
      kind: 'stationery';
      width: number;
      height: number;
      embeddedStationery: PDFEmbeddedPage;
    }
  | {
      kind: 'custom';
      basePages: PDFEmbeddedPage[];
      embedPdfBoxes: EmbedPdfBox[];
    };

/**
 * Performs the expensive basePdf parse + embed exactly once per generate()
 * call. The returned BasePdfResources is then handed to materializeBasePages()
 * for each input row — see pdfme#729 for the original perf report.
 */
export const prepareBasePdfResources = async (arg: {
  basePdf: BasePdf;
  pdfDoc: PDFDocument;
}): Promise<BasePdfResources> => {
  const { basePdf, pdfDoc } = arg;

  if (isStationeryPdf(basePdf)) {
    const width = mm2pt(basePdf.width);
    const height = mm2pt(basePdf.height);
    const willLoadPdf = await getB64BasePdf(basePdf.stationeryPdf);
    const stationeryDoc = await PDFDocument.load(willLoadPdf);
    const stationeryPages = stationeryDoc.getPages();
    if (stationeryPages.length === 0) {
      throw new Error('[@pdfweave/generator] StationeryPdf has no pages.');
    }
    const [embeddedStationery] = await pdfDoc.embedPages([stationeryPages[0]]);
    return { kind: 'stationery', width, height, embeddedStationery };
  }

  if (isBlankPdf(basePdf)) {
    return { kind: 'blank', width: mm2pt(basePdf.width), height: mm2pt(basePdf.height) };
  }

  const willLoadPdf = await getB64BasePdf(basePdf);
  const embedPdf = await PDFDocument.load(willLoadPdf);
  const embedPdfPages = embedPdf.getPages();
  const embedPdfBoxes: EmbedPdfBox[] = embedPdfPages.map((p) => ({
    mediaBox: p.getMediaBox(),
    bleedBox: p.getBleedBox(),
    trimBox: p.getTrimBox(),
    // Only record the CropBox when the source page actually authored one.
    // pdf-lib's getCropBox() falls back to MediaBox when absent, so we use
    // hasCropBox() to disambiguate "explicit crop" from "inherited default"
    // — the latter must remain a no-op for schema positioning to preserve
    // existing behavior. See pdfme/pdfme#623.
    cropBox: p.hasCropBox() ? p.getCropBox() : undefined,
  }));
  const boundingBoxes = embedPdfPages.map((p) => {
    const { x, y, width, height } = p.getMediaBox();
    return { left: x, bottom: y, right: width, top: height + y };
  });
  const transformationMatrices = embedPdfPages.map(
    () => [1, 0, 0, 1, 0, 0] as TransformationMatrix,
  );
  const basePages = await pdfDoc.embedPages(embedPdfPages, boundingBoxes, transformationMatrices);
  return { kind: 'custom', basePages, embedPdfBoxes };
};

/**
 * Builds the per-input basePages array from the cached resources. Custom-PDF
 * embedded pages are reused as-is (the embed has happened once); blank /
 * stationery variants still produce fresh PDFPage instances per dynamic
 * schema page since dynamic content varies per input.
 */
export const materializeBasePages = (arg: {
  template: Template;
  pdfDoc: PDFDocument;
  resources: BasePdfResources;
}): { basePages: (PDFEmbeddedPage | PDFPage)[]; embedPdfBoxes: EmbedPdfBox[] } => {
  const { template, pdfDoc, resources } = arg;
  const schemas = (template as { schemas: Schema[][] }).schemas;

  if (resources.kind === 'stationery') {
    const { width, height, embeddedStationery } = resources;
    const basePages = schemas.map(() => {
      const page = PDFPage.create(pdfDoc);
      page.setSize(width, height);
      page.drawPage(embeddedStationery, { x: 0, y: 0, width, height });
      return page;
    });
    const embedPdfBoxes = schemas.map(() => ({
      mediaBox: { x: 0, y: 0, width, height },
      bleedBox: { x: 0, y: 0, width, height },
      trimBox: { x: 0, y: 0, width, height },
    }));
    return { basePages, embedPdfBoxes };
  }

  if (resources.kind === 'blank') {
    const { width, height } = resources;
    const basePages = schemas.map(() => {
      const page = PDFPage.create(pdfDoc);
      page.setSize(width, height);
      return page;
    });
    const embedPdfBoxes = schemas.map(() => ({
      mediaBox: { x: 0, y: 0, width, height },
      bleedBox: { x: 0, y: 0, width, height },
      trimBox: { x: 0, y: 0, width, height },
    }));
    return { basePages, embedPdfBoxes };
  }

  // Custom PDF: page count is fixed by the source PDF, not the dynamic
  // schemas. Reuse the cached embedded pages directly.
  return { basePages: resources.basePages, embedPdfBoxes: resources.embedPdfBoxes };
};

/**
 * Backwards-compatible wrapper that runs the prepare + materialize steps in a
 * single call. Retained so external consumers (and pre-existing tests) still
 * work, but generate() no longer uses it — the perf fix from pdfme#729 lives
 * in the caller, which calls prepareBasePdfResources() once and
 * materializeBasePages() per input.
 */
export const getEmbedPdfPages = async (arg: { template: Template; pdfDoc: PDFDocument }) => {
  const { template, pdfDoc } = arg;
  const basePdf = (template as { basePdf: BasePdf }).basePdf;
  const resources = await prepareBasePdfResources({ basePdf, pdfDoc });
  return materializeBasePages({ template, pdfDoc, resources });
};

export const validateRequiredFields = (template: Template, inputs: Record<string, unknown>[]) => {
  template.schemas.forEach((schemaPage: Schema[]) =>
    schemaPage.forEach((schema: Schema) => {
      const inputPath = schema.binding?.path || schema.name;
      if (
        schema.required &&
        !schema.readOnly &&
        !inputs.some((input) => {
          const value = getValueByPath(input, inputPath);
          return value !== undefined && value !== null && value !== '';
        })
      ) {
        throw new Error(
          `[@pdfweave/generator] input for '${inputPath}' is required to generate this PDF`,
        );
      }
    }),
  );
};

export const preprocessing = async (arg: { template: Template; userPlugins: Plugins }) => {
  const { template, userPlugins } = arg;
  const { schemas, basePdf } = template as { schemas: Schema[][]; basePdf: BasePdf };
  const staticSchema: Schema[] = treatsLikeBlank(basePdf) ? (basePdf.staticSchema ?? []) : [];

  const pdfDoc = await PDFDocument.create();
  // @ts-expect-error registerFontkit method is not in type definitions but exists at runtime
  pdfDoc.registerFontkit(fontkit);

  const plugins = pluginRegistry(
    Object.values(userPlugins).length > 0 ? userPlugins : builtInPlugins,
  );

  const schemaTypes = Array.from(
    new Set(
      schemas
        .flatMap((schemaPage: Schema[]) => schemaPage.map((schema: Schema) => schema.type))
        .concat(staticSchema.map((schema: Schema) => schema.type)),
    ),
  );

  const renderObj = schemaTypes.reduce(
    (
      acc: Record<
        string,
        (arg: PDFRenderProps<Schema & { [key: string]: unknown }>) => Promise<void> | void
      >,
      type: string,
    ) => {
      const plugin = plugins.findByType(type);

      if (!plugin || !plugin.pdf) {
        throw new Error(`[@pdfweave/generator] Plugin or renderer for type ${type} not found.
Check this document: https://pdfme.com/docs/custom-schemas`);
      }

      // Use type assertion to handle the pdf function with schema type
      return {
        ...acc,
        [type]: plugin.pdf as (
          arg: PDFRenderProps<Schema & { [key: string]: unknown }>,
        ) => Promise<void> | void,
      };
    },
    {} as Record<
      string,
      (arg: PDFRenderProps<Schema & { [key: string]: unknown }>) => Promise<void> | void
    >,
  );

  const measureObj = schemaTypes.reduce(
    (
      acc: Record<
        string,
        (arg: LayoutMeasureProps<Schema & { [key: string]: unknown }>) =>
          | Promise<LayoutMeasureResult>
          | LayoutMeasureResult
      >,
      type: string,
    ) => {
      const plugin = plugins.findByType(type);

      if (!plugin || !plugin.measure) {
        return acc;
      }

      return {
        ...acc,
        [type]: plugin.measure as (
          arg: LayoutMeasureProps<Schema & { [key: string]: unknown }>,
        ) => Promise<LayoutMeasureResult> | LayoutMeasureResult,
      };
    },
    {} as Record<
      string,
      (arg: LayoutMeasureProps<Schema & { [key: string]: unknown }>) =>
        | Promise<LayoutMeasureResult>
        | LayoutMeasureResult
    >,
  );

  return { pdfDoc, renderObj, measureObj };
};

export const postProcessing = (props: { pdfDoc: PDFDocument; options: GeneratorOptions }) => {
  const { pdfDoc, options } = props;
  const {
    author = TOOL_NAME,
    creationDate = new Date(),
    creator = TOOL_NAME,
    keywords = [],
    lang = 'en',
    modificationDate = new Date(),
    producer = TOOL_NAME,
    subject = '',
    title = '',
  } = options;
  pdfDoc.setAuthor(author);
  pdfDoc.setCreationDate(creationDate);
  pdfDoc.setCreator(creator);
  pdfDoc.setKeywords(keywords);
  pdfDoc.setLanguage(lang);
  pdfDoc.setModificationDate(modificationDate);
  pdfDoc.setProducer(producer);
  pdfDoc.setSubject(subject);
  pdfDoc.setTitle(title);
};

export const insertPage = (arg: {
  basePage: PDFEmbeddedPage | PDFPage;
  embedPdfBox: EmbedPdfBox;
  pdfDoc: PDFDocument;
}) => {
  const { basePage, embedPdfBox, pdfDoc } = arg;
  const size = basePage instanceof PDFEmbeddedPage ? basePage.size() : basePage.getSize();
  const insertedPage =
    basePage instanceof PDFEmbeddedPage
      ? pdfDoc.addPage([size.width, size.height])
      : pdfDoc.addPage(basePage);

  if (basePage instanceof PDFEmbeddedPage) {
    insertedPage.drawPage(basePage);
    const { mediaBox, bleedBox, trimBox, cropBox } = embedPdfBox;
    insertedPage.setMediaBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
    insertedPage.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height);
    insertedPage.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height);
    // Preserve the source's explicit CropBox (when present) so the rendered
    // PDF still clips to the same visible region as the input. Without this
    // the inserted page would inherit the default (= MediaBox), changing the
    // viewer's visible area for callers that rely on CropBox-driven clipping.
    if (cropBox) {
      insertedPage.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
    }
  }

  return insertedPage;
};

/**
 * Returns the lower-left origin (in PDF points) of the visible content region
 * for an embedded base page. When the source PDF has an explicit CropBox
 * distinct from its MediaBox, schema coordinates from the editor/designer are
 * authored against the CropBox (the visible area), so the renderer must
 * translate them by the CropBox origin to land them inside the visible region
 * rather than at the MediaBox origin. When no explicit CropBox is set, this
 * falls back to the MediaBox origin — which keeps the historical behavior for
 * the common case where MediaBox == CropBox. See pdfme/pdfme#623.
 */
export const getPageContentOffset = (
  embedPdfBox: EmbedPdfBox,
): { x: number; y: number } => {
  const box = embedPdfBox.cropBox ?? embedPdfBox.mediaBox;
  return { x: box.x, y: box.y };
};
