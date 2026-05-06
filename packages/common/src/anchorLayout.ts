import type {
  BasePdf,
  HorizontalAnchorRule,
  LayoutAnchorPoint,
  Schema,
  Size,
  VerticalAnchorRule,
} from './types.js';

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

const getSchemaAnchorIds = (schema: Schema): string[] =>
  Array.from(
    new Set(
      [schema.name, schema.id].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  );

const buildSchemaLookup = (schemas: Schema[]): Map<string, Schema> => {
  const lookup = new Map<string, Schema>();
  schemas.forEach((schema) => {
    getSchemaAnchorIds(schema).forEach((id) => lookup.set(id, schema));
  });
  return lookup;
};

const horizontalSourceY = (schema: Schema): number => schema.position.y + schema.height / 2;

const verticalSourceX = (schema: Schema): number => schema.position.x + schema.width / 2;

export function resolveAnchorTargetPoint(args: {
  axis: AnchorAxis;
  basePdf: BasePdf;
  pageSize: Size;
  schema: Schema;
  schemas: Schema[];
}): ResolvedAnchorTarget | null {
  const { axis, basePdf, schema, schemas } = args;
  const layout = schema.layout;
  if (layout?.mode !== 'anchored') return null;

  const lookup = buildSchemaLookup(schemas);
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

    const targetSchema = lookup.get(rule.ref.schemaId);
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

  const targetSchema = lookup.get(rule.ref.schemaId);
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
