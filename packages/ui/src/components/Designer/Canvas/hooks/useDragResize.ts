import { useMemo } from 'react';
import type { OnDrag, OnRotate, OnResize } from 'react-moveable';
import {
  ZOOM,
  type BasePdf,
  type ChangeSchemas,
  type SchemaForUI,
  type Size,
  isBlankPdf,
} from '@pdfweave/common';
import { flatten, getRotatedBoundingBoxOffsets, round } from '../../../../helper.js';
import type { PluginRegistry } from '@pdfweave/common';

const mm2px = (mm: number) => mm * 3.7795275591;
const fmt4Num = (prop: string) => Number(prop.replace('px', ''));
const fmt = (prop: string) => round(fmt4Num(prop) / ZOOM, 2);
const isTopLeftResize = (d: string) => d === '-1,-1' || d === '-1,0' || d === '0,-1';
const normalizeRotate = (angle: number) => ((angle % 360) + 360) % 360;

interface UseDragResizeParams {
  basePdf: BasePdf;
  pageCursor: number;
  pageSizes: Size[];
  schemasList: SchemaForUI[][];
  activeElements: HTMLElement[];
  changeSchemas: ChangeSchemas;
  pluginsRegistry: PluginRegistry;
}

/**
 * Wires react-moveable's drag / resize / rotate callbacks to schema mutations
 * via `changeSchemas`, plus the bounds + rotatable derivations Moveable needs.
 *
 * No internal state — every callback reads `target.style` (the live DOM
 * position Moveable manipulates) and writes the result via changeSchemas.
 *
 * NOTE: this hook is intentionally not unit-tested in isolation because every
 * meaningful behaviour requires a real Moveable + DOM. It is exercised by
 * the Designer integration tests and by the Designer snapshot test.
 */
