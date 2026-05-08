/**
 * Anchor geometry — single source of truth for anchor math.
 *
 * Anchor layouts let a schema position itself relative to either the page
 * (`pageLeft` / `pageTop`) or another schema's edge (`afterRightEdge`,
 * `alignRightEdge`, `belowBottomEdge`). The same geometry is needed in three
 * places:
 *
 *  1. Generation-time reflow (`dynamicTemplate.ts`) — forward-resolves a
 *     schema's absolute position before laying out fragments.
 *  2. Designer overlay (`anchorOverlay.tsx` via `anchorLayout.ts`) — finds
 *     the *visual* anchor source point (page edge or target schema edge) so
 *     the relationship triangles + lock badges can be drawn.
 *  3. Designer prop-panel edits (`packages/ui/src/helper.ts`) — both
 *     forward-resolves anchored schemas after sibling edits, and
 *     reverse-resolves to recompute `offsetMm` when the user drags an
 *     anchored schema by hand.
 *
 * This module exposes the union of behaviours the three call sites need:
 *
 *  - `resolveAnchor(schema, index)` — generation/edit-time forward resolve.
 *    `pageLeft`/`pageTop` offsets are treated as absolute mm from the page
 *    origin; padding is *not* added. (Padding-aware visual source points
 *    are returned by the overlay helpers in `anchorLayout.ts`, which is the
 *    one behaviour that is *not* shared.)
 *
 *  - `reverseAnchorOffsetX/Y(targetPos, rule, schemaWidth, referent)` — given
 *    a desired absolute position, computes the `offsetMm` value to store in
 *    the rule so a subsequent `resolveAnchor` returns that position.
 *
 *  - `findAnchorReferent[XY](schema, index)` — convenience helper to retrieve
 *    the referent schema (or `undefined` for page-anchored / missing).
 *
 *  - `detectAnchorCycle(schemas)` — returns the cycle path if any chain of
 *    anchor refs forms a cycle, else `null`. Self-references count as a
 *    degenerate one-element cycle. Both x and y refs are walked.
 *
 *  - `buildSchemaIndex(schemas)` — `Map<id|name, schema>` for O(1) referent
 *    lookup. When two schemas share an id or name the *last* one wins (this
 *    matches the previous lookup behaviour in all three implementations).
 *
 * Behavioural notes / discrepancies that were unified here:
 *
 *  - The previous `dynamicTemplate.ts` implementation treated
 *    `alignRightEdge.offsetMm` as *required* and read it directly even
 *    though the type marks it optional. The previous `helper.ts`
 *    implementation defended with `finiteOrZero(rule.offsetMm)`. We adopt
 *    the safer form: `offsetMm ?? 0` for optional offsets.
 *  - The previous `dynamicTemplate.ts` implementation returned silently
 *    when a referent was missing; the previous `helper.ts` implementation
 *    returned `null`. Forward `resolveAnchor` now returns `null` per axis
 *    when the referent is missing, and callers decide whether to leave the
 *    schema's existing position untouched (matches the previous behaviour).
 *  - The previous overlay helper (`anchorLayout.ts`) added base-pdf padding
 *    to `pageLeft`/`pageTop` source points; the other two call sites did
 *    not. That is a *visual* concern (where the page-edge dot is drawn)
 *    and stays in `anchorLayout.ts` — the geometry function here returns
 *    the padding-free absolute position used by both render-time reflow
 *    and design-time edits.
 */

import type {
  HorizontalAnchorRule,
  Schema,
  SchemaLayoutRule,
  VerticalAnchorRule,
} from './types.js';

/** Anchored variant of `SchemaLayoutRule`. */
export type AnchoredLayoutRule = Extract<SchemaLayoutRule, { mode: 'anchored' }>;

/** A schema known to have an anchored layout. */
export type AnchoredSchema = Schema & { layout: AnchoredLayoutRule };

/** Map of id+name → schema, used for O(1) anchor referent lookup. */
export type SchemaIndex = Map<string, Schema>;

/** Floating-point tolerance for position equality comparisons (mm). */
export const ANCHOR_EPSILON = 0.01;

/**
 * Returns the set of identifiers another schema may use to anchor to this
 * one — both the persistent `id` and the user-facing `name`. Empty / non
 * string values are filtered out and duplicates de-duped.
 */
export const getSchemaAnchorIds = (schema: Schema): string[] => [
  ...new Set(
    [schema.name, schema.id].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ),
  ),
];

/**
 * Build an index over a list of schemas, keyed by every id-or-name a future
 * `AnchorRef.schemaId` could legitimately resolve to.
 *
 * When two schemas share an id or name the later one wins — this matches
 * the previous behaviour in `dynamicTemplate.ts`, `anchorLayout.ts`, and
 * `helper.ts` (all of which simply called `Map.set` in document order).
 */
