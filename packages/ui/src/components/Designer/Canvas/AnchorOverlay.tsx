import React, { useMemo } from 'react';
import { theme } from 'antd';
import {
  resolveAnchorTargetPoint,
  type AnchorAxis,
  type BasePdf,
  type LayoutAnchorPoint,
  type Schema,
  type SchemaForUI,
  type Size,
} from '@pdfweave/common';

type AnchorMode = 'pageLeft' | 'afterRightEdge' | 'alignRightEdge' | 'pageTop' | 'belowBottomEdge';

type AnchorRelation = {
  axis: AnchorAxis;
  collapseToDot: boolean;
  id: string;
  mode: AnchorMode;
  source: LayoutAnchorPoint;
  sourceSchemaId: string;
  target: LayoutAnchorPoint;
  targetSchemaId: string;
};

type Segment = {
  from: LayoutAnchorPoint;
  to: LayoutAnchorPoint;
};

type Props = {
  schemas: SchemaForUI[];
  focusedSchemaIds: Set<string>;
  pageSize: Size;
  basePdf: BasePdf;
  zoom: number;
};

const LOCK_BADGE = '🔒';
const EPSILON_MM = 0.01;

const isAnchoredLayout = (schema: SchemaForUI) => schema.layout?.mode === 'anchored';

const isSamePoint = (a: LayoutAnchorPoint, b: LayoutAnchorPoint) =>
  Math.abs(a.x - b.x) <= EPSILON_MM && Math.abs(a.y - b.y) <= EPSILON_MM;

const containsSchema = (outer: Schema, inner: SchemaForUI): boolean =>
  inner.position.x >= outer.position.x &&
  inner.position.y >= outer.position.y &&
  inner.position.x + inner.width <= outer.position.x + outer.width &&
  inner.position.y + inner.height <= outer.position.y + outer.height;

const getSourcePoint = (
  schema: SchemaForUI,
  axis: AnchorAxis,
  mode: AnchorMode,
): LayoutAnchorPoint => {
  if (axis === 'x') {
    return {
      x: mode === 'alignRightEdge' ? schema.position.x + schema.width : schema.position.x,
      y: schema.position.y + schema.height / 2,
    };
  }

  return {
    x: schema.position.x + schema.width / 2,
    y: schema.position.y,
  };
};

const getElbowPoint = (relation: AnchorRelation): LayoutAnchorPoint =>
  relation.axis === 'x'
    ? { x: relation.source.x, y: relation.target.y }
    : { x: relation.target.x, y: relation.source.y };

const getAnchoredSegment = (relation: AnchorRelation): Segment => ({
  from: getElbowPoint(relation),
  to: relation.target,
});

const getOtherSegment = (relation: AnchorRelation): Segment => ({
  from: relation.source,
  to: getElbowPoint(relation),
});

const midpoint = (segment: Segment): LayoutAnchorPoint => ({
  x: (segment.from.x + segment.to.x) / 2,
  y: (segment.from.y + segment.to.y) / 2,
});

const isVisibleSegment = (segment: Segment): boolean => !isSamePoint(segment.from, segment.to);

const pointToPx = (point: LayoutAnchorPoint, zoom: number): LayoutAnchorPoint => ({
  x: point.x * zoom,
  y: point.y * zoom,
});

const buildRelation = (args: {
  axis: AnchorAxis;
  basePdf: BasePdf;
  focusedSchemaIds: Set<string>;
  pageSize: Size;
  schema: SchemaForUI;
  schemas: SchemaForUI[];
}): AnchorRelation | null => {
  const { axis, basePdf, focusedSchemaIds, pageSize, schema, schemas } = args;
  const target = resolveAnchorTargetPoint({ axis, basePdf, pageSize, schema, schemas });
  if (!target) return null;

  const sourceIsFocused = focusedSchemaIds.has(schema.id);
  const targetIsFocused = target.targetSchemaId ? focusedSchemaIds.has(target.targetSchemaId) : false;
  if (!sourceIsFocused && !targetIsFocused) return null;

  const source = getSourcePoint(schema, axis, target.mode);
  const collapseToDot =
    isSamePoint(source, target.point) ||
    Boolean(target.targetSchema && containsSchema(target.targetSchema, schema));
  const targetSchemaId = target.targetSchemaId ?? 'page';

  return {
    axis,
    collapseToDot,
    id: `${schema.id}:${axis}:${target.mode}:${targetSchemaId}`,
    mode: target.mode,
    source,
    sourceSchemaId: schema.id,
    target: target.point,
    targetSchemaId,
  };
};

