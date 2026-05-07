import type {
  BasePdf,
  HorizontalAnchorRule,
  LayoutAnchorPoint,
  Schema,
  Size,
  VerticalAnchorRule,
} from './types.js';
import {
  buildSchemaIndex,
  findAnchorReferentX,
  findAnchorReferentY,
  getAnchoredLayout,
} from './anchorGeometry.js';

export type AnchorAxis = 'x' | 'y';

export type ResolvedAnchorTarget = {
  axis: AnchorAxis;
  mode: HorizontalAnchorRule['mode'] | VerticalAnchorRule['mode'];
  point: LayoutAnchorPoint;
  targetSchema?: Schema;
  targetSchemaId?: string;
  isPageAnchor: boolean;
};

const getBasePdfPadding = (basePdf: BasePdf): [number, number, number, number] => {
  const padding = (basePdf as { padding?: unknown }).padding;
  return Array.isArray(padding) && padding.length === 4
    ? (padding as [number, number, number, number])
    : [0, 0, 0, 0];
};

const horizontalSourceY = (schema: Schema): number => schema.position.y + schema.height / 2;

const verticalSourceX = (schema: Schema): number => schema.position.x + schema.width / 2;

/**
 * Compute the visual anchor source point for the designer overlay.
 *
 * Unlike `resolveAnchor` in `anchorGeometry`, the page-anchor cases here
 * include the `basePdf` padding so the lock badge sits *visually* on the
 * page edge inside the printable area. The other call sites (reflow,
 * designer edits) treat `pageLeft`/`pageTop` offsets as absolute mm —
 * that's the right thing for positioning a schema, but wrong for drawing
 * the relationship triangle.
 */
export function resolveAnchorTargetPoint(args: {
  axis: AnchorAxis;
  basePdf: BasePdf;
  pageSize: Size;
  schema: Schema;
  schemas: Schema[];
}): ResolvedAnchorTarget | null {
  const { axis, basePdf, schema, schemas } = args;
  const layout = getAnchoredLayout(schema);
  if (!layout) return null;

  const lookup = buildSchemaIndex(schemas);
  const [topPaddingMm, , , leftPaddingMm] = getBasePdfPadding(basePdf);

  if (axis === 'x') {
    const rule = layout.x;
    if (rule.mode === 'pageLeft') {
      return {
        axis,
        mode: rule.mode,
        point: { x: leftPaddingMm, y: horizontalSourceY(schema) },
        isPageAnchor: true,
      };
    }

    const targetSchema = findAnchorReferentX(schema, lookup);
    if (!targetSchema) return null;

    return {
      axis,
      mode: rule.mode,
      point: {
        x: targetSchema.position.x + targetSchema.width,
        y: targetSchema.position.y + targetSchema.height / 2,
      },
      targetSchema,
      ...(targetSchema.id ? { targetSchemaId: targetSchema.id } : {}),
      isPageAnchor: false,
    };
  }

  const rule = layout.y;
  if (rule.mode === 'pageTop') {
    return {
      axis,
      mode: rule.mode,
      point: { x: verticalSourceX(schema), y: topPaddingMm },
      isPageAnchor: true,
    };
  }

  const targetSchema = findAnchorReferentY(schema, lookup);
  if (!targetSchema) return null;

  return {
    axis,
    mode: rule.mode,
    point: {
      x: targetSchema.position.x + targetSchema.width / 2,
      y: targetSchema.position.y + targetSchema.height,
    },
    targetSchema,
    ...(targetSchema.id ? { targetSchemaId: targetSchema.id } : {}),
    isPageAnchor: false,
  };
}
