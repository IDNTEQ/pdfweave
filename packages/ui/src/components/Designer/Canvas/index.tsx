import React, {
  Ref,
  useMemo,
  useContext,
  MutableRefObject,
  useRef,
  useState,
  useEffect,
  forwardRef,
  useCallback,
} from 'react';
import { theme, Button } from 'antd';
import MoveableComponent, { OnDrag, OnRotate, OnResize } from 'react-moveable';
import {
  cloneDeep,
  ZOOM,
  SchemaForUI,
  Size,
  ChangeSchemas,
  BasePdf,
  SchemaLayoutRule,
  isBlankPdf,
  getDesignDataInput,
  replacePlaceholders,
  resolveSchemaValue,
} from '@pdfweave/common';
import { OptionsContext, PluginsRegistry } from '../../../contexts.js';
import { X } from 'lucide-react';
import {
  RULER_HEIGHT,
  RIGHT_SIDEBAR_WIDTH,
  DESIGNER_CLASSNAME,
  SELECTABLE_CLASSNAME,
} from '../../../constants.js';
import { usePrevious } from '../../../hooks.js';
import { round, flatten, uuid, getRotatedBoundingBoxOffsets, isAnchoredLayout } from '../../../helper.js';
import Paper from '../../Paper.js';
import Renderer from '../../Renderer.js';
import Selecto from './Selecto.js';
import Moveable from './Moveable.js';
import Guides from './Guides.js';
import Mask from './Mask.js';
import Padding from './Padding.js';
import PageOverflowIndicator from './PageOverflowIndicator.js';
import AnchorOverlay from './AnchorOverlay.js';
import StaticSchema from '../../StaticSchema.js';
import ContextMenu, { type DesignerContextMenuAction } from './ContextMenu.js';

const mm2px = (mm: number) => mm * 3.7795275591;

const DELETE_BTN_ID = uuid();
const fmt4Num = (prop: string) => Number(prop.replace('px', ''));
const fmt = (prop: string) => round(fmt4Num(prop) / ZOOM, 2);
const isTopLeftResize = (d: string) => d === '-1,-1' || d === '-1,0' || d === '0,-1';
const normalizeRotate = (angle: number) => ((angle % 360) + 360) % 360;
const getBasePdfPadding = (basePdf: BasePdf): [number, number, number, number] => {
  const maybePadding = (basePdf as { padding?: [number, number, number, number] }).padding;
  return Array.isArray(maybePadding) ? maybePadding : [0, 0, 0, 0];
};

type ApplyAnchorSource = {
  schema: SchemaForUI;
  layout: Extract<SchemaLayoutRule, { mode: 'anchored' }>;
};