export const buildSchemaIndex = <S extends Schema>(schemas: S[]): Map<string, S> => {
  const index = new Map<string, S>();
  for (const schema of schemas) {
    for (const id of getSchemaAnchorIds(schema)) {
      index.set(id, schema);
    }
  }
  return index;
};

/** Type-guard: true when `layout` is the anchored variant. */
export const isAnchoredLayout = (layout: unknown): layout is AnchoredLayoutRule =>
  typeof layout === 'object' &&
  layout !== null &&
  (layout as { mode?: unknown }).mode === 'anchored';

/** Returns the anchored layout rule, or `undefined` if the schema isn't anchored. */
export const getAnchoredLayout = (schema: Schema): AnchoredLayoutRule | undefined => {
  const layout = (schema as Schema & { layout?: SchemaLayoutRule }).layout;
  return isAnchoredLayout(layout) ? layout : undefined;
};

/**
 * Resolve the absolute X coordinate of an anchored schema.
 *
 * Returns `null` when the rule references a schema that is not present in
 * the index (caller should leave the schema's existing X untouched).
 */
export const resolveAnchorX = <S extends Schema>(
  schema: S,
  index: Map<string, S>,
): number | null => {
  const layout = getAnchoredLayout(schema);
  if (!layout) return null;

  const rule = layout.x;
  if (rule.mode === 'pageLeft') return rule.offsetMm;

  const target = index.get(rule.ref.schemaId);
  if (!target) return null;

  const targetRight = target.position.x + target.width;
  if (rule.mode === 'afterRightEdge') return targetRight + rule.offsetMm;

  // alignRightEdge — schema's right edge sits on target's right edge, with
  // an optional offset (offsetMm is `?` in the type, so default to 0).
  return targetRight - schema.width + (rule.offsetMm ?? 0);
};

/**
 * Resolve the absolute Y coordinate of an anchored schema.
 *
 * Returns `null` when the rule references a schema that is not present in
 * the index (caller should leave the schema's existing Y untouched).
 */
export const resolveAnchorY = <S extends Schema>(
  schema: S,
  index: Map<string, S>,
): number | null => {
  const layout = getAnchoredLayout(schema);
  if (!layout) return null;

  const rule = layout.y;
  if (rule.mode === 'pageTop') return rule.offsetMm;

  const target = index.get(rule.ref.schemaId);
  if (!target) return null;

  return target.position.y + target.height + rule.offsetMm;
};

/**
 * Resolve both axes at once. Each axis is `null` when its referent is
 * missing or when the schema isn't anchored.
 */
export const resolveAnchor = <S extends Schema>(
  schema: S,
  index: Map<string, S>,
): { x: number | null; y: number | null } => ({
  x: resolveAnchorX(schema, index),
  y: resolveAnchorY(schema, index),
});

/**
 * Find the referent schema that this one's X-anchor points to.
 *
 * Returns `undefined` for `pageLeft` (no referent), for non-anchored
 * schemas, and for rules whose `ref.schemaId` is not in the index.
 */
export const findAnchorReferentX = <S extends Schema>(
  schema: S,
  index: Map<string, S>,
): S | undefined => {
  const layout = getAnchoredLayout(schema);
  if (!layout) return undefined;
  const rule = layout.x;
  if (rule.mode === 'pageLeft') return undefined;
  return index.get(rule.ref.schemaId);
};

/**
 * Find the referent schema that this one's Y-anchor points to.
 *
 * Returns `undefined` for `pageTop` (no referent), for non-anchored
 * schemas, and for rules whose `ref.schemaId` is not in the index.
 */
export const findAnchorReferentY = <S extends Schema>(
  schema: S,
  index: Map<string, S>,
): S | undefined => {
  const layout = getAnchoredLayout(schema);
  if (!layout) return undefined;
  const rule = layout.y;
  if (rule.mode === 'pageTop') return undefined;
  return index.get(rule.ref.schemaId);
};

/**
 * Inverse of `resolveAnchorX`. Given a desired absolute X for `schema`,
 * returns the `offsetMm` that should be stored in `rule` so a subsequent
 * forward resolve produces `targetX`.
 *
 * `referent` is the schema referenced by the rule (only consulted for
 * non-page modes; pass `undefined` for `pageLeft`). When a non-page rule's
 * referent is missing the function returns the rule's existing `offsetMm`
 * (or 0 if the rule omitted it) — the caller is responsible for handling
 * this edge case (typically by leaving the rule untouched).
 */
export const reverseAnchorOffsetX = (
  targetX: number,
  rule: HorizontalAnchorRule,
  schemaWidth: number,
  referent: Schema | undefined,
): number => {
  if (rule.mode === 'pageLeft') return targetX;
  if (!referent) return rule.offsetMm ?? 0;

  const referentRight = referent.position.x + referent.width;
  if (rule.mode === 'afterRightEdge') return targetX - referentRight;

  // alignRightEdge — preserve the same algebra as the forward path:
  //   targetX = referentRight - schemaWidth + offsetMm
  // ⇒ offsetMm = targetX + schemaWidth - referentRight
  return targetX + schemaWidth - referentRight;
};

