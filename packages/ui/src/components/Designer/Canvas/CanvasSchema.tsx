import React, { type MouseEvent } from 'react';
import {
  type BasePdf,
  type ChangeSchemas,
  type SchemaForUI,
  replacePlaceholders,
  resolveSchemaValue,
} from '@pdfweave/common';
import Renderer from '../../Renderer.js';

type Mode = 'designer' | 'viewer';

interface ContextMenuState {
  x: number;
  y: number;
  schemaIds: string[];
}

interface CanvasSchemaProps {
  schema: SchemaForUI;
  index: number;
  basePdf: BasePdf;
  pageCursor: number;
  pageSizes: { height?: number }[];
  schemasList: SchemaForUI[][];
  schemaPageIndex: number;
  bottomPaddingMm: number;
  designDataInput: unknown;
  activeElements: HTMLElement[];
  hoveringSchemaId: string | null;
  editing: boolean;
  scale: number;
  renderedHeight: number | undefined;
  primaryColor: string;
  changeSchemas: ChangeSchemas;
  onChangeHoveringSchemaId: (id: string | null) => void;
  onRenderedHeightChange: (id: string, height: number) => void;
  onEdit: (targets: HTMLElement[]) => void;
  setEditing: (editing: boolean) => void;
  setContextMenu: (state: ContextMenuState) => void;
  selectContextTargets: (schema: SchemaForUI, target: HTMLElement) => HTMLElement[];
  toggleShiftClickSelection: (schema: SchemaForUI, target: HTMLElement) => void;
}

const buildOutline = (
  schema: SchemaForUI,
  hoveringSchemaId: string | null,
  primaryColor: string,
): string => {
  const isHovered = hoveringSchemaId === schema.id;
  const stroke = isHovered ? 'solid' : 'dashed';
  const color = schema.readOnly && !isHovered ? 'transparent' : primaryColor;
  return `1px ${stroke} ${color}`;
};

const computeDisplayValue = (
  schema: SchemaForUI,
  schemasList: SchemaForUI[][],
  designDataInput: unknown,
  index: number,
  mode: Mode,
): string => {
  if (schema.binding) {
    return resolveSchemaValue({
      schema,
      input: designDataInput,
      schemas: schemasList,
      totalPages: schemasList.length,
      currentPage: index + 1,
    });
  }

  const content = schema.content || '';
  if (mode === 'designer' || !schema.readOnly) return content;

  const variables: Record<string, string | number> = {
    totalPages: schemasList.length,
    currentPage: index + 1,
  };
  for (const page of schemasList) {
    for (const currSchema of page) {
      variables[currSchema.name] = currSchema.content || '';
    }
  }
  return replacePlaceholders({ content, variables, schemas: schemasList });
};

/**
 * Canvas's per-schema render. Computes the display value (binding /
 * placeholder substitution / read-only mode), wires the change/context-menu/
 * shift-click handlers, and renders a Renderer.
 */
const CanvasSchema: React.FC<CanvasSchemaProps> = ({
  schema,
  index,
  basePdf,
  pageCursor,
  pageSizes,
  schemasList,
  schemaPageIndex,
  bottomPaddingMm,
  designDataInput,
  activeElements,
  hoveringSchemaId,
  editing,
  scale,
  renderedHeight,
  primaryColor,
  changeSchemas,
  onChangeHoveringSchemaId,
  onRenderedHeightChange,
  onEdit,
  setEditing,
  setContextMenu,
  selectContextTargets,
  toggleShiftClickSelection,
}) => {
  const mode: Mode =
    editing && activeElements.map((ae) => ae.id).includes(schema.id) ? 'designer' : 'viewer';
  const schemaPageHeight = pageSizes[schemaPageIndex]?.height;
  const value = computeDisplayValue(
    schema,
    schemasList,
    designDataInput,
    index,
    mode,
  );

  const isOnCurrentPage = (schemasList[pageCursor] || []).some((s) => s.id === schema.id);
  const outline = buildOutline(schema, hoveringSchemaId, primaryColor);

  return (
    <Renderer
      key={schema.id}
      schema={schema}
      basePdf={basePdf}
      value={value}
      onChangeHoveringSchemaId={onChangeHoveringSchemaId}
      mode={mode}
      onChange={
        isOnCurrentPage
          ? (arg) => {
              type ChangeArg = { key: string; value: unknown };
              const args = Array.isArray(arg) ? (arg as ChangeArg[]) : [arg as ChangeArg];
              changeSchemas(args.map(({ key, value }) => ({ key, value, schemaId: schema.id })));
            }
          : undefined
      }
      stopEditing={() => {
        setEditing(false);
      }}
      outline={outline}
      scale={scale}
      renderedHeight={renderedHeight}
      onRenderedHeightChange={onRenderedHeightChange}
      pageBoundsForClip={
        typeof schemaPageHeight === 'number'
          ? { contentBottomY: schemaPageHeight - bottomPaddingMm }
          : undefined
      }
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
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
      onMouseDownCapture={(event: MouseEvent<HTMLElement>) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        toggleShiftClickSelection(schema, event.currentTarget);
      }}
    />
  );
};

// Strict context: hoveringSchemaId is irrelevant if neither the prev nor next
// hovered schema is this one, but we keep it simple — Renderer is fine.
export default React.memo(CanvasSchema);
