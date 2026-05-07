import { useEffect, useMemo, useRef } from 'react';
import type { BasePdf, SchemaForUI, Size } from '@pdfweave/common';

const getBasePdfPadding = (basePdf: BasePdf): [number, number, number, number] => {
  const maybePadding = (basePdf as { padding?: [number, number, number, number] }).padding;
  return Array.isArray(maybePadding) ? maybePadding : [0, 0, 0, 0];
};

interface UsePageOverflowParams {
  basePdf: BasePdf;
  pageCursor: number;
  pageSizes: Size[];
  schemasList: SchemaForUI[][];
  renderedSchemaHeights: Record<string, number>;
  onPageOverflowChange?: (info: { pageIndex: number; overflowingSchemaCount: number }) => void;
}

/**
 * Computes the count of schemas on the current page whose rendered (or
 * authored) height pushes them past the bottom-padding line, and reports
 * changes to the parent via `onPageOverflowChange`.
 */
export const usePageOverflow = ({
  basePdf,
  pageCursor,
  pageSizes,
  schemasList,
  renderedSchemaHeights,
  onPageOverflowChange,
}: UsePageOverflowParams) => {
  const [, , bottomPaddingMm] = getBasePdfPadding(basePdf);
  const currentPageHeight = pageSizes[pageCursor]?.height ?? 0;
  const currentContentBottomY = currentPageHeight - bottomPaddingMm;

  const overflowingSchemaCount = useMemo(() => {
    if (currentPageHeight <= 0) {
      return 0;
    }

    return (schemasList[pageCursor] || []).filter((schema) => {
      const renderedHeight = renderedSchemaHeights[schema.id] ?? schema.height;
      return schema.position.y + Math.max(schema.height, renderedHeight) > currentContentBottomY;
    }).length;
  }, [currentContentBottomY, currentPageHeight, pageCursor, renderedSchemaHeights, schemasList]);

  const hasOverflow = overflowingSchemaCount > 0;
  const prevOverflowKey = useRef<string | null>(null);

  useEffect(() => {
    const overflowKey = `${pageCursor}:${overflowingSchemaCount}`;
    if (prevOverflowKey.current === overflowKey) {
      return;
    }

    prevOverflowKey.current = overflowKey;
    onPageOverflowChange?.({ pageIndex: pageCursor, overflowingSchemaCount });
  }, [onPageOverflowChange, overflowingSchemaCount, pageCursor]);

  return {
    bottomPaddingMm,
    overflowingSchemaCount,
    hasOverflow,
  };
};
