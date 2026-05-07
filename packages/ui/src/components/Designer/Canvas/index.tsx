import React, {
  Ref,
  useContext,
  MutableRefObject,
  useRef,
  useEffect,
  forwardRef,
} from 'react';
import { theme, Button } from 'antd';
import MoveableComponent from 'react-moveable';
import {
  ZOOM,
  SchemaForUI,
  Size,
  ChangeSchemas,
  BasePdf,
  getDesignDataInput,
} from '@pdfweave/common';
import { OptionsContext, PluginsRegistry } from '../../../contexts.js';
import { X } from 'lucide-react';
import { RIGHT_SIDEBAR_WIDTH, DESIGNER_CLASSNAME } from '../../../constants.js';
import { usePrevious } from '../../../hooks.js';
import { uuid } from '../../../helper.js';
import Paper from '../../Paper.js';
import Selecto from './Selecto.js';
import ContextMenu from './ContextMenu.js';
import CanvasSchema from './CanvasSchema.js';
import CanvasPage from './CanvasPage.js';
import { useRenderedHeights } from './hooks/useRenderedHeights.js';
import { useShiftKeyTracker } from './hooks/useShiftKeyTracker.js';
import { usePageOverflow } from './hooks/usePageOverflow.js';
import { useSelectionHelpers } from './hooks/useSelectionHelpers.js';
import { useContextMenu } from './hooks/useContextMenu.js';
import { useDragResize } from './hooks/useDragResize.js';
import { useMarqueeSelection } from './hooks/useMarqueeSelection.js';

const DELETE_BTN_ID = uuid();
const fmt4Num = (prop: string) => Number(prop.replace('px', ''));

const DeleteButton = ({ activeElements: aes }: { activeElements: HTMLElement[] }) => {
  const { token } = theme.useToken();

  const size = 26;
  const top = Math.min(...aes.map(({ style }) => fmt4Num(style.top)));
  const left = Math.max(...aes.map(({ style }) => fmt4Num(style.left) + fmt4Num(style.width))) + 10;

  return (
    <Button
      id={DELETE_BTN_ID}
      className={DESIGNER_CLASSNAME + 'delete-button'}
      style={{
        position: 'absolute',
        zIndex: 1,
        top,
        left,
        width: size,
        height: size,
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: token.borderRadius,
        color: token.colorWhite,
        background: token.colorPrimary,
      }}
    >
      <X style={{ pointerEvents: 'none' }} />
    </Button>
  );
};

interface GuidesInterface {
  getGuides(): number[];
  scroll(pos: number): void;
  scrollGuides(pos: number): void;
  loadGuides(guides: number[]): void;
  resize(): void;
}

interface Props {
  basePdf: BasePdf;
  height: number;
  hoveringSchemaId: string | null;
  onChangeHoveringSchemaId: (id: string | null) => void;
  pageCursor: number;
  schemasList: SchemaForUI[][];
  scale: number;
  backgrounds: string[];
  pageSizes: Size[];
  size: Size;
  activeElements: HTMLElement[];
  onEdit: (targets: HTMLElement[]) => void;
  changeSchemas: ChangeSchemas;
  removeSchemas: (ids: string[]) => void;
  designerActions: {
    copy: (ids?: string[]) => void;
    cut: (ids?: string[]) => void;
    paste: () => void;
    duplicate: (ids?: string[]) => void;
    group: (ids?: string[]) => void;
    ungroup: (ids?: string[]) => void;
    remove: (ids?: string[]) => void;
    bringToFront: (ids?: string[]) => void;
    sendToBack: (ids?: string[]) => void;
    canPaste: () => boolean;
  };
  paperRefs: MutableRefObject<HTMLDivElement[]>;
  sidebarOpen: boolean;
  onPageOverflowChange?: (info: { pageIndex: number; overflowingSchemaCount: number }) => void;
}