export const useDragResize = ({
  basePdf,
  pageCursor,
  pageSizes,
  schemasList,
  activeElements,
  changeSchemas,
  pluginsRegistry,
}: UseDragResizeParams) => {
  const onDrag = ({ target, top, left }: OnDrag) => {
    const { width: _width, height: _height, transform } = target.style;
    const targetWidth = fmt(_width);
    const targetHeight = fmt(_height);
    const actualTop = top / ZOOM;
    const actualLeft = left / ZOOM;
    const { width: pageWidth, height: pageHeight } = pageSizes[pageCursor];
    let topPadding = 0;
    let rightPadding = 0;
    let bottomPadding = 0;
    let leftPadding = 0;

    if (isBlankPdf(basePdf)) {
      const [t, r, b, l] = basePdf.padding;
      topPadding = t * ZOOM;
      rightPadding = r;
      bottomPadding = b;
      leftPadding = l * ZOOM;
    }

    // pdfme#284: a schema's stored position is its un-rotated top-left, but
    // the visible bounding box is the rotated one. When rotation pushes the
    // visible box past the un-rotated origin we must let position values go
    // negative (or beyond pageWidth/pageHeight) so the rotated box can reach
    // the canvas edge.
    const rotateMatch = transform?.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
    const rotation = rotateMatch ? Number(rotateMatch[1]) : 0;
    const rotatedBox = getRotatedBoundingBoxOffsets(targetWidth, targetHeight, rotation);
    const overflowLeft = -rotatedBox.minX; // mm by which the rotated box pokes past the left edge
    const overflowTop = -rotatedBox.minY;
    const rotatedWidth = rotatedBox.maxX - rotatedBox.minX;
    const rotatedHeight = rotatedBox.maxY - rotatedBox.minY;

    const minTop = (topPadding / ZOOM - overflowTop) * ZOOM;
    const minLeft = (leftPadding / ZOOM - overflowLeft) * ZOOM;
    const maxTopMm = pageHeight - bottomPadding - rotatedHeight + overflowTop;
    const maxLeftMm = pageWidth - rightPadding - rotatedWidth + overflowLeft;

    if (actualTop > maxTopMm) {
      target.style.top = `${maxTopMm * ZOOM}px`;
    } else {
      target.style.top = `${top < minTop ? minTop : top}px`;
    }

    if (actualLeft > maxLeftMm) {
      target.style.left = `${maxLeftMm * ZOOM}px`;
    } else {
      target.style.left = `${left < minLeft ? minLeft : left}px`;
    }
  };

  const onDragEnd = ({ target }: { target: HTMLElement | SVGElement }) => {
    const { top, left } = target.style;
    changeSchemas([
      { key: 'position.y', value: fmt(top), schemaId: target.id },
      { key: 'position.x', value: fmt(left), schemaId: target.id },
    ]);
  };

  const onDragEnds = ({ targets }: { targets: (HTMLElement | SVGElement)[] }) => {
    const arg = targets.map(({ style: { top, left }, id }) => [
      { key: 'position.y', value: fmt(top), schemaId: id },
      { key: 'position.x', value: fmt(left), schemaId: id },
    ]);
    changeSchemas(flatten(arg));
  };

  const onRotate = ({ target, rotate }: OnRotate) => {
    target.style.transform = `rotate(${rotate}deg)`;
  };

  const onRotateEnd = ({ target }: { target: HTMLElement | SVGElement }) => {
    const { transform } = target.style;
    const rotate = Number(transform.replace('rotate(', '').replace('deg)', ''));
    const normalizedRotate = normalizeRotate(rotate);
    changeSchemas([{ key: 'rotate', value: normalizedRotate, schemaId: target.id }]);
  };

  const onRotateEnds = ({ targets }: { targets: (HTMLElement | SVGElement)[] }) => {
    const arg = targets.map(({ style: { transform }, id }) => {
      const rotate = Number(transform.replace('rotate(', '').replace('deg)', ''));
      const normalizedRotate = normalizeRotate(rotate);
      return [{ key: 'rotate', value: normalizedRotate, schemaId: id }];
    });
    changeSchemas(flatten(arg));
  };

  const onResizeEnd = ({ target }: { target: HTMLElement | SVGElement }) => {
    const { id, style } = target;
    const { width, height, top, left } = style;
    changeSchemas([
      { key: 'position.x', value: fmt(left), schemaId: id },
      { key: 'position.y', value: fmt(top), schemaId: id },
      { key: 'width', value: fmt(width), schemaId: id },
      { key: 'height', value: fmt(height), schemaId: id },
    ]);

    const targetSchema = schemasList[pageCursor].find((schema) => schema.id === id);

    if (!targetSchema) return;

    targetSchema.position.x = fmt(left);
    targetSchema.position.y = fmt(top);
    targetSchema.width = fmt(width);
    targetSchema.height = fmt(height);
  };

  const onResizeEnds = ({ targets }: { targets: (HTMLElement | SVGElement)[] }) => {
    const arg = targets.map(({ style: { width, height, top, left }, id }) => [
      { key: 'width', value: fmt(width), schemaId: id },
      { key: 'height', value: fmt(height), schemaId: id },
      { key: 'position.y', value: fmt(top), schemaId: id },
      { key: 'position.x', value: fmt(left), schemaId: id },
    ]);
    changeSchemas(flatten(arg));
  };

  const onResize = ({ target, width, height, direction }: OnResize) => {
    if (!target) return;
    let topPadding = 0;
    let rightPadding = 0;
    let bottomPadding = 0;
    let leftPadding = 0;

    if (isBlankPdf(basePdf)) {
      const [t, r, b, l] = basePdf.padding;
      topPadding = t * ZOOM;
      rightPadding = mm2px(r);
      bottomPadding = mm2px(b);
      leftPadding = l * ZOOM;
    }

    const pageWidth = mm2px(pageSizes[pageCursor].width);
    const pageHeight = mm2px(pageSizes[pageCursor].height);

    const obj: { top?: string; left?: string; width: string; height: string } = {
      width: `${width}px`,
      height: `${height}px`,
    };

    const s = target.style;
    let newLeft = fmt4Num(s.left) + (fmt4Num(s.width) - width);
    let newTop = fmt4Num(s.top) + (fmt4Num(s.height) - height);
    if (newLeft < leftPadding) {
      newLeft = leftPadding;
    }
    if (newTop < topPadding) {
      newTop = topPadding;
    }
    if (newLeft + width > pageWidth - rightPadding) {
      obj.width = `${pageWidth - rightPadding - newLeft}px`;
    }
    if (newTop + height > pageHeight - bottomPadding) {
      obj.height = `${pageHeight - bottomPadding - newTop}px`;
    }

    const d = direction.toString();
    if (isTopLeftResize(d)) {
      obj.top = `${newTop}px`;
      obj.left = `${newLeft}px`;
    } else if (d === '1,-1') {
      obj.top = `${newTop}px`;
    } else if (d === '-1,1') {
      obj.left = `${newLeft}px`;
    }
    Object.assign(s, obj);
  };

  const rotatable = useMemo(() => {
    const selectedSchemas = (schemasList[pageCursor] || []).filter((s) =>
      activeElements.map((ae) => ae.id).includes(s.id),
    );
    const schemaTypes = selectedSchemas.map((s) => s.type);
    const uniqueSchemaTypes = [...new Set(schemaTypes)];

    const defaultSchemas: Record<string, unknown>[] = [];
    pluginsRegistry.entries().forEach(([, plugin]) => {
      if (plugin.propPanel.defaultSchema) {
        defaultSchemas.push(plugin.propPanel.defaultSchema as Record<string, unknown>);
      }
    });

    return uniqueSchemaTypes.every((type) => {
      const matchingSchema = defaultSchemas.find((ds) => ds && 'type' in ds && ds.type === type);
      return matchingSchema && 'rotate' in matchingSchema;
    });
  }, [activeElements, pageCursor, schemasList, pluginsRegistry]);

  /**
   * pdfme#284: react-moveable's `bounds` prop hard-rejects positions outside
   * the rectangle, but a rotated schema's stored top-left can legitimately
   * sit outside the page even when the rotated bounding box is fully on
   * canvas. We expand the bounds by the largest required overflow across the
   * currently active schemas so rotated elements can be dragged to the edge.
   */
  const dragBoundsExpansion = useMemo(() => {
    const activeIds = new Set(activeElements.map((ae) => ae.id));
    const selected = (schemasList[pageCursor] || []).filter((s) => activeIds.has(s.id));
    let leftPad = 0;
    let topPad = 0;
    let rightPad = 0;
    let bottomPad = 0;
    selected.forEach((s) => {
      const rotation = (s as SchemaForUI & { rotate?: number }).rotate ?? 0;
      if (!rotation) return;
      const box = getRotatedBoundingBoxOffsets(s.width, s.height, rotation);
      leftPad = Math.max(leftPad, -box.minX);
      topPad = Math.max(topPad, -box.minY);
      rightPad = Math.max(rightPad, box.maxX - s.width);
      bottomPad = Math.max(bottomPad, box.maxY - s.height);
    });
    return { leftPad, topPad, rightPad, bottomPad };
  }, [activeElements, schemasList, pageCursor]);

  return {
    onDrag,
    onDragEnd,
    onDragEnds,
    onRotate,
    onRotateEnd,
    onRotateEnds,
    onResize,
    onResizeEnd,
    onResizeEnds,
    rotatable,
    dragBoundsExpansion,
  };
};
