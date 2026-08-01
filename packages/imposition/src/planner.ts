import type { SourcePageDescriptor } from './pageBoxes.js';
import type {
  ImpositionEmptySlot,
  ImpositionPlan,
  ImpositionWarning,
  NormalizedImpositionOptions,
} from './types.js';
import { ImpositionError } from './errors.js';
import { createPlacement, getCell } from './geometry.js';

interface SequenceEntry {
  sourcePageIndex: number;
  copyIndex: number;
}

const expandSequence = (options: NormalizedImpositionOptions): SequenceEntry[] => {
  const { pages, sequence } = options;
  if (pages.length > Math.floor(options.limits.maxPlacements / sequence.copies)) {
    throw new ImpositionError(
      `Placement count ${String(pages.length * sequence.copies)} exceeds limit ${String(options.limits.maxPlacements)}`,
    );
  }

  const expanded: SequenceEntry[] = [];
  if (sequence.collation === 'collated') {
    for (let copyIndex = 0; copyIndex < sequence.copies; copyIndex += 1) {
      for (const sourcePageIndex of pages) expanded.push({ sourcePageIndex, copyIndex });
    }
  } else {
    for (const sourcePageIndex of pages) {
      for (let copyIndex = 0; copyIndex < sequence.copies; copyIndex += 1) {
        expanded.push({ sourcePageIndex, copyIndex });
      }
    }
  }
  return expanded;
};

export const createImpositionPlan = (args: {
  descriptors: Map<number, SourcePageDescriptor>;
  options: NormalizedImpositionOptions;
  sourcePageCount: number;
  warnings: ImpositionWarning[];
}): ImpositionPlan => {
  const { descriptors, options, sourcePageCount } = args;
  const sequence = expandSequence(options);
  const capacity = options.layout.rows * options.layout.columns;
  const sheetCount = Math.ceil(sequence.length / capacity);
  if (sheetCount > options.limits.maxSheets) {
    throw new ImpositionError(
      `Sheet count ${String(sheetCount)} exceeds limit ${String(options.limits.maxSheets)}`,
    );
  }

  const sheets = Array.from({ length: sheetCount }, (_, sheetIndex) => {
    const start = sheetIndex * capacity;
    const entries = sequence.slice(start, start + capacity);
    const placements = entries.map((entry, slotIndex) => {
      const descriptor = descriptors.get(entry.sourcePageIndex);
      if (!descriptor) {
        throw new ImpositionError(`Source page ${String(entry.sourcePageIndex)} was not inspected`);
      }
      return createPlacement({
        descriptor,
        options,
        sequenceIndex: start + slotIndex,
        copyIndex: entry.copyIndex,
        sheetIndex,
        slotIndex,
      });
    });
    const emptySlots: ImpositionEmptySlot[] = [];
    for (let slotIndex = entries.length; slotIndex < capacity; slotIndex += 1) {
      const cell = getCell(slotIndex, options);
      emptySlots.push({
        sheetIndex,
        slotIndex,
        row: cell.row,
        column: cell.column,
        cell: { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
      });
    }
    return {
      sheetIndex,
      front: { outputPageIndex: sheetIndex, placements, emptySlots },
    };
  });

  return {
    version: 1,
    sourcePageCount,
    selectedPageCount: options.pages.length,
    placementCount: sequence.length,
    capacity,
    sheetCount,
    options,
    sheets,
    warnings: args.warnings.map((warning) => ({ ...warning })),
  };
};
