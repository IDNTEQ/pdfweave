import { useCallback, useState } from 'react';

/**
 * Tracks measured heights reported by the renderer for each schema.
 *
 * The Renderer pipes back the post-render content height (which can differ
 * from the schema's authored height for variable-content fields like text)
 * via `onRenderedHeightChange`. Canvas uses this to detect page overflow
 * and to feed the renderer the same height on the next pass.
 */
export const useRenderedHeights = () => {
  const [renderedSchemaHeights, setRenderedSchemaHeights] = useState<Record<string, number>>({});

  const onRenderedHeightChange = useCallback((schemaId: string, height: number) => {
    setRenderedSchemaHeights((current) => {
      if (current[schemaId] === height) {
        return current;
      }
      return { ...current, [schemaId]: height };
    });
  }, []);

  return { renderedSchemaHeights, onRenderedHeightChange };
};