/**
 * Inverse of `resolveAnchorY`. See `reverseAnchorOffsetX` for semantics.
 */
export const reverseAnchorOffsetY = (
  targetY: number,
  rule: VerticalAnchorRule,
  referent: Schema | undefined,
): number => {
  if (rule.mode === 'pageTop') return targetY;
  if (!referent) return rule.offsetMm;

  const referentBottom = referent.position.y + referent.height;
  return targetY - referentBottom;
};

/**
 * Detect a cycle in the anchor graph (both x and y edges).
 *
 * Returns the cycle path (in visit order, with the cycle's starting node
 * appearing only once at the head — *not* repeated at the tail) when one
 * exists, else `null`.
 *
 * A schema anchored to itself counts as a degenerate one-element cycle
 * (returned as `[self]`).
 *
 * Schemas that aren't anchored, or whose ref points to a non-existent id,
 * are skipped — they cannot participate in a cycle.
 */
/**
 * Repair anchored schemas after one or more schemas have been removed
 * from the layout. Any schema whose anchor references a removed target
 * has the broken axis demoted to its absolute equivalent (`pageLeft`
 * for X, `pageTop` for Y), with the schema's current absolute position
 * as the offset — so the visible position is preserved.
 *
 * The unbroken axis is left alone; only the side that pointed to a
 * removed target gets demoted. A schema anchored to two different
 * removed targets has both axes demoted.
 *
 * @param schemas - the schemas remaining after the deletion
 * @param removedIds - the union of `getSchemaAnchorIds(removed)` over
 *   every removed schema (covers both `id` and `name` lookups, since
 *   either may appear in a `ref.schemaId`)
 * @param options.roundOffset - optional rounding applied to the
 *   demoted offset (e.g. `(n) => round(n, 2)` to clamp to 2 decimal
 *   places). Defaults to identity.
 *
 * Returns the same array reference when nothing changed; otherwise a
 * new array with shallow-cloned changed schemas.
 */
export const repairAnchorsAfterRemove = <S extends Schema>(
  schemas: S[],
  removedIds: ReadonlySet<string>,
  options: { roundOffset?: (value: number) => number } = {},
): S[] => {
  if (removedIds.size === 0) return schemas;
  const round = options.roundOffset ?? ((n: number) => n);

  let mutated = false;
  const next = schemas.map((schema) => {
    const layout = getAnchoredLayout(schema);
    if (!layout) return schema;

    let nextLayout: AnchoredLayoutRule = layout;
    if (layout.x.mode !== 'pageLeft' && removedIds.has(layout.x.ref.schemaId)) {
      nextLayout = {
        ...nextLayout,
        x: { mode: 'pageLeft', offsetMm: round(schema.position.x) },
      };
    }
    if (layout.y.mode !== 'pageTop' && removedIds.has(layout.y.ref.schemaId)) {
      nextLayout = {
        ...nextLayout,
        y: { mode: 'pageTop', offsetMm: round(schema.position.y) },
      };
    }

    if (nextLayout === layout) return schema;
    mutated = true;
    return { ...schema, layout: nextLayout } as S;
  });
  return mutated ? next : schemas;
};

export const detectAnchorCycle = <S extends Schema>(schemas: S[]): S[] | null => {
  const index = buildSchemaIndex(schemas);
  const visited = new Set<S>();
  const onStack = new Set<S>();
  const stackOrder: S[] = [];

  const neighbours = (schema: S): S[] => {
    const layout = getAnchoredLayout(schema);
    if (!layout) return [];
    const result: S[] = [];
    if (layout.x.mode !== 'pageLeft') {
      const referent = index.get(layout.x.ref.schemaId);
      if (referent) result.push(referent);
    }
    if (layout.y.mode !== 'pageTop') {
      const referent = index.get(layout.y.ref.schemaId);
      if (referent) result.push(referent);
    }
    return result;
  };

  const visit = (schema: S): S[] | null => {
    if (onStack.has(schema)) {
      // Cycle: slice the stack from the first occurrence of `schema` onward.
      const start = stackOrder.indexOf(schema);
      return stackOrder.slice(start);
    }
    if (visited.has(schema)) return null;

    visited.add(schema);
    onStack.add(schema);
    stackOrder.push(schema);

    for (const next of neighbours(schema)) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }

    onStack.delete(schema);
    stackOrder.pop();
    return null;
  };

  for (const schema of schemas) {
    const cycle = visit(schema);
    if (cycle) return cycle;
  }
  return null;
};
