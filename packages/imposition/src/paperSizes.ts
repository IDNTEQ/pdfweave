import type {
  Gutters,
  ImposeProps,
  Insets,
  NormalizedImpositionOptions,
  PaperSizeName,
  SheetOrientation,
  Size,
} from './types.js';
import { ImpositionError, invalidOption } from './errors.js';
import { HARD_MAX_PLACEMENTS, HARD_MAX_SHEETS } from './schema.js';

export const MM_TO_PT = 72 / 25.4;
const MIN_PDF_PAGE_DIMENSION_PT = 0.01;
const MAX_PDF_PAGE_DIMENSION_PT = 14_400;

const frozenSize = (width: number, height: number): Readonly<Size> =>
  Object.freeze({ width, height });

export const PAPER_SIZES_MM: Readonly<Record<PaperSizeName, Readonly<Size>>> = Object.freeze({
  A2: frozenSize(420, 594),
  A3: frozenSize(297, 420),
  A4: frozenSize(210, 297),
  A5: frozenSize(148, 210),
  A6: frozenSize(105, 148),
  Letter: frozenSize(215.9, 279.4),
  Legal: frozenSize(215.9, 355.6),
});

const getNamedPaperSize = (name: PaperSizeName): Readonly<Size> => PAPER_SIZES_MM[name];

const toPoints = (value: number, unit: 'mm' | 'pt'): number =>
  unit === 'mm' ? value * MM_TO_PT : value;

const normalizeInsets = (value: number | Insets | undefined, unit: 'mm' | 'pt'): Insets => {
  const raw =
    typeof value === 'number' ? { top: value, right: value, bottom: value, left: value } : value;
  return {
    top: toPoints(raw?.top ?? 0, unit),
    right: toPoints(raw?.right ?? 0, unit),
    bottom: toPoints(raw?.bottom ?? 0, unit),
    left: toPoints(raw?.left ?? 0, unit),
  };
};

const normalizeGutters = (value: number | Gutters | undefined, unit: 'mm' | 'pt'): Gutters => {
  const raw = typeof value === 'number' ? { horizontal: value, vertical: value } : value;
  return {
    horizontal: toPoints(raw?.horizontal ?? 0, unit),
    vertical: toPoints(raw?.vertical ?? 0, unit),
  };
};

const orient = (
  size: Size,
  orientation: SheetOrientation | undefined,
): Size & { orientation: SheetOrientation } => {
  if (!orientation) {
    return {
      ...size,
      orientation: size.width <= size.height ? 'portrait' : 'landscape',
    };
  }

  const short = Math.min(size.width, size.height);
  const long = Math.max(size.width, size.height);
  return orientation === 'portrait'
    ? { width: short, height: long, orientation }
    : { width: long, height: short, orientation };
};

const assertValidSheetDimensions = (size: Size): void => {
  const invalid =
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < MIN_PDF_PAGE_DIMENSION_PT ||
    size.height < MIN_PDF_PAGE_DIMENSION_PT ||
    size.width > MAX_PDF_PAGE_DIMENSION_PT ||
    size.height > MAX_PDF_PAGE_DIMENSION_PT;
  if (!invalid) return;

  throw invalidOption(
    'sheet.size',
    `normalized dimensions must be between ${String(MIN_PDF_PAGE_DIMENSION_PT)} and ${String(MAX_PDF_PAGE_DIMENSION_PT)} points`,
  );
};

const normalizeSheet = (
  props: ImposeProps,
  unit: 'mm' | 'pt',
): NormalizedImpositionOptions['sheet'] => {
  const requestedSize = props.sheet.size;
  const isNamed = typeof requestedSize === 'string';
  const namedSize = isNamed ? getNamedPaperSize(requestedSize) : undefined;
  const rawSize = namedSize
    ? { width: namedSize.width * MM_TO_PT, height: namedSize.height * MM_TO_PT }
    : {
        width: toPoints((requestedSize as Size).width, unit),
        height: toPoints((requestedSize as Size).height, unit),
      };
  assertValidSheetDimensions(rawSize);
  const orientedSize = orient(
    rawSize,
    props.sheet.orientation ?? (isNamed ? 'portrait' : undefined),
  );

  return {
    name: isNamed ? requestedSize : 'custom',
    width: orientedSize.width,
    height: orientedSize.height,
    orientation: orientedSize.orientation,
    margins: normalizeInsets(props.sheet.margins, unit),
    gutter: normalizeGutters(props.sheet.gutter, unit),
  };
};