const buildRelations = (args: {
  basePdf: BasePdf;
  focusedSchemaIds: Set<string>;
  pageSize: Size;
  schemas: SchemaForUI[];
}): AnchorRelation[] => {
  const { basePdf, focusedSchemaIds, pageSize, schemas } = args;
  if (focusedSchemaIds.size === 0) return [];

  return schemas.flatMap((schema) => {
    if (!isAnchoredLayout(schema)) return [];
    return (['x', 'y'] as const)
      .map((axis) => buildRelation({ axis, basePdf, focusedSchemaIds, pageSize, schema, schemas }))
      .filter((relation): relation is AnchorRelation => Boolean(relation));
  });
};

const AnchorLine = ({
  segment,
  zoom,
  stroke,
  strokeWidth,
  strokeDasharray,
  opacity = 1,
  testId,
}: {
  segment: Segment;
  zoom: number;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  opacity?: number;
  testId: string;
}) => {
  if (!isVisibleSegment(segment)) return null;

  const from = pointToPx(segment.from, zoom);
  const to = pointToPx(segment.to, zoom);

  return (
    <line
      data-testid={testId}
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      strokeLinecap="round"
      opacity={opacity}
      vectorEffect="non-scaling-stroke"
    />
  );
};

const LockBadge = ({
  point,
  zoom,
  accent,
  background,
  axis,
}: {
  point: LayoutAnchorPoint;
  zoom: number;
  accent: string;
  background: string;
  axis: AnchorAxis;
}) => {
  const px = pointToPx(point, zoom);

  return (
    <g
      data-testid="anchor-overlay-lock"
      data-anchor-axis={axis}
      transform={`translate(${px.x} ${px.y})`}
    >
      <rect x={-9} y={-8} width={18} height={16} rx={4} fill={background} stroke={accent} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={11}>
        {LOCK_BADGE}
      </text>
    </g>
  );
};

const AnchorDot = ({
  point,
  zoom,
  fill,
  stroke,
}: {
  point: LayoutAnchorPoint;
  zoom: number;
  fill: string;
  stroke: string;
}) => {
  const px = pointToPx(point, zoom);

  return <circle cx={px.x} cy={px.y} r={3.5} fill={fill} stroke={stroke} strokeWidth={1.5} />;
};

const AnchorRelationShape = ({
  relation,
  zoom,
  accent,
  otherStroke,
  background,
}: {
  relation: AnchorRelation;
  zoom: number;
  accent: string;
  otherStroke: string;
  background: string;
}) => {
  const anchoredSegment = getAnchoredSegment(relation);
  const otherSegment = getOtherSegment(relation);
  const lockPoint = relation.collapseToDot ? relation.target : midpoint(anchoredSegment);

  return (
    <g
      data-testid="anchor-overlay-triangle"
      data-anchor-axis={relation.axis}
      data-anchor-mode={relation.mode}
      data-source-schema-id={relation.sourceSchemaId}
      data-target-schema-id={relation.targetSchemaId}
    >
      {relation.collapseToDot ? null : (
        <>
          <AnchorLine
            segment={otherSegment}
            zoom={zoom}
            stroke={otherStroke}
            strokeWidth={1.1}
            strokeDasharray="4 4"
            opacity={0.75}
            testId="anchor-overlay-other-leg"
          />
          <AnchorLine
            segment={anchoredSegment}
            zoom={zoom}
            stroke={accent}
            strokeWidth={2.4}
            strokeDasharray="6 3"
            testId="anchor-overlay-anchored-leg"
          />
        </>
      )}
      <AnchorDot point={relation.target} zoom={zoom} fill={accent} stroke={background} />
      <LockBadge
        point={lockPoint}
        zoom={zoom}
        accent={accent}
        background={background}
        axis={relation.axis}
      />
    </g>
  );
};

const AnchorOverlay = ({ schemas, focusedSchemaIds, pageSize, basePdf, zoom }: Props) => {
  const { token } = theme.useToken();
  const relations = useMemo(
    () => buildRelations({ basePdf, focusedSchemaIds, pageSize, schemas }),
    [basePdf, focusedSchemaIds, pageSize, schemas],
  );

  if (relations.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pdfme-designer-anchor-overlay"
      data-testid="pdfweave-anchor-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: pageSize.width * zoom,
        height: pageSize.height * zoom,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {relations.map((relation) => (
        <AnchorRelationShape
          key={relation.id}
          relation={relation}
          zoom={zoom}
          accent={token.colorPrimary}
          otherStroke={token.colorTextTertiary}
          background={token.colorBgContainer}
        />
      ))}
    </svg>
  );
};

export default AnchorOverlay;
