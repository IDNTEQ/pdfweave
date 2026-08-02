import { useEffect, type RefObject } from 'react';
import type MoveableComponent from 'react-moveable';
import type { SchemaForUI } from '@pdfweave/common';
import { usePrevious } from '../../../../hooks.js';

interface UseMoveableSyncParams {
  moveable: RefObject<MoveableComponent | null>;
  pageCursor: number;
  schemasList: SchemaForUI[][];
}

/**
 * Keeps react-moveable's measured rectangle in sync with React state.
 *
 * Moveable is a stateful imperative widget: when the schemas underneath the
 * active selection mutate (resize, position change, etc.) we have to call
 * `updateRect()` so its handles snap to the new geometry.
 *
 * We detect "current page schemas haven't changed in shape" via a
 * JSON.stringify diff against the previous render and fire updateRect when
 * stable — the original behaviour. This is unchanged from the inline effect
 * that lived in Canvas before extraction.
 */
export const useMoveableSync = ({ moveable, pageCursor, schemasList }: UseMoveableSyncParams) => {
  const prevSchemas = usePrevious(schemasList[pageCursor]);

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
  }, [moveable, pageCursor, schemasList, prevSchemas]);
};