const getSchemaLayout = (schema: SchemaForUI): SchemaLayoutRule | undefined =>
  (schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout;

const schemaAnchorIds = (schema: SchemaForUI): Set<string> =>
  new Set([schema.id, schema.name].filter((id): id is string => Boolean(id)));

const layoutTargetsSchema = (
  layout: Extract<SchemaLayoutRule, { mode: 'anchored' }>,
  schema: SchemaForUI,
): boolean => {
  const ids = schemaAnchorIds(schema);
  const xTarget = 'ref' in layout.x ? layout.x.ref.schemaId : null;
  const yTarget = 'ref' in layout.y ? layout.y.ref.schemaId : null;
  return [xTarget, yTarget].some((target) => Boolean(target && ids.has(target)));
};

const findApplyAnchorSource = (
  schemas: SchemaForUI[],
  schemaIds: string[],
): ApplyAnchorSource | null => {
  const schemaById = new Map(schemas.map((schema) => [schema.id, schema]));

  for (let index = schemaIds.length - 1; index >= 0; index -= 1) {
    const schema = schemaById.get(schemaIds[index]);
    if (!schema) continue;

    const layout = getSchemaLayout(schema);
    if (isAnchoredLayout(layout)) return { schema, layout };
  }

  return null;
};

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

  const [isPressShiftKey, setIsPressShiftKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    schemaIds: string[];
  } | null>(null);
  const [renderedSchemaHeights, setRenderedSchemaHeights] = useState<Record<string, number>>({});

  const prevSchemas = usePrevious(schemasList[pageCursor]);
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

  const onKeydown = (e: KeyboardEvent) => {
    if (e.shiftKey) setIsPressShiftKey(true);
  };
  const onKeyup = (e: KeyboardEvent) => {
    if (e.key === 'Shift' || !e.shiftKey) setIsPressShiftKey(false);
    if (e.key === 'Escape' || e.key === 'Esc') setEditing(false);
  };

  const initEvents = useCallback(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
  }, []);

  const destroyEvents = useCallback(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('keyup', onKeyup);
  }, []);

  useEffect(() => {
    initEvents();

    return destroyEvents;
  }, [initEvents, destroyEvents]);

  useEffect(() => {
    const overflowKey = `${pageCursor}:${overflowingSchemaCount}`;
    if (prevOverflowKey.current === overflowKey) {
      return;
    }

    prevOverflowKey.current = overflowKey;
    onPageOverflowChange?.({ pageIndex: pageCursor, overflowingSchemaCount });
  }, [onPageOverflowChange, overflowingSchemaCount, pageCursor]);

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

  const getGuideLines = (guides: GuidesInterface[], index: number) =>
    guides[index] && guides[index].getGuides().map((g) => g * ZOOM);

  const onClickMoveable = () => {
    // Just set editing to true without trying to access event properties
    setEditing(true);
  };

  const activeIds = useMemo(() => activeElements.map((ae) => ae.id), [activeElements]);
  const activeIdsRef = useRef<string[]>(activeIds);
  activeIdsRef.current = activeIds;
  const focusedSchemaIds = useMemo(() => {
    const ids = new Set(activeIds);
    if (hoveringSchemaId) ids.add(hoveringSchemaId);
    return ids;
  }, [activeIds, hoveringSchemaId]);
  const schemaPageIndexById = useMemo(() => {
    const pageIndexById = new Map<string, number>();
    schemasList.forEach((pageSchemas, index) => {
      pageSchemas.forEach((schema) => {
        pageIndexById.set(schema.id, index);
      });
    });
    return pageIndexById;
  }, [schemasList]);

  const expandIdsByGroups = useCallback(
    (ids: string[]) => {
      const pageSchemas = schemasList[pageCursor] || [];
      const selectedIds = new Set(ids);
      const selectedGroups = new Set(
        pageSchemas
          .filter((schema) => selectedIds.has(schema.id) && schema.group)
          .map((schema) => schema.group as string),
      );

      if (selectedGroups.size === 0) return ids;

      pageSchemas.forEach((schema) => {
        if (schema.group && selectedGroups.has(schema.group)) {
          selectedIds.add(schema.id);
        }
      });

      return pageSchemas.filter((schema) => selectedIds.has(schema.id)).map((schema) => schema.id);
    },
    [pageCursor, schemasList],
  );

  const getElementsByIds = (ids: string[]) => {
    const selectableElements = Array.from(document.getElementsByClassName(SELECTABLE_CLASSNAME));
    return ids
      .map(
        (id) =>
          selectableElements.find((element) => element.id === id) ?? document.getElementById(id),
      )
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
  };

  const onRenderedHeightChange = useCallback((schemaId: string, height: number) => {
    setRenderedSchemaHeights((current) => {
      if (current[schemaId] === height) {
        return current;
      }
      return { ...current, [schemaId]: height };
    });
  }, []);

  const selectContextTargets = (schema: SchemaForUI, target: HTMLElement) => {
    const ids = activeIds.includes(schema.id) ? activeIds : [schema.id];
    const targets = getElementsByIds(expandIdsByGroups(ids));
    return targets.length > 0 ? targets : [target];
  };

  const toggleShiftClickSelection = (schema: SchemaForUI, target: HTMLElement) => {
    const nextIds = new Set(activeIdsRef.current);
    if (nextIds.has(schema.id)) {
      nextIds.delete(schema.id);
    } else {
      nextIds.add(schema.id);
    }

    const targets = getElementsByIds(expandIdsByGroups(Array.from(nextIds)));
    onEdit(targets.length > 0 ? targets : [target]);
    setEditing(false);
  };

  const contextSchemas = useMemo(() => {
    const ids = new Set(contextMenu?.schemaIds ?? []);
    return (schemasList[pageCursor] || []).filter((schema) => ids.has(schema.id));
  }, [contextMenu, pageCursor, schemasList]);

  const applyAnchorSource = useMemo(
    () =>
      contextMenu && contextMenu.schemaIds.length > 1
        ? findApplyAnchorSource(contextSchemas, contextMenu.schemaIds)
        : null,
    [contextMenu, contextSchemas],
  );

  const onContextMenuAction = (action: DesignerContextMenuAction) => {
    const ids = contextMenu?.schemaIds ?? [];
    switch (action) {
      case 'copy':
        designerActions.copy(ids);
        break;
      case 'cut':
        designerActions.cut(ids);
        break;
      case 'paste':
        designerActions.paste();
        break;
      case 'duplicate':
        designerActions.duplicate(ids);
        break;
      case 'group':
        designerActions.group(ids);
        break;
      case 'ungroup':
        designerActions.ungroup(ids);
        break;
      case 'applyAnchorToSelection':
        if (applyAnchorSource) {
          const schemaById = new Map(contextSchemas.map((schema) => [schema.id, schema]));
          const changes = ids
            .filter((id) => id !== applyAnchorSource.schema.id)
            .filter((id) => {
              const schema = schemaById.get(id);
              return schema ? !layoutTargetsSchema(applyAnchorSource.layout, schema) : true;
            })
            .map((schemaId) => ({
              key: 'layout',
              value: cloneDeep(applyAnchorSource.layout),
              schemaId,
            }));
          if (changes.length > 0) {
            changeSchemas(changes);
          }
        }
        break;
      case 'delete':
        designerActions.remove(ids);
        break;
      case 'bringToFront':
        designerActions.bringToFront(ids);
        break;
      case 'sendToBack':
        designerActions.sendToBack(ids);
        break;
      default:
        break;
    }
    setContextMenu(null);
  };

  const rotatable = useMemo(() => {
    const selectedSchemas = (schemasList[pageCursor] || []).filter((s) =>
      activeElements.map((ae) => ae.id).includes(s.id),
    );
    const schemaTypes = selectedSchemas.map((s) => s.type);
    const uniqueSchemaTypes = [...new Set(schemaTypes)];

    // Create a type-safe array of default schemas
    const defaultSchemas: Record<string, unknown>[] = [];

    pluginsRegistry.entries().forEach(([, plugin]) => {
      if (plugin.propPanel.defaultSchema) {
        defaultSchemas.push(plugin.propPanel.defaultSchema as Record<string, unknown>);
      }
    });

    // Check if all schema types have rotate property
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

  return (
    <div
      className={DESIGNER_CLASSNAME + 'canvas'}
      onContextMenu={(event) => {
        if (event.currentTarget === event.target) {
          event.preventDefault();
          setContextMenu(null);
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
        onDragStart={(e) => {
          // Use type assertion to safely access inputEvent properties
          const inputEvent = e.inputEvent as MouseEvent | TouchEvent;
          const target = inputEvent.target as Element | null;
          const isMoveableElement = moveable.current?.isMoveableElement(target as Element);

          if ((inputEvent.type === 'touchstart' && e.isTrusted) || isMoveableElement) {
            e.stop();
          }

          if (paperRefs.current[pageCursor] === target) {
            onEdit([]);
          }

          // Check if the target is an HTMLElement and has an id property
          const targetElement = target as HTMLElement | null;
          if (targetElement && targetElement.id === DELETE_BTN_ID) {
            removeSchemas(activeElements.map((ae) => ae.id));
          }
        }}
        onSelect={(e) => {
          // Use type assertions to safely access properties
          const inputEvent = e.inputEvent as MouseEvent | TouchEvent;
          const added = e.added as HTMLElement[];
          const selected = e.selected as HTMLElement[];

          const isDragStartInput =
            inputEvent.type === 'mousedown' || inputEvent.type === 'touchstart';
          const isClick = isDragStartInput && e.isDragStartEnd;
          const mouseEvent = inputEvent as MouseEvent;
          const isShiftClick =
            isClick && mouseEvent && typeof mouseEvent.shiftKey === 'boolean' && mouseEvent.shiftKey;
          let newActiveElements: HTMLElement[] = [];

          if (isShiftClick) {
            const nextElements = activeElements.concat(selected.length > 0 ? selected : added);
            newActiveElements = nextElements.filter(
              (element, index, elements) => elements.findIndex((item) => item.id === element.id) === index,
            );
          } else {
            newActiveElements = selected;
          }
          onEdit(newActiveElements);

          if (newActiveElements != activeElements) {
            setEditing(false);
          }

          // For MacOS CMD+SHIFT+3/4 screenshots where the keydown event is never received, check mouse too
          if (mouseEvent && typeof mouseEvent.shiftKey === 'boolean' && !mouseEvent.shiftKey) {
            setIsPressShiftKey(false);
          }
        }}
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
          <>
            {!editing && activeElements.length > 0 && pageCursor === index && (
              <DeleteButton activeElements={activeElements} />
            )}
            <Padding basePdf={basePdf} />
            <PageOverflowIndicator
              pageHeight={pageSizes[index]?.height ?? paperSize.height / ZOOM}
              bottomPaddingMm={bottomPaddingMm}
              hasOverflow={pageCursor === index && hasOverflow}
            />
            <AnchorOverlay
              schemas={schemasList[index] || []}
              focusedSchemaIds={focusedSchemaIds}
              pageSize={
                pageSizes[index] ?? {
                  width: paperSize.width / ZOOM,
                  height: paperSize.height / ZOOM,
                }
              }
              basePdf={basePdf}
              zoom={ZOOM}
            />
            <StaticSchema
              template={{ schemas: schemasList, basePdf }}
              input={Object.fromEntries(
                schemasList.flat().map(({ name, content = '' }) => [name, content]),
              )}
              scale={scale}
              totalPages={schemasList.length}
              currentPage={index + 1}
            />
            <Guides
              paperSize={paperSize}
              horizontalRef={(e) => {
                if (e) horizontalGuides.current[index] = e;
              }}
              verticalRef={(e) => {
                if (e) verticalGuides.current[index] = e;
              }}
            />
            {pageCursor !== index ? (
              <Mask
                width={paperSize.width + RULER_HEIGHT}
                height={paperSize.height + RULER_HEIGHT}
              />
            ) : (
              !editing && (
                <Moveable
                  ref={moveable}
                  target={activeElements}
                  bounds={{
                    // pdfme#284: expand the moveable bounds so rotated schemas
                    // can be dragged so their rotated bounding box reaches the
                    // canvas edge. The on-canvas check still happens in
                    // `onDrag` using the rotated bounding box.
                    left: -dragBoundsExpansion.leftPad * ZOOM,
                    top: -dragBoundsExpansion.topPad * ZOOM,
                    bottom: paperSize.height + dragBoundsExpansion.bottomPad * ZOOM,
                    right: paperSize.width + dragBoundsExpansion.rightPad * ZOOM,
                  }}
                  horizontalGuidelines={getGuideLines(horizontalGuides.current, index)}
                  verticalGuidelines={getGuideLines(verticalGuides.current, index)}
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
        )}
        renderSchema={({ schema, index }) => {
          const schemaPageIndex = schemaPageIndexById.get(schema.id) ?? pageCursor;
          const schemaPageHeight = pageSizes[schemaPageIndex]?.height;
          const mode =
            editing && activeElements.map((ae) => ae.id).includes(schema.id)
              ? 'designer'
              : 'viewer';

          const value = schema.binding
            ? resolveSchemaValue({
                schema,
                input: designDataInput,
                schemas: schemasList,
                totalPages: schemasList.length,
                currentPage: index + 1,
              })
            : (() => {
                const content = schema.content || '';
                if (mode === 'designer' || !schema.readOnly) return content;
                const variables = {
                  ...schemasList.flat().reduce(
                    (acc, currSchema) => {
                      acc[currSchema.name] = currSchema.content || '';
                      return acc;
                    },
                    {} as Record<string, string>,
                  ),
                  totalPages: schemasList.length,
                  currentPage: index + 1,
                };
                return replacePlaceholders({ content, variables, schemas: schemasList });
              })();

          return (
            <Renderer
              key={schema.id}
              schema={schema}
              basePdf={basePdf}
              value={value}
              onChangeHoveringSchemaId={onChangeHoveringSchemaId}
              mode={mode}
              onChange={
                (schemasList[pageCursor] || []).some((s) => s.id === schema.id)
                  ? (arg) => {
                      // Use type assertion to safely handle the argument
                      type ChangeArg = { key: string; value: unknown };
                      const args = Array.isArray(arg) ? (arg as ChangeArg[]) : [arg as ChangeArg];
                      changeSchemas(
                        args.map(({ key, value }) => ({ key, value, schemaId: schema.id })),
                      );
                    }
                  : undefined
              }
              stopEditing={() => setEditing(false)}
              outline={`1px ${hoveringSchemaId === schema.id ? 'solid' : 'dashed'} ${
                schema.readOnly && hoveringSchemaId !== schema.id
                  ? 'transparent'
                  : token.colorPrimary
              }`}
              scale={scale}
              renderedHeight={renderedSchemaHeights[schema.id]}
              onRenderedHeightChange={onRenderedHeightChange}
              pageBoundsForClip={
                typeof schemaPageHeight === 'number'
                  ? { contentBottomY: schemaPageHeight - bottomPaddingMm }
                  : undefined
              }
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setEditing(false);
                const targets = selectContextTargets(schema, event.currentTarget);
                onEdit(targets);
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  schemaIds: targets.map((target) => target.id),
                });
              }}
              onMouseDownCapture={(event) => {
                if (!event.shiftKey) return;
                event.preventDefault();
                event.stopPropagation();
                event.nativeEvent.stopImmediatePropagation();
                toggleShiftClickSelection(schema, event.currentTarget);
              }}
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
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
};
export default forwardRef<HTMLDivElement, Props>(Canvas);
