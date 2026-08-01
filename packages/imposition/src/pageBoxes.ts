import { PDFName, PDFNumber, type PDFPage } from '@pdfweave/pdf-lib';
import type { ImpositionWarning, Rectangle, RotationAngle, SourcePageBox } from './types.js';
import { ImpositionError } from './errors.js';

export interface SourcePageDescriptor {
  pageIndex: number;
  page: PDFPage;
  rawBox: Rectangle;
  box: Rectangle;
  userUnit: number;
  intrinsicRotation: RotationAngle;
}

interface BoxSelection {
  box: Rectangle;
  kind: SourcePageBox;
  fallback?: 'crop' | 'media';
}

const normalizeRotation = (angle: number, pageIndex: number): RotationAngle => {
  if (!Number.isFinite(angle) || angle % 90 !== 0) {
    throw new ImpositionError(
      `Source page ${String(pageIndex)} has an unsupported rotation (${String(angle)}); expected a multiple of 90`,
    );
  }
  return (((angle % 360) + 360) % 360) as RotationAngle;
};

const getUserUnit = (page: PDFPage, pageIndex: number): number => {
  let userUnit = 1;
  try {
    userUnit = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() ?? 1;
  } catch {
    throw new ImpositionError(
      `Source page ${String(pageIndex)} has an invalid /UserUnit; expected a positive number`,
    );
  }
  if (!Number.isFinite(userUnit) || userUnit <= 0 || userUnit > 75_000) {
    throw new ImpositionError(
      `Source page ${String(pageIndex)} has an invalid /UserUnit (${String(userUnit)}); expected a value greater than 0 and at most 75000`,
    );
  }
  return userUnit;
};

const selectBox = (page: PDFPage, mediaBox: Rectangle, sourceBox: SourcePageBox): BoxSelection => {
  if (sourceBox === 'media') return { box: mediaBox, kind: 'media' };

  const hasCrop = Boolean(page.node.CropBox());
  if (sourceBox === 'crop') {
    return hasCrop
      ? { box: page.getCropBox(), kind: 'crop' }
      : { box: mediaBox, kind: 'media', fallback: 'media' };
  }

  let explicitBox;
  if (sourceBox === 'trim') explicitBox = page.node.TrimBox();
  if (sourceBox === 'bleed') explicitBox = page.node.BleedBox();
  if (sourceBox === 'art') explicitBox = page.node.ArtBox();
  if (explicitBox) return { box: explicitBox.asRectangle(), kind: sourceBox };
  return hasCrop
    ? { box: page.getCropBox(), kind: 'crop', fallback: 'crop' }
    : { box: mediaBox, kind: 'media', fallback: 'media' };
};

const validateBox = (box: Rectangle, sourceBox: SourcePageBox, pageIndex: number): Rectangle => {
  const values = [box.x, box.y, box.width, box.height];
  if (values.some((value) => !Number.isFinite(value)) || box.width <= 0 || box.height <= 0) {
    throw new ImpositionError(
      `Source page ${String(pageIndex)} has an invalid ${sourceBox} box (${values.join(', ')})`,
    );
  }
  return { ...box };
};

const intersectWithMediaBox = (
  box: Rectangle,
  mediaBox: Rectangle,
  boxKind: SourcePageBox,
  pageIndex: number,
): Rectangle => {
  const x = Math.max(box.x, mediaBox.x);
  const y = Math.max(box.y, mediaBox.y);
  const right = Math.min(box.x + box.width, mediaBox.x + mediaBox.width);
  const top = Math.min(box.y + box.height, mediaBox.y + mediaBox.height);
  if (right <= x || top <= y) {
    throw new ImpositionError(
      `Source page ${String(pageIndex)} has a ${boxKind} box that does not intersect its media box`,
    );
  }
  return { x, y, width: right - x, height: top - y };
};

export const inspectSourcePages = (
  pages: PDFPage[],
  selectedPageIndexes: number[],
  sourceBox: SourcePageBox,
): { descriptors: Map<number, SourcePageDescriptor>; warnings: ImpositionWarning[] } => {
  const descriptors = new Map<number, SourcePageDescriptor>();
  const warnings: ImpositionWarning[] = [];

  for (const pageIndex of new Set(selectedPageIndexes)) {
    const page = pages.at(pageIndex);
    if (!page) {
      throw new ImpositionError(`Source page ${String(pageIndex)} does not exist`);
    }

    const mediaBox = validateBox(page.getMediaBox(), 'media', pageIndex);
    const selection = selectBox(page, mediaBox, sourceBox);
    const selectedBox = validateBox(selection.box, selection.kind, pageIndex);
    const rawBox = intersectWithMediaBox(selectedBox, mediaBox, selection.kind, pageIndex);
    const userUnit = getUserUnit(page, pageIndex);
    const box = validateBox(
      {
        x: rawBox.x * userUnit,
        y: rawBox.y * userUnit,
        width: rawBox.width * userUnit,
        height: rawBox.height * userUnit,
      },
      sourceBox,
      pageIndex,
    );
    if (selection.fallback) {
      warnings.push({
        code: 'page-box-fallback',
        sourcePageIndex: pageIndex,
        message: `Source page ${String(pageIndex)} has no ${sourceBox} box; using ${selection.fallback} box`,
      });
    }

    const annotationCount = page.node.Annots()?.size() ?? 0;
    if (annotationCount > 0) {
      warnings.push({
        code: 'annotations-omitted',
        sourcePageIndex: pageIndex,
        message: `Source page ${String(pageIndex)} has ${String(annotationCount)} annotation${annotationCount === 1 ? '' : 's'}; annotations are not copied by n-up imposition`,
      });
    }

    // pdf-lib cannot embed a page without /Contents. Creating an empty stream
    // preserves a selected logical blank page and its slot in the sequence.
    if (!page.node.Contents()) page.pushOperators();

    descriptors.set(pageIndex, {
      pageIndex,
      page,
      rawBox,
      box,
      userUnit,
      intrinsicRotation: normalizeRotation(page.getRotation().angle, pageIndex),
    });
  }

  return { descriptors, warnings };
};