const validateGrid = (
  sheet: NormalizedImpositionOptions['sheet'],
  rows: number,
  columns: number,
): number => {
  const { margins, gutter } = sheet;
  const spacing = [
    margins.top,
    margins.right,
    margins.bottom,
    margins.left,
    gutter.horizontal,
    gutter.vertical,
  ];
  if (spacing.some((value) => !Number.isFinite(value))) {
    throw invalidOption('sheet', 'normalized margins and gutters must be finite');
  }

  const capacity = rows * columns;
  if (capacity > HARD_MAX_PLACEMENTS) {
    throw invalidOption(
      'layout',
      `rows * columns must not exceed ${HARD_MAX_PLACEMENTS.toLocaleString('en-US')}`,
    );
  }

  const usableWidth =
    sheet.width - margins.left - margins.right - (columns - 1) * gutter.horizontal;
  const usableHeight = sheet.height - margins.top - margins.bottom - (rows - 1) * gutter.vertical;
  if (!Number.isFinite(usableWidth) || usableWidth <= 0) {
    throw invalidOption('sheet', 'horizontal margins and gutters leave no printable width');
  }
  if (!Number.isFinite(usableHeight) || usableHeight <= 0) {
    throw invalidOption('sheet', 'vertical margins and gutters leave no printable height');
  }
  if (usableWidth / columns <= 0 || usableHeight / rows <= 0) {
    throw invalidOption('layout', 'grid cells are smaller than the supported numeric precision');
  }
  return capacity;
};

const normalizePages = (props: ImposeProps, sourcePageCount: number): number[] => {
  const pages = props.pages
    ? [...props.pages]
    : Array.from({ length: sourcePageCount }, (_, index) => index);
  if (pages.length === 0) throw invalidOption('pages', 'at least one source page is required');

  const invalidPageIndex = pages.find((pageIndex) => pageIndex < 0 || pageIndex >= sourcePageCount);
  if (invalidPageIndex === undefined) return pages;
  throw invalidOption(
    'pages',
    `page index ${String(invalidPageIndex)} is outside the source page range 0-${String(sourcePageCount - 1)}`,
  );
};

const normalizeLimits = (
  props: ImposeProps,
  pageCount: number,
  capacity: number,
): { copies: number; maxPlacements: number; maxSheets: number } => {
  const copies = props.sequence?.copies ?? 1;
  const maxPlacements = props.limits?.maxPlacements ?? HARD_MAX_PLACEMENTS;
  const maxSheets = props.limits?.maxSheets ?? HARD_MAX_SHEETS;
  const placementCount = pageCount * copies;
  if (pageCount > Math.floor(maxPlacements / copies)) {
    throw new ImpositionError(
      `Placement count ${String(placementCount)} exceeds limit ${String(maxPlacements)}`,
    );
  }
  const sheetCount = Math.ceil(placementCount / capacity);
  if (sheetCount > maxSheets) {
    throw new ImpositionError(
      `Sheet count ${String(sheetCount)} exceeds limit ${String(maxSheets)}`,
    );
  }
  return { copies, maxPlacements, maxSheets };
};

export const normalizeOptions = (
  props: ImposeProps,
  sourcePageCount: number,
): NormalizedImpositionOptions => {
  const unit = props.unit ?? 'mm';
  const sheet = normalizeSheet(props, unit);
  const rows = props.layout.rows;
  const columns = props.layout.columns;
  const capacity = validateGrid(sheet, rows, columns);
  const pages = normalizePages(props, sourcePageCount);
  const { copies, maxPlacements, maxSheets } = normalizeLimits(props, pages.length, capacity);

  return {
    unit: 'pt',
    sheet,
    layout: {
      type: 'n-up',
      rows,
      columns,
      fill: props.layout.fill ?? 'row-major',
      scale: props.layout.scale ?? 'contain',
      allowUpscale: props.layout.allowUpscale ?? false,
      autoRotate: props.layout.autoRotate ?? false,
      align: {
        horizontal: props.layout.align?.horizontal ?? 'center',
        vertical: props.layout.align?.vertical ?? 'middle',
      },
    },
    sourceBox: props.sourceBox ?? 'trim',
    pages,
    sequence: {
      copies,
      collation: props.sequence?.collation ?? 'collated',
    },
    limits: {
      maxPlacements,
      maxSheets,
    },
  };
};
