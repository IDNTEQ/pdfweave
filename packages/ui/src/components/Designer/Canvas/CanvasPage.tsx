import React, { type Ref } from 'react';
import { ZOOM, type BasePdf, type SchemaForUI, type Size } from '@pdfweave/common';
import type MoveableComponent from 'react-moveable';
import type { OnDrag, OnRotate, OnResize } from 'react-moveable';
import { RULER_HEIGHT } from '../../../constants.js';
import StaticSchema from '../../StaticSchema.js';
import Padding from './Padding.js';
import PageOverflowIndicator from './PageOverflowIndicator.js';
import AnchorOverlay from './AnchorOverlay.js';
import Guides from './Guides.js';
import Mask from './Mask.js';
import Moveable from './Moveable.js';

interface GuidesInterface {
  getGuides(): number[];
  scroll(pos: number): void;
  scrollGuides(pos: number): void;
  loadGuides(guides: number[]): void;
  resize(): void;
}

interface CanvasPageProps {
  index: number;
  paperSize: Size;
  pageCursor: number;
  pageSizes: Size[];
  basePdf: BasePdf;
  schemasList: SchemaForUI[][];
  scale: number;
  bottomPaddingMm: number;
  hasOverflow: boolean;
  focusedSchemaIds: Set<string>;
  editing: boolean;
  activeElements: HTMLElement[];
  isPressShiftKey: boolean;
  rotatable: boolean;
  dragBoundsExpansion: { leftPad: number; topPad: number; rightPad: number; bottomPad: number };
  moveableRef: Ref<MoveableComponent>;
  horizontalGuidesRef: React.MutableRefObject<GuidesInterface[]>;
  verticalGuidesRef: React.MutableRefObject<GuidesInterface[]>;
  deleteButton: React.ReactNode;
  onDrag: (e: OnDrag) => void;
  onDragEnd: (e: { target: HTMLElement | SVGElement }) => void;
  onDragEnds: (e: { targets: (HTMLElement | SVGElement)[] }) => void;
  onRotate: (e: OnRotate) => void;
  onRotateEnd: (e: { target: HTMLElement | SVGElement }) => void;
  onRotateEnds: (e: { targets: (HTMLElement | SVGElement)[] }) => void;
  onResize: (e: OnResize) => void;
  onResizeEnd: (e: { target: HTMLElement | SVGElement }) => void;
  onResizeEnds: (e: { targets: (HTMLElement | SVGElement)[] }) => void;
  onClickMoveable: () => void;
}

const getGuideLines = (guides: GuidesInterface[], index: number) =>
  guides[index] && guides[index].getGuides().map((g) => g * ZOOM);

/**
 * Per-page chrome rendered inside Paper's renderPaper callback: padding,
 * overflow indicator, anchor overlay, static schemas, guides, and either a
 * Mask (for inactive pages) or a Moveable (for the active page).
 */
const CanvasPage: React.FC<CanvasPageProps> = ({
  index,
  paperSize,
  pageCursor,
  pageSizes,
  basePdf,
  schemasList,
  scale,
  bottomPaddingMm,
  hasOverflow,
  focusedSchemaIds,
  editing,
  activeElements,
  isPressShiftKey,
  rotatable,
  dragBoundsExpansion,
  moveableRef,
  horizontalGuidesRef,
  verticalGuidesRef,
  deleteButton,
  onDrag,
  onDragEnd,
  onDragEnds,
  onRotate,
  onRotateEnd,
  onRotateEnds,
  onResize,
  onResizeEnd,
  onResizeEnds,
  onClickMoveable,
}) => {
  const isActivePage = pageCursor === index;
  const fallbackPageSize: Size = pageSizes[index] ?? {
    width: paperSize.width / ZOOM,
    height: paperSize.height / ZOOM,
  };
  const staticInput = Object.fromEntries(
    schemasList.flat().map(({ name, content = '' }) => [name, content]),
  );

  return (
    <>
      {!editing && activeElements.length > 0 && isActivePage && deleteButton}
      <Padding basePdf={basePdf} />
      <PageOverflowIndicator
        pageHeight={pageSizes[index]?.height ?? paperSize.height / ZOOM}
        bottomPaddingMm={bottomPaddingMm}
        hasOverflow={isActivePage && hasOverflow}
      />
      <AnchorOverlay
        schemas={schemasList[index] || []}
        focusedSchemaIds={focusedSchemaIds}
        pageSize={fallbackPageSize}
        basePdf={basePdf}
        zoom={ZOOM}
      />
      <StaticSchema
        template={{ schemas: schemasList, basePdf }}
        input={staticInput}
        scale={scale}
        totalPages={schemasList.length}
        currentPage={index + 1}
      />
      <Guides
        paperSize={paperSize}
        horizontalRef={(e) => {
          if (e) horizontalGuidesRef.current[index] = e;
        }}
        verticalRef={(e) => {
          if (e) verticalGuidesRef.current[index] = e;
        }}
      />
      {!isActivePage ? (
        <Mask width={paperSize.width + RULER_HEIGHT} height={paperSize.height + RULER_HEIGHT} />
      ) : (
        !editing && (
          <Moveable
            ref={moveableRef}
            target={activeElements}
            bounds={{
              // pdfme#284: expand the moveable bounds so rotated schemas can be
              // dragged so their rotated bounding box reaches the canvas edge.
              // The on-canvas check still happens in onDrag using the rotated
              // bounding box.
              left: -dragBoundsExpansion.leftPad * ZOOM,
              top: -dragBoundsExpansion.topPad * ZOOM,
              bottom: paperSize.height + dragBoundsExpansion.bottomPad * ZOOM,
              right: paperSize.width + dragBoundsExpansion.rightPad * ZOOM,
            }}
            horizontalGuidelines={getGuideLines(horizontalGuidesRef.current, index)}
            verticalGuidelines={getGuideLines(verticalGuidesRef.current, index)}
            keepRatio={isPressShiftKey}
            rotatable={rotatable}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            onDragGroupEnd={onDragEnds}
            onRotate={onRotate}
            onRotateEnd={onRotateEnd}
            onRotateGroupEnd={onRotateEnds}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            onResizeGroupEnd={onResizeEnds}
            onClick={onClickMoveable}
          />
        )
      )}
    </>
  );
};

export default CanvasPage;
