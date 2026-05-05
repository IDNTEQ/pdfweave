import React, {
  useRef,
  useState,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import {
  cloneDeep,
  ZOOM,
  Template,
  Schema,
  SchemaForUI,
  ChangeSchemas,
  DesignerProps,
  Size,
  SchemaLayoutRule,
  isBlankPdf,
  px2mm,
} from '@pdfweave/common';
import { DndContext } from '@dnd-kit/core';
import RightSidebar from './RightSidebar/index.js';
import LeftSidebar from './LeftSidebar.js';
import Canvas from './Canvas/index.js';
import { RULER_HEIGHT, RIGHT_SIDEBAR_WIDTH, LEFT_SIDEBAR_WIDTH } from '../../constants.js';
import { I18nContext, OptionsContext, PluginsRegistry } from '../../contexts.js';
import {
  schemasList2template,
  uuid,
  round,
  template2SchemasList,
  getPagesScrollTopByIndex,
  getUniqueSchemaName,
  changeSchemas as _changeSchemas,
  useMaxZoom,
} from '../../helper.js';
import { useUIPreProcessor, useScrollPageCursor, useInitEvents } from '../../hooks.js';
import Root from '../Root.js';
import ErrorScreen from '../ErrorScreen.js';
import CtlBar from '../CtlBar.js';

type AnchoredLayoutRule = Extract<SchemaLayoutRule, { mode: 'anchored' }>;

const isAnchoredLayoutRule = (layout: unknown): layout is AnchoredLayoutRule =>
  typeof layout === 'object' &&
  layout !== null &&
  (layout as { mode?: unknown }).mode === 'anchored';

const schemaAnchorIds = (schema: SchemaForUI): string[] =>
  Array.from(new Set([schema.id, schema.name].filter((id): id is string => Boolean(id))));

const repairAnchorsAfterRemove = (
  schemas: SchemaForUI[],
  removedSchemas: SchemaForUI[],
): SchemaForUI[] => {
  const removedIds = new Set(removedSchemas.flatMap(schemaAnchorIds));
  if (removedIds.size === 0) return schemas;

  return schemas.map((schema) => {
    const layout = (schema as SchemaForUI & { layout?: SchemaLayoutRule }).layout;
    if (!isAnchoredLayoutRule(layout)) return schema;

    let nextLayout: AnchoredLayoutRule = layout;
    if (layout.x.mode !== 'pageLeft' && removedIds.has(layout.x.ref.schemaId)) {
      nextLayout = {
        ...nextLayout,
        x: { mode: 'pageLeft', offsetMm: round(schema.position.x, 2) },
      };
    }
    if (layout.y.mode !== 'pageTop' && removedIds.has(layout.y.ref.schemaId)) {
      nextLayout = {
        ...nextLayout,
        y: { mode: 'pageTop', offsetMm: round(schema.position.y, 2) },
      };
    }

    if (nextLayout === layout) return schema;
    return { ...schema, layout: nextLayout };
  });
};

/**
 * When the canvas scales there is a displacement of the starting position of the dragged schema.
 * It moves left or right from the top-left corner of the drag icon depending on the scale.
 * This function calculates the adjustment needed to compensate for this displacement.
 */
const scaleDragPosAdjustment = (adjustment: number, scale: number): number => {
  if (scale > 1) return adjustment * (scale - 1);
  if (scale < 1) return adjustment * -(1 - scale);
  return 0;
};

const TemplateEditor = ({
  template,
  size,
  onSaveTemplate,
  onChangeTemplate,
  onPageCursorChange,
  requestedPageCursor,
}: Omit<DesignerProps, 'domContainer'> & {
  size: Size;
  onSaveTemplate: (t: Template) => void;
  onChangeTemplate: (t: Template) => void;
} & {
  onChangeTemplate: (t: Template) => void;
  onPageCursorChange: (newPageCursor: number, totalPages: number) => void;
  /**
   * Page cursor requested by the parent class wrapper (e.g. via
   * `Designer.updateTemplate(template, { page })`). When provided this is
   * applied after the next template-driven re-render. See pdfme#1235.
   */
  requestedPageCursor?: number | null;
}) => {
  const past = useRef<SchemaForUI[][]>([]);
  const future = useRef<SchemaForUI[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const paperRefs = useRef<HTMLDivElement[]>([]);

  const i18n = useContext(I18nContext);
  const pluginsRegistry = useContext(PluginsRegistry);
  const options = useContext(OptionsContext);
  const maxZoom = useMaxZoom();

  const [hoveringSchemaId, setHoveringSchemaId] = useState<string | null>(null);
  const [activeElements, setActiveElements] = useState<HTMLElement[]>([]);
  const [schemasList, setSchemasList] = useState<SchemaForUI[][]>([[]] as SchemaForUI[][]);
  const [pageCursor, setPageCursor] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(options.zoomLevel ?? 1);
  const [sidebarOpen, setSidebarOpen] = useState(options.sidebarOpen ?? true);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [prevTemplate, setPrevTemplate] = useState<Template | null>(null);
  const copiedSchemas = useRef<SchemaForUI[] | null>(null);

  const { backgrounds, pageSizes, scale, error, refresh } = useUIPreProcessor({
    template,
    size,
    zoomLevel,
    maxZoom,
  });

  const getElementsByIds = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element instanceof HTMLElement),
    [],
  );

  const onEdit = useCallback(
    (targets: Array<HTMLElement | null | undefined>) => {
      const selectedTargets = targets.filter(
        (target): target is HTMLElement => target instanceof HTMLElement,
      );
      const pageSchemas = schemasList[pageCursor] || [];
      const selectedIds = new Set(selectedTargets.map((target) => target.id));
      const selectedGroups = new Set(
        pageSchemas
          .filter((schema) => selectedIds.has(schema.id) && schema.group)
          .map((schema) => schema.group as string),
      );

      if (selectedGroups.size > 0) {
        pageSchemas.forEach((schema) => {
          if (schema.group && selectedGroups.has(schema.group)) {
            selectedIds.add(schema.id);
          }
        });
      }

      const groupedTargets = getElementsByIds(
        pageSchemas.filter((schema) => selectedIds.has(schema.id)).map((schema) => schema.id),
      );
      const groupedTargetIds = new Set(groupedTargets.map((target) => target.id));
      const remainingTargets = selectedTargets.filter((target) => !groupedTargetIds.has(target.id));
      setActiveElements(groupedTargets.concat(remainingTargets));
      setHoveringSchemaId(null);
    },
    [getElementsByIds, pageCursor, schemasList],
  );

  const onEditEnd = useCallback(() => {
    setActiveElements([]);
    setHoveringSchemaId(null);
  }, []);

  useEffect(() => {
    if (typeof options.zoomLevel === 'number') {
      setZoomLevel(options.zoomLevel);
    }
  }, [options.zoomLevel]);

  useEffect(() => {
    if (typeof options.sidebarOpen === 'boolean') {
      setSidebarOpen(options.sidebarOpen);
    }
  }, [options.sidebarOpen]);

  useScrollPageCursor({
    ref: canvasRef,
    pageSizes,
    scale,
    pageCursor,
    onChangePageCursor: (p) => {
      setPageCursor(p);
      onPageCursorChange(p, schemasList.length);
      onEditEnd();
    },
  });

  useLayoutEffect(() => {
    const updateHeight = () => {
      setCanvasHeight(canvasRef.current ? canvasRef.current.clientHeight : 0);
    };
    updateHeight();

    if (typeof ResizeObserver === 'function' && canvasRef.current) {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(canvasRef.current);
      return () => observer.disconnect();
    }
    return undefined;
  }, [scale]);

  const commitSchemas = useCallback(
    (newSchemas: SchemaForUI[]) => {
      future.current = [];
      past.current.push(cloneDeep(schemasList[pageCursor]));
      const _schemasList = cloneDeep(schemasList);
      _schemasList[pageCursor] = newSchemas;
      setSchemasList(_schemasList);
      onChangeTemplate(schemasList2template(_schemasList, template.basePdf));
    },
    [template, schemasList, pageCursor, onChangeTemplate],
  );

  const removeSchemas = useCallback(
    (ids: string[]) => {
      const removedSchemas = schemasList[pageCursor].filter((schema) => ids.includes(schema.id));
      const remainingSchemas = schemasList[pageCursor].filter((schema) => !ids.includes(schema.id));
      commitSchemas(repairAnchorsAfterRemove(remainingSchemas, removedSchemas));
      onEditEnd();
    },
    [schemasList, pageCursor, commitSchemas, onEditEnd],
  );

  const changeSchemas: ChangeSchemas = useCallback(
    (objs) => {
      _changeSchemas({
        objs,
        schemas: schemasList[pageCursor],
        basePdf: template.basePdf,
        pluginsRegistry,
        pageSize: pageSizes[pageCursor],
        commitSchemas,
      });
    },
    [commitSchemas, pageCursor, schemasList, pluginsRegistry, pageSizes, template.basePdf],
  );

  const getActiveIds = useCallback(
    (ids?: string[]) => (ids && ids.length > 0 ? ids : activeElements.map((ae) => ae.id)),
    [activeElements],
  );

  const copySchemas = useCallback(
    (ids?: string[]) => {
      const targetIds = getActiveIds(ids);
      if (targetIds.length === 0) return;
      const selected = schemasList[pageCursor].filter((schema) => targetIds.includes(schema.id));
      copiedSchemas.current = cloneDeep(selected);
    },
    [getActiveIds, pageCursor, schemasList],
  );

  const pasteSchemas = useCallback(() => {
    if (!copiedSchemas.current || copiedSchemas.current.length === 0) return;
    const schema = schemasList[pageCursor];
    const stackUniqueSchemaNames: string[] = [];
    const groupIdMap = new Map<string, string>();
    const pasteSchemas = copiedSchemas.current.map((cs) => {
      const id = uuid();
      const name = getUniqueSchemaName({
        copiedSchemaName: cs.name,
        schema,
        stackUniqueSchemaNames,
      });
      const { height, width, position: p } = cs;
      const ps = pageSizes[pageCursor];
      const position = {
        x: p.x + 10 > ps.width - width ? ps.width - width : p.x + 10,
        y: p.y + 10 > ps.height - height ? ps.height - height : p.y + 10,
      };

      const pastedSchema = Object.assign(cloneDeep(cs), { id, name, position });
      if (cs.group) {
        const nextGroupId = groupIdMap.get(cs.group) || `group-${uuid()}`;
        groupIdMap.set(cs.group, nextGroupId);
        pastedSchema.group = nextGroupId;
      }
      return pastedSchema;
    });
    commitSchemas(schemasList[pageCursor].concat(pasteSchemas));
    setTimeout(() => {
      onEdit(getElementsByIds(pasteSchemas.map((s) => s.id)));
    });
    copiedSchemas.current = cloneDeep(pasteSchemas);
  }, [commitSchemas, getElementsByIds, onEdit, pageCursor, pageSizes, schemasList]);

  const removeSelectedSchemas = useCallback(
    (ids?: string[]) => {
      removeSchemas(getActiveIds(ids));
    },
    [getActiveIds, removeSchemas],
  );

  const cutSchemas = useCallback(
    (ids?: string[]) => {
      const targetIds = getActiveIds(ids);
      copySchemas(targetIds);
      removeSchemas(targetIds);
    },
    [copySchemas, getActiveIds, removeSchemas],
  );

  const duplicateSchemas = useCallback(
    (ids?: string[]) => {
      const targetIds = getActiveIds(ids);
      copySchemas(targetIds);
      pasteSchemas();
    },
    [copySchemas, getActiveIds, pasteSchemas],
  );

  const groupSchemas = useCallback(
    (ids?: string[]) => {
      const targetIds = getActiveIds(ids);
      if (targetIds.length < 2) return;

      const selectedIds = new Set(targetIds);
      const groupId = `group-${uuid()}`;
      const nextSchemas = schemasList[pageCursor].map((schema) =>
        selectedIds.has(schema.id) ? { ...schema, group: groupId } : schema,
      );
      commitSchemas(nextSchemas);
      setTimeout(() => onEdit(getElementsByIds(targetIds)));
    },
    [commitSchemas, getActiveIds, getElementsByIds, onEdit, pageCursor, schemasList],
  );

  const ungroupSchemas = useCallback(
    (ids?: string[]) => {
      const targetIds = getActiveIds(ids);
      const pageSchemas = schemasList[pageCursor];
      const selectedGroups = new Set(
        pageSchemas
          .filter((schema) => targetIds.includes(schema.id) && schema.group)
          .map((schema) => schema.group as string),
      );
      if (selectedGroups.size === 0) return;

      const affectedIds: string[] = [];
      const nextSchemas = pageSchemas.map((schema) => {
        if (!schema.group || !selectedGroups.has(schema.group)) return schema;
        affectedIds.push(schema.id);
        const nextSchema = { ...schema };
        delete nextSchema.group;
        return nextSchema;
      });
      commitSchemas(nextSchemas);
      setTimeout(() => onEdit(getElementsByIds(affectedIds)));
    },
    [commitSchemas, getActiveIds, getElementsByIds, onEdit, pageCursor, schemasList],
  );

  const reorderSchemas = useCallback(
    (ids: string[] | undefined, placement: 'front' | 'back') => {
      const targetIds = getActiveIds(ids);
      if (targetIds.length === 0) return;
      const selectedIds = new Set(targetIds);
      const pageSchemas = schemasList[pageCursor];
      const selected = pageSchemas.filter((schema) => selectedIds.has(schema.id));
      const rest = pageSchemas.filter((schema) => !selectedIds.has(schema.id));
      commitSchemas(placement === 'front' ? rest.concat(selected) : selected.concat(rest));
      setTimeout(() => onEdit(getElementsByIds(targetIds)));
    },
    [commitSchemas, getActiveIds, getElementsByIds, onEdit, pageCursor, schemasList],
  );

  const designerActions = useMemo(
    () => ({
      copy: copySchemas,
      cut: cutSchemas,
      paste: pasteSchemas,
      duplicate: duplicateSchemas,
      group: groupSchemas,
      ungroup: ungroupSchemas,
      remove: removeSelectedSchemas,
      bringToFront: (ids?: string[]) => reorderSchemas(ids, 'front'),
      sendToBack: (ids?: string[]) => reorderSchemas(ids, 'back'),
      canPaste: () => Boolean(copiedSchemas.current && copiedSchemas.current.length > 0),
    }),
    [
      copySchemas,
      cutSchemas,
      duplicateSchemas,
      groupSchemas,
      pasteSchemas,
      removeSelectedSchemas,
      reorderSchemas,
      ungroupSchemas,
    ],
  );

  useInitEvents({
    pageCursor,
    pageSizes,
    activeElements,
    template,
    schemasList,
    changeSchemas,
    commitSchemas,
    removeSchemas,
    onSaveTemplate,
    past,
    future,
    setSchemasList,
    onEdit,
    onEditEnd,
    designerActions,
  });

  const updateTemplate = useCallback(
    async (newTemplate: Template, opts?: { preservePage?: boolean; targetPage?: number }) => {
      const { preservePage = false, targetPage } = opts ?? {};
      const sl = await template2SchemasList(newTemplate);
      setSchemasList(sl);
      onEditEnd();
      const lastValidPage = Math.max(0, sl.length - 1);

      if (typeof targetPage === 'number') {
        // Explicit page request from `Designer.updateTemplate(template, { page })`
        // takes priority over the legacy "reset/preserve" behaviour. pdfme#1235.
        const clamped = Math.min(Math.max(0, targetPage), lastValidPage);
        setPageCursor(clamped);
        if (canvasRef.current?.scroll) {
          canvasRef.current.scroll({
            top: getPagesScrollTopByIndex(pageSizes, clamped, scale),
            behavior: 'smooth',
          });
        }
        return;
      }

      if (!preservePage) {
        setPageCursor(0);
        if (canvasRef.current?.scroll) {
          canvasRef.current.scroll({ top: 0, behavior: 'smooth' });
        }
      } else {
        setPageCursor((prev) => {
          const clamped = Math.min(prev, lastValidPage);
          if (clamped !== prev && canvasRef.current) {
            canvasRef.current.scroll({
              top: getPagesScrollTopByIndex(pageSizes, clamped, scale),
              behavior: 'smooth',
            });
          }
          return clamped;
        });
      }
    },
    [onEditEnd, pageSizes, scale],
  );

  const addSchema = (defaultSchema: Schema, options?: { select?: boolean }) => {
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = isBlankPdf(template.basePdf)
      ? template.basePdf.padding
      : [0, 0, 0, 0];
    const pageSize = pageSizes[pageCursor];

    const existingNames = new Set(schemasList.flat().map((schema) => schema.name));
    const uniqueSchemaName = (name: string | undefined) => {
      const baseName = name?.trim() || i18n('field');
      if (!existingNames.has(baseName)) return baseName;

      let index = 1;
      let candidate = `${baseName}_${index}`;
      while (existingNames.has(candidate)) {
        index++;
        candidate = `${baseName}_${index}`;
      }
      return candidate;
    };
    const ensureMiddleValue = (min: number, value: number, max: number) =>
      Math.min(Math.max(min, value), max);

    const requestedName = uniqueSchemaName(defaultSchema.name);

    const s = {
      id: uuid(),
      ...defaultSchema,
      name: requestedName,
      readOnly: true,
      position: {
        x: ensureMiddleValue(
          paddingLeft,
          defaultSchema.position.x,
          pageSize.width - paddingRight - defaultSchema.width,
        ),
        y: ensureMiddleValue(
          paddingTop,
          defaultSchema.position.y,
          pageSize.height - paddingBottom - defaultSchema.height,
        ),
      },
      required: false,
    } as SchemaForUI;

    if (defaultSchema.position.y === 0) {
      const paper = paperRefs.current[pageCursor];
      const rectTop = paper ? paper.getBoundingClientRect().top : 0;
      s.position.y = rectTop > 0 ? paddingTop : pageSizes[pageCursor].height / 2;
    }

    commitSchemas(schemasList[pageCursor].concat(s));
    if (options?.select !== false) {
      setTimeout(() => onEdit([document.getElementById(s.id)]));
    }
  };

  const onSortEnd = (sortedSchemas: SchemaForUI[]) => {
    commitSchemas(sortedSchemas);
  };

  const onChangeHoveringSchemaId = (id: string | null) => {
    setHoveringSchemaId(id);
  };

  const updatePage = async (sl: SchemaForUI[][], newPageCursor: number) => {
    setPageCursor(newPageCursor);
    const newTemplate = schemasList2template(sl, template.basePdf);
    onChangeTemplate(newTemplate);
    await updateTemplate(newTemplate, { preservePage: true });
    void refresh(newTemplate);

    // Notify page change with updated total pages
    onPageCursorChange(newPageCursor, sl.length);

    // Use setTimeout to update scroll position after render
    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.scrollTop = getPagesScrollTopByIndex(pageSizes, newPageCursor, scale);
      }
    }, 0);
  };

  const handleRemovePage = () => {
    if (pageCursor === 0) return;
    if (!window.confirm(i18n('removePageConfirm'))) return;

    const _schemasList = cloneDeep(schemasList);
    _schemasList.splice(pageCursor, 1);
    void updatePage(_schemasList, pageCursor - 1);
  };

  const handleAddPageAfter = () => {
    const _schemasList = cloneDeep(schemasList);
    _schemasList.splice(pageCursor + 1, 0, []);
    void updatePage(_schemasList, pageCursor + 1);
  };

  if (prevTemplate !== template) {
    setPrevTemplate(template);
    // Honour an explicit page request from the wrapper class. When none is
    // given we preserve the current page (clamped) rather than resetting to
    // page 0 — see pdfme#1235.
    void updateTemplate(template, {
      preservePage: true,
      targetPage: typeof requestedPageCursor === 'number' ? requestedPageCursor : undefined,
    });
  }

  const canvasWidth = size.width - LEFT_SIDEBAR_WIDTH;
  const sizeExcSidebars = {
    width: sidebarOpen ? canvasWidth - RIGHT_SIDEBAR_WIDTH : canvasWidth,
    height: size.height,
  };

  if (error) {
    // Pass the error directly to ErrorScreen
    return <ErrorScreen size={size} error={error} />;
  }
  const pageManipulation = isBlankPdf(template.basePdf)
    ? { addPageAfter: handleAddPageAfter, removePage: handleRemovePage }
    : {};

  return (
    <Root size={size} scale={scale}>
      <DndContext
        onDragEnd={(event) => {
          // Triggered after a schema is dragged & dropped from the left sidebar.
          if (!event.active) return;
          const active = event.active;
          const pageRect = paperRefs.current[pageCursor].getBoundingClientRect();

          const dragStartLeft = active.rect.current.initial?.left || 0;
          const dragStartTop = active.rect.current.initial?.top || 0;

          const canvasLeftOffsetFromPageCorner =
            pageRect.left - dragStartLeft + scaleDragPosAdjustment(20, scale);
          const canvasTopOffsetFromPageCorner = pageRect.top - dragStartTop;

          const moveY = (event.delta.y - canvasTopOffsetFromPageCorner) / scale;
          const moveX = (event.delta.x - canvasLeftOffsetFromPageCorner) / scale;

          const position = {
            x: round(px2mm(Math.max(0, moveX)), 2),
            y: round(px2mm(Math.max(0, moveY)), 2),
          };

          addSchema({ ...(active.data.current as Schema), position });
        }}
        onDragStart={onEditEnd}
      >
        <LeftSidebar height={canvasHeight} scale={scale} basePdf={template.basePdf} />

        <div
          style={{
            position: 'absolute',
            width: canvasWidth,
            marginLeft: LEFT_SIDEBAR_WIDTH,
          }}
        >
          <CtlBar
            size={sizeExcSidebars}
            pageCursor={pageCursor}
            pageNum={schemasList.length}
            setPageCursor={(p) => {
              if (!canvasRef.current) return;
              // Update scroll position and state
              canvasRef.current.scrollTop = getPagesScrollTopByIndex(pageSizes, p, scale);
              setPageCursor(p);
              onPageCursorChange(p, schemasList.length);
              onEditEnd();
            }}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            {...pageManipulation}
          />

          <RightSidebar
            hoveringSchemaId={hoveringSchemaId}
            onChangeHoveringSchemaId={onChangeHoveringSchemaId}
            height={canvasHeight}
            size={size}
            pageSize={pageSizes[pageCursor] ?? []}
            basePdf={template.basePdf}
            activeElements={activeElements}
            schemasList={schemasList}
            schemas={schemasList[pageCursor] ?? []}
            changeSchemas={changeSchemas}
            addSchema={addSchema}
            onSortEnd={onSortEnd}
            onEdit={(id) => {
              const editingElem = document.getElementById(id);
              if (editingElem) {
                onEdit([editingElem]);
              }
            }}
            onEditEnd={onEditEnd}
            deselectSchema={onEditEnd}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <Canvas
            ref={canvasRef}
            paperRefs={paperRefs}
            basePdf={template.basePdf}
            hoveringSchemaId={hoveringSchemaId}
            onChangeHoveringSchemaId={onChangeHoveringSchemaId}
            height={size.height - RULER_HEIGHT * ZOOM}
            pageCursor={pageCursor}
            scale={scale}
            size={sizeExcSidebars}
            pageSizes={pageSizes}
            backgrounds={backgrounds}
            activeElements={activeElements}
            schemasList={schemasList}
            changeSchemas={changeSchemas}
            removeSchemas={removeSchemas}
            designerActions={designerActions}
            sidebarOpen={sidebarOpen}
            onEdit={onEdit}
          />
        </div>
      </DndContext>
    </Root>
  );
};

export default TemplateEditor;
