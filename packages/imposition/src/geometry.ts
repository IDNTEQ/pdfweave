import type { SourcePageDescriptor } from './pageBoxes.js';
import type {
  ImpositionPlacement,
  NormalizedImpositionOptions,
  Rectangle,
  RotationAngle,
} from './types.js';
import { ImpositionError } from './errors.js';

const rotatedSize = (
  width: number,
  height: number,
  rotation: RotationAngle,
): { width: number; height: number } =>
  rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };

const scaleFor = (
  source: { width: number; height: number },
  cell: { width: number; height: number },
  options: NormalizedImpositionOptions['layout'],
): number => {
  let scale = 1;
  if (options.scale === 'contain') {
    scale = Math.min(cell.width / source.width, cell.height / source.height);
  } else if (options.scale === 'cover') {
    scale = Math.max(cell.width / source.width, cell.height / source.height);
  }
  return options.allowUpscale ? scale : Math.min(1, scale);
};

export const getCell = (
  slotIndex: number,
  options: NormalizedImpositionOptions,
): Rectangle & { row: number; column: number } => {
  const { rows, columns, fill } = options.layout;
  const row = fill === 'row-major' ? Math.floor(slotIndex / columns) : slotIndex % rows;
  const column = fill === 'row-major' ? slotIndex % columns : Math.floor(slotIndex / rows);
  const { margins, gutter, width: sheetWidth, height: sheetHeight } = options.sheet;
  const width =
    (sheetWidth - margins.left - margins.right - (columns - 1) * gutter.horizontal) / columns;
  const height = (sheetHeight - margins.top - margins.bottom - (rows - 1) * gutter.vertical) / rows;

  return {
    x: margins.left + column * (width + gutter.horizontal),
    y: sheetHeight - margins.top - (row + 1) * height - row * gutter.vertical,
    width,
    height,
    row,
    column,
  };
};

const alignContent = (
  cell: Rectangle,
  width: number,
  height: number,
  options: NormalizedImpositionOptions['layout'],
): Rectangle => {
  let x = cell.x + (cell.width - width) / 2;
  if (options.align.horizontal === 'left') x = cell.x;
  if (options.align.horizontal === 'right') x = cell.x + cell.width - width;

  let y = cell.y + (cell.height - height) / 2;
  if (options.align.vertical === 'bottom') y = cell.y;
  if (options.align.vertical === 'top') y = cell.y + cell.height - height;
  return { x, y, width, height };
};

export const createPlacement = (args: {
  descriptor: SourcePageDescriptor;
  options: NormalizedImpositionOptions;
  sequenceIndex: number;
  copyIndex: number;
  sheetIndex: number;
  slotIndex: number;
}): ImpositionPlacement => {
  const { descriptor, options, sequenceIndex, copyIndex, sheetIndex, slotIndex } = args;
  const cell = getCell(slotIndex, options);
  const baseRotation = descriptor.intrinsicRotation;
  const baseSize = rotatedSize(descriptor.box.width, descriptor.box.height, baseRotation);
  const baseScale = scaleFor(baseSize, cell, options.layout);
  const autoRotation = ((baseRotation + 90) % 360) as RotationAngle;
  const autoSize = rotatedSize(descriptor.box.width, descriptor.box.height, autoRotation);
  const autoScale = scaleFor(autoSize, cell, options.layout);
  const useAutoRotation = options.layout.autoRotate && autoScale > baseScale;
  const rotation = useAutoRotation ? autoRotation : baseRotation;
  const effectiveSize = useAutoRotation ? autoSize : baseSize;
  const scale = useAutoRotation ? autoScale : baseScale;
  const content = alignContent(
    cell,
    effectiveSize.width * scale,
    effectiveSize.height * scale,
    options.layout,
  );
  const renderScale = scale * descriptor.userUnit;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(renderScale) ||
    renderScale <= 0 ||
    Object.values(content).some((value) => !Number.isFinite(value))
  ) {
    throw new ImpositionError(
      `Source page ${String(descriptor.pageIndex)} produces unsupported placement geometry`,
    );
  }

  return {
    sequenceIndex,
    sourcePageIndex: descriptor.pageIndex,
    copyIndex,
    sheetIndex,
    slotIndex,
    row: cell.row,
    column: cell.column,
    source: { ...descriptor.box },
    cell: { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
    content,
    scale,
    sourceUserUnit: descriptor.userUnit,
    intrinsicRotation: descriptor.intrinsicRotation,
    rotation,
  };
};

/** Translate the source origin so a clockwise rotation occupies `content`. */
export const getDrawOrigin = (
  content: Rectangle,
  rotation: RotationAngle,
): { x: number; y: number } => {
  if (rotation === 90) return { x: content.x, y: content.y + content.height };
  if (rotation === 180) {
    return { x: content.x + content.width, y: content.y + content.height };
  }
  if (rotation === 270) return { x: content.x + content.width, y: content.y };
  return { x: content.x, y: content.y };
};