const Canvas = (props: Props, ref: Ref<HTMLDivElement>) => {
  const {
    basePdf,
    pageCursor,
    scale,
    backgrounds,
    pageSizes,
    size,
    activeElements,
    schemasList,
    hoveringSchemaId,
    onEdit,
    changeSchemas,
    removeSchemas,
    designerActions,
    onChangeHoveringSchemaId,
    paperRefs,
    sidebarOpen,
    onPageOverflowChange,
  } = props;
  const { token } = theme.useToken();
  const pluginsRegistry = useContext(PluginsRegistry);
  const options = useContext(OptionsContext);
  const designDataInput = getDesignDataInput(options.designData);
  const verticalGuides = useRef<GuidesInterface[]>([]);
  const horizontalGuides = useRef<GuidesInterface[]>([]);
  const moveable = useRef<MoveableComponent>(null);

  const { isPressShiftKey, setIsPressShiftKey, editing, setEditing } = useShiftKeyTracker();
  const { renderedSchemaHeights, onRenderedHeightChange } = useRenderedHeights();
  const {
    contextMenu,
    setContextMenu,
    contextSchemas,
    applyAnchorSource,
    onContextMenuAction,
    closeContextMenu,
  } = useContextMenu({
    pageCursor,
    schemasList,
    changeSchemas,
    designerActions,
  });

  const prevSchemas = usePrevious(schemasList[pageCursor]);
  const { bottomPaddingMm, hasOverflow } = usePageOverflow({
    basePdf,
    pageCursor,
    pageSizes,
    schemasList,
    renderedSchemaHeights,
    onPageOverflowChange,
  });

  useEffect(() => {
    moveable.current?.updateRect();
    if (!prevSchemas) {
      return;
    }

    const prevSchemaKeys = JSON.stringify(prevSchemas[pageCursor] || {});
    const schemaKeys = JSON.stringify(schemasList[pageCursor] || {});

    if (prevSchemaKeys === schemaKeys) {
      moveable.current?.updateRect();
    }
  }, [pageCursor, schemasList, prevSchemas]);

  const {
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
  } = useDragResize({
    basePdf,
    pageCursor,
    pageSizes,
    schemasList,
    activeElements,
    changeSchemas,
    pluginsRegistry,
  });

  const onClickMoveable = () => {
    // Just set editing to true without trying to access event properties
    setEditing(true);
  };

  const {
    focusedSchemaIds,
    schemaPageIndexById,
    selectContextTargets,
    toggleShiftClickSelection,
  } = useSelectionHelpers({
    activeElements,
    hoveringSchemaId,
    schemasList,
    pageCursor,
    onEdit,
    onEditingChange: setEditing,
  });

  const { onSelectoDragStart, onSelectoSelect } = useMarqueeSelection({
    paperRefs,
    pageCursor,
    moveable,
    activeElements,
    deleteButtonId: DELETE_BTN_ID,
    onEdit,
    removeSchemas,
    setEditing,
    setIsPressShiftKey,
  });

  return (
    <div
      className={DESIGNER_CLASSNAME + 'canvas'}
      onContextMenu={(event) => {
        if (event.currentTarget === event.target) {
          event.preventDefault();
          closeContextMenu();
        }
      }}
      style={{
        position: 'relative',
        overflow: 'auto',
        marginRight: sidebarOpen ? RIGHT_SIDEBAR_WIDTH : 0,
        ...size,
      }}
      ref={ref}
    >
      <Selecto
        container={paperRefs.current[pageCursor]}
        continueSelect={isPressShiftKey}
        onDragStart={onSelectoDragStart}
        onSelect={onSelectoSelect}
      />
      <Paper
        paperRefs={paperRefs}
        scale={scale}
        size={size}
        schemasList={schemasList}
        pageSizes={pageSizes}
        backgrounds={backgrounds}
        hasRulers={true}
        renderPaper={({ index, paperSize }) => (
          <CanvasPage
            index={index}
            paperSize={paperSize}
            pageCursor={pageCursor}
            pageSizes={pageSizes}
            basePdf={basePdf}
            schemasList={schemasList}
            scale={scale}
            bottomPaddingMm={bottomPaddingMm}
            hasOverflow={hasOverflow}
            focusedSchemaIds={focusedSchemaIds}
            editing={editing}
            activeElements={activeElements}
            isPressShiftKey={isPressShiftKey}
            rotatable={rotatable}
            dragBoundsExpansion={dragBoundsExpansion}
            moveableRef={moveable}
            horizontalGuidesRef={horizontalGuides}
            verticalGuidesRef={verticalGuides}
            deleteButton={<DeleteButton activeElements={activeElements} />}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            onDragEnds={onDragEnds}
            onRotate={onRotate}
            onRotateEnd={onRotateEnd}
            onRotateEnds={onRotateEnds}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            onResizeEnds={onResizeEnds}
            onClickMoveable={onClickMoveable}
          />
        )}
        renderSchema={({ schema, index }) => {
          const schemaPageIndex = schemaPageIndexById.get(schema.id) ?? pageCursor;
          const outlineColor = `1px ${hoveringSchemaId === schema.id ? 'solid' : 'dashed'} ${
            schema.readOnly && hoveringSchemaId !== schema.id
              ? 'transparent'
              : token.colorPrimary
          }`;
          return (
            <CanvasSchema
              schema={schema}
              index={index}
              basePdf={basePdf}
              pageCursor={pageCursor}
              pageSizes={pageSizes}
              schemasList={schemasList}
              schemaPageIndex={schemaPageIndex}
              bottomPaddingMm={bottomPaddingMm}
              designDataInput={designDataInput}
              activeElements={activeElements}
              hoveringSchemaId={hoveringSchemaId}
              editing={editing}
              scale={scale}
              renderedHeight={renderedSchemaHeights[schema.id]}
              outlineColor={outlineColor}
              changeSchemas={changeSchemas}
              onChangeHoveringSchemaId={onChangeHoveringSchemaId}
              onRenderedHeightChange={onRenderedHeightChange}
              onEdit={onEdit}
              setEditing={setEditing}
              setContextMenu={setContextMenu}
              selectContextTargets={selectContextTargets}
              toggleShiftClickSelection={toggleShiftClickSelection}
            />
          );
        }}
      />
      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        canPaste={designerActions.canPaste()}
        canGroup={contextSchemas.length > 1}
        canUngroup={contextSchemas.some((schema) => Boolean(schema.group))}
        applyAnchorSourceSchemaName={
          applyAnchorSource ? applyAnchorSource.schema.name || applyAnchorSource.schema.id : undefined
        }
        onAction={onContextMenuAction}
        onClose={() => closeContextMenu()}
      />
    </div>
  );
};
export default forwardRef<HTMLDivElement, Props>(Canvas);
