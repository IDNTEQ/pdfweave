import { useCallback, useMemo, useState } from 'react';
import {
  cloneDeep,
  type ChangeSchemas,
  type SchemaForUI,
  type SchemaLayoutRule,
} from '@pdfweave/common';
import { isAnchoredLayout } from '../../../../helper.js';
import type { DesignerContextMenuAction } from '../ContextMenu.js';

interface DesignerActions {
  copy: (ids?: string[]) => void;
  cut: (ids?: string[]) => void;
  paste: () => void;
  duplicate: (ids?: string[]) => void;
  group: (ids?: string[]) => void;
  ungroup: (ids?: string[]) => void;
  remove: (ids?: string[]) => void;
  bringToFront: (ids?: string[]) => void;
  sendToBack: (ids?: string[]) => void;
}

interface UseContextMenuParams {
  pageCursor: number;
  schemasList: SchemaForUI[][];
  changeSchemas: ChangeSchemas;
  designerActions: DesignerActions;
}

type ContextMenuState = {
  x: number;
  y: number;
  schemaIds: string[];
} | null;

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

/**
 * Walks the right-click selection in render order and returns the last schema
 * with an anchored layout — that's the source whose anchor we offer to apply
 * to the rest of the selection.
 */
export const findApplyAnchorSource = (
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

/**
 * Right-click context-menu state + the action dispatcher that wires menu items
 * to designerActions plus the "apply X's anchor to selection" mutation.
 */
export const useContextMenu = ({
  pageCursor,
  schemasList,
  changeSchemas,
  designerActions,
}: UseContextMenuParams) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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

  const onContextMenuAction = useCallback(
    (action: DesignerContextMenuAction) => {
      const ids = contextMenu?.schemaIds ?? [];
      switch (action) {
        case 'copy': {
          designerActions.copy(ids);
          break;
        }
        case 'cut': {
          designerActions.cut(ids);
          break;
        }
        case 'paste': {
          designerActions.paste();
          break;
        }
        case 'duplicate': {
          designerActions.duplicate(ids);
          break;
        }
        case 'group': {
          designerActions.group(ids);
          break;
        }
        case 'ungroup': {
          designerActions.ungroup(ids);
          break;
        }
        case 'applyAnchorToSelection': {
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
        }
        case 'delete': {
          designerActions.remove(ids);
          break;
        }
        case 'bringToFront': {
          designerActions.bringToFront(ids);
          break;
        }
        case 'sendToBack': {
          designerActions.sendToBack(ids);
          break;
        }
        default: {
          break;
        }
      }
      setContextMenu(null);
    },
    [applyAnchorSource, changeSchemas, contextMenu, contextSchemas, designerActions],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return {
    contextMenu,
    setContextMenu,
    contextSchemas,
    applyAnchorSource,
    onContextMenuAction,
    closeContextMenu,
  };
};
