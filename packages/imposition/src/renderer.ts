import {
  PDFDocument,
  type PDFEmbeddedPage,
  PDFName,
  type PDFPage,
  clip,
  degrees,
  drawPage as drawEmbeddedPage,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from '@pdfweave/pdf-lib';
import type { ImposeProps, ImpositionPlan, ImpositionResult, RotationAngle } from './types.js';
import { ImpositionError } from './errors.js';
import { getDrawOrigin } from './geometry.js';
import { inspectSourcePages, type SourcePageDescriptor } from './pageBoxes.js';
import { normalizeOptions } from './paperSizes.js';
import { createImpositionPlan } from './planner.js';
import { parseImposeProps } from './schema.js';

interface PreparedPlan {
  sourceDocument: PDFDocument;
  descriptors: Map<number, SourcePageDescriptor>;
  plan: ImpositionPlan;
}

const loadSource = async (source: ImposeProps['source']): Promise<PDFDocument> => {
  try {
    const bytes = ArrayBuffer.isView(source)
      ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
      : new Uint8Array(source);
    return await PDFDocument.load(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpositionError(`Unable to load source PDF: ${message}`);
  }
};

const preparePlan = async (rawProps: ImposeProps): Promise<PreparedPlan> => {
  const props = parseImposeProps(rawProps);
  const sourceDocument = await loadSource(props.source);
  try {
    const sourcePages = sourceDocument.getPages();
    if (sourcePages.length === 0) throw new ImpositionError('Source PDF has no pages');

    const options = normalizeOptions(props, sourcePages.length);
    const inspected = inspectSourcePages(sourcePages, options.pages, options.sourceBox);
    const plan = createImpositionPlan({
      descriptors: inspected.descriptors,
      options,
      sourcePageCount: sourcePages.length,
      warnings: inspected.warnings,
    });
    return { sourceDocument, descriptors: inspected.descriptors, plan };
  } catch (error) {
    if (error instanceof ImpositionError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpositionError(`Unable to inspect source PDF: ${message}`);
  }
};

export const planImposition = async (props: ImposeProps): Promise<ImpositionPlan> =>
  preparePlan(props).then(({ plan }) => plan);

const clockwiseDegrees = (rotation: RotationAngle): number => (rotation === 0 ? 0 : -rotation);

const getOrCreateSheetXObjectName = (args: {
  names: Map<number, PDFName>;
  page: PDFPage;
  pageIndex: number;
  embeddedPage: PDFEmbeddedPage;
}): PDFName => {
  const existing = args.names.get(args.pageIndex);
  if (existing) return existing;

  const name = PDFName.of(`PdfweaveSourcePage${String(args.pageIndex)}`);
  args.page.node.setXObject(name, args.embeddedPage.ref);
  args.names.set(args.pageIndex, name);
  return name;
};

export const impose = async (props: ImposeProps): Promise<ImpositionResult> => {
  const { descriptors, plan } = await preparePlan(props);
  try {
    const output = await PDFDocument.create({ updateMetadata: false });
    const sourcePageIndexes = [
      ...new Set(
        plan.sheets.flatMap((sheet) =>
          sheet.front.placements.map((placement) => placement.sourcePageIndex),
        ),
      ),
    ];
    const getDescriptor = (pageIndex: number): SourcePageDescriptor => {
      const descriptor = descriptors.get(pageIndex);
      if (!descriptor) {
        throw new ImpositionError(`Source page ${String(pageIndex)} was not inspected`);
      }
      return descriptor;
    };
    const sourcePages = sourcePageIndexes.map((pageIndex) => getDescriptor(pageIndex).page);
    const boundingBoxes = sourcePageIndexes.map((pageIndex) => {
      const { rawBox } = getDescriptor(pageIndex);
      return {
        left: rawBox.x,
        bottom: rawBox.y,
        right: rawBox.x + rawBox.width,
        top: rawBox.y + rawBox.height,
      };
    });
    const embedded = await output.embedPages(sourcePages, boundingBoxes);
    const embeddedByPage = new Map<number, PDFEmbeddedPage>();
    for (const [index, pageIndex] of sourcePageIndexes.entries()) {
      const embeddedPage = embedded.at(index);
      if (!embeddedPage) {
        throw new ImpositionError(`Source page ${String(pageIndex)} was not embedded`);
      }
      embeddedByPage.set(pageIndex, embeddedPage);
    }

    for (const sheet of plan.sheets) {
      const page = output.addPage([plan.options.sheet.width, plan.options.sheet.height]);
      const xObjectNames = new Map<number, PDFName>();
      for (const placement of sheet.front.placements) {
        const embeddedPage = embeddedByPage.get(placement.sourcePageIndex);
        if (!embeddedPage) {
          throw new ImpositionError(
            `Source page ${String(placement.sourcePageIndex)} was not embedded`,
          );
        }
        const xObjectName = getOrCreateSheetXObjectName({
          names: xObjectNames,
          page,
          pageIndex: placement.sourcePageIndex,
          embeddedPage,
        });
        const { cell, content, scale, rotation, sourceUserUnit } = placement;
        const origin = getDrawOrigin(content, rotation);
        page.pushOperators(
          pushGraphicsState(),
          rectangle(cell.x, cell.y, cell.width, cell.height),
          clip(),
          endPath(),
          ...drawEmbeddedPage(xObjectName, {
            x: origin.x,
            y: origin.y,
            xScale: scale * sourceUserUnit,
            yScale: scale * sourceUserUnit,
            rotate: degrees(clockwiseDegrees(rotation)),
            xSkew: degrees(0),
            ySkew: degrees(0),
          }),
          popGraphicsState(),
        );
      }
    }

    const pdf = await output.save();
    return { pdf, plan, warnings: plan.warnings.map((warning) => ({ ...warning })) };
  } catch (error) {
    if (error instanceof ImpositionError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpositionError(`Unable to render imposed PDF: ${message}`);
  }
};
