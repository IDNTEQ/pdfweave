import { useCallback, useMemo, useRef } from 'react';
import type { SchemaForUI } from '@pdfweave/common';
import { SELECTABLE_CLASSNAME } from '../../../../constants.js';

interface UseSelectionHelpersParams {
  activeElements: HTMLElement[];
  hoveringSchemaId: string | null;
  schemasList: SchemaForUI[][];
  pageCursor: number;
  onEdit: (targets: HTMLElement[]) => void;
  onEditingChange?: (editing: boolean) => void;
}

/**
 * Selection-related read helpers + selection-mutating helpers used by Canvas.
 *
 * Active selection itself lives in the parent (`Designer/index.tsx`); these
 * helpers expose the derivations Canvas needs to wire context menus, anchor
 * overlays, group-aware operations, and shift-click multi-select.
 */
export const useSelectionHelpers = ({
  activeElements,
  hoveringSchemaId,
  schemasList,
  pageCursor,
  onEdit,
  onEditingChange,
}: UseSelectionHelpersParams) => {
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

  const getElementsByIds = useCallback((ids: string[]) => {
    const selectableElements = Array.from(document.getElementsByClassName(SELECTABLE_CLASSNAME));
    return ids
      .map(
        (id) =>
          selectableElements.find((element) => element.id === id) ?? document.getElementById(id),
      )
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
  }, []);

  const selectContextTargets = useCallback(
    (schema: SchemaForUI, target: HTMLElement) => {
      const ids = activeIds.includes(schema.id) ? activeIds : [schema.id];
      const targets = getElementsByIds(expandIdsByGroups(ids));
      return targets.length > 0 ? targets : [target];
    },
    [activeIds, expandIdsByGroups, getElementsByIds],
  );

  const toggleShiftClickSelection = useCallback(
    (schema: SchemaForUI, target: HTMLElement) => {
      const nextIds = new Set(activeIdsRef.current);
      if (nextIds.has(schema.id)) {
        nextIds.delete(schema.id);
      } else {
        nextIds.add(schema.id);
      }

      const targets = getElementsByIds(expandIdsByGroups(Array.from(nextIds)));
      onEdit(targets.length > 0 ? targets : [target]);
      onEditingChange?.(false);
    },
    [expandIdsByGroups, getElementsByIds, onEdit, onEditingChange],
  );

  return {
    activeIds,
    activeIdsRef,
    focusedSchemaIds,
    schemaPageIndexById,
    expandIdsByGroups,
    getElementsByIds,
    selectContextTargets,
    toggleShiftClickSelection,
  };
};
