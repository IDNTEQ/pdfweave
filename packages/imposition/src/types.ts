export type PdfInput = ArrayBuffer | Uint8Array;

export type ImpositionUnit = 'mm' | 'pt';

export type PaperSizeName = 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'Letter' | 'Legal';

export type SheetOrientation = 'portrait' | 'landscape';

export type SourcePageBox = 'media' | 'crop' | 'trim' | 'bleed' | 'art';

export type FillOrder = 'row-major' | 'column-major';

export type ScaleMode = 'contain' | 'cover' | 'none';

export type HorizontalAlignment = 'left' | 'center' | 'right';

export type VerticalAlignment = 'bottom' | 'middle' | 'top';

export type CollationMode = 'collated' | 'uncollated';

export type RotationAngle = 0 | 90 | 180 | 270;

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle extends Size {
  x: number;
  y: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Gutters {
  horizontal: number;
  vertical: number;
}

export interface ImposeProps {
  source: PdfInput;
  unit?: ImpositionUnit;
  sheet: {
    size: PaperSizeName | Size;
    orientation?: SheetOrientation;
    margins?: number | Insets;
    gutter?: number | Gutters;
  };
  layout: {
    type: 'n-up';
    rows: number;
    columns: number;
    fill?: FillOrder;
    scale?: ScaleMode;
    allowUpscale?: boolean;
    autoRotate?: boolean;
    align?: {
      horizontal?: HorizontalAlignment;
      vertical?: VerticalAlignment;
    };
  };
  sourceBox?: SourcePageBox;
  pages?: number[];
  sequence?: {
    copies?: number;
    collation?: CollationMode;
  };
  limits?: {
    maxPlacements?: number;
    maxSheets?: number;
  };
}

export interface NormalizedImpositionOptions {
  unit: 'pt';
  sheet: {
    name: PaperSizeName | 'custom';
    width: number;
    height: number;
    orientation: SheetOrientation;
    margins: Insets;
    gutter: Gutters;
  };
  layout: {
    type: 'n-up';
    rows: number;
    columns: number;
    fill: FillOrder;
    scale: ScaleMode;
    allowUpscale: boolean;
    autoRotate: boolean;
    align: {
      horizontal: HorizontalAlignment;
      vertical: VerticalAlignment;
    };
  };
  sourceBox: SourcePageBox;
  pages: number[];
  sequence: {
    copies: number;
    collation: CollationMode;
  };
  limits: {
    maxPlacements: number;
    maxSheets: number;
  };
}

export type ImpositionWarningCode = 'annotations-omitted' | 'page-box-fallback';

export interface ImpositionWarning {
  code: ImpositionWarningCode;
  message: string;
  sourcePageIndex: number;
}

export interface ImpositionPlacement {
  sequenceIndex: number;
  sourcePageIndex: number;
  copyIndex: number;
  sheetIndex: number;
  slotIndex: number;
  row: number;
  column: number;
  source: Rectangle;
  cell: Rectangle;
  content: Rectangle;
  scale: number;
  sourceUserUnit: number;
  intrinsicRotation: RotationAngle;
  rotation: RotationAngle;
}

export interface ImpositionEmptySlot {
  sheetIndex: number;
  slotIndex: number;
  row: number;
  column: number;
  cell: Rectangle;
}

export interface ImpositionSidePlan {
  outputPageIndex: number;
  placements: ImpositionPlacement[];
  emptySlots: ImpositionEmptySlot[];
}

export interface ImpositionSheetPlan {
  sheetIndex: number;
  front: ImpositionSidePlan;
}

export interface ImpositionPlan {
  version: 1;
  sourcePageCount: number;
  selectedPageCount: number;
  placementCount: number;
  capacity: number;
  sheetCount: number;
  options: NormalizedImpositionOptions;
  sheets: ImpositionSheetPlan[];
  warnings: ImpositionWarning[];
}

export interface ImpositionResult {
  pdf: Uint8Array;
  plan: ImpositionPlan;
  warnings: ImpositionWarning[];
}
