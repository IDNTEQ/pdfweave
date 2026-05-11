import type { Schema, SchemaLayoutRule, Template } from './types.js';
import { cloneDeep } from './helper.js';
import { PAGE_BREAK_SCHEMA_TYPE } from './dynamicTemplate.js';

const EPSILON = 0.01;

/**
 * One-shot migration tool that converts pre-Phase-4 absolute-only
 * templates into the post-Phase-4 single-system layout model.
 *
 * Phase 4 of RFC 0001 deletes the engine's `totalYOffset` flow
 * propagation. Pre-existing templates that relied on that flow — i.e.
 * absolute schemas below a dynamic-height predecessor that the engine
 * pushed down — would render incorrectly under the new model unless
 * each downstream schema is rewritten to *anchor* against its
 * predecessor.
 *
 * The conversion replicates pre-Phase-4 engine semantics:
 *
 *   1. Sort schemas by `position.y` ascending (document order
 *      tiebreaks). Document order alone is wrong: many real
 *      templates list footer / aside fields after body fields in the
 *      JSON even when they sit higher / lower on the page, so naive
 *      doc-order chaining can put header fields downstream of body
 *      fields and vice versa.
 *   2. Group consecutive sorted schemas whose Y ranges overlap. The
 *      engine treated such groups as a unit — every member shared the
 *      same offset, and the next group below was pushed by the
 *      group's max expansion.
 *   3. Within a group, every member anchors to the **same predecessor**
 *      — the *host* of the previous group, defined as its tallest
 *      member (highest declared `y + height`). Chaining all members
 *      to the same host means they all move together when the host
 *      grows, which is what the engine's grouped-offset machinery did.
 *   4. The first group on a page anchors each member to `pageTop`
 *      with `offsetMm = schema.position.y`.
 *
 * Anchor offsets are computed as `schema.position.y − host.position.y
 * − host.height`. Same-Y / overlapping siblings produce *negative*
 * offsets that `resolveAnchorY` evaluates correctly back to the
 * declared y, preserving the visual layout exactly.
 *
 * Schemas that already have a `layout` field are left untouched. The
 * tool is idempotent on already-migrated templates.
 *
 * pageBreak schemas (`PAGE_BREAK_SCHEMA_TYPE`) are skipped: they
 * retain whatever layout they had and don't participate as a
 * predecessor.
 */
export function migrateTemplateToAnchored(template: Template): Template {
  const next = cloneDeep(template);
  for (const pageSchemas of next.schemas) {
    rewritePage(pageSchemas);
  }
  return next;
}

interface IndexedSchema {
  schema: Schema;
  docIndex: number;
}

function rewritePage(pageSchemas: Schema[]): void {
  // Stable Y-ascending sort with document-order tiebreak. We index up
  // front so we can compare doc positions without relying on
  // Array.prototype.sort being stable across JS engines.
  const eligible: IndexedSchema[] = [];
  for (let i = 0; i < pageSchemas.length; i++) {
    const schema = pageSchemas[i];
    if (schema.type === PAGE_BREAK_SCHEMA_TYPE) continue;
    eligible.push({ schema, docIndex: i });
  }
  eligible.sort((a, b) => {
    const dy = a.schema.position.y - b.schema.position.y;
    if (Math.abs(dy) > EPSILON) return dy;
    return a.docIndex - b.docIndex;
  });

  // Build same-Y groups: consecutive schemas in sorted order whose Y
  // ranges overlap form one group. Equivalent to the engine's
  // groupYEnd accumulator pre-Phase-4.
  const groups: IndexedSchema[][] = [];
  let groupYEnd = Number.NEGATIVE_INFINITY;
  for (const item of eligible) {
    const itemBaseEnd = item.schema.position.y + item.schema.height;
    if (item.schema.position.y < groupYEnd - EPSILON) {
      groups[groups.length - 1].push(item);
      if (itemBaseEnd > groupYEnd) groupYEnd = itemBaseEnd;
    } else {
      groups.push([item]);
      groupYEnd = itemBaseEnd;
    }
  }

  // Chain each group's members to the previous group's host (its
  // tallest member). The first group anchors to pageTop.
  let prevHost: Schema | undefined;
  for (const group of groups) {
    for (const item of group) {
      assignLayout(item.schema, prevHost);
    }
    prevHost = pickGroupHost(group);
  }
}

function pickGroupHost(group: IndexedSchema[]): Schema {
  let host = group[0].schema;
  let hostBottom = host.position.y + host.height;
  for (let i = 1; i < group.length; i++) {
    const candidate = group[i].schema;
    const candidateBottom = candidate.position.y + candidate.height;
    if (candidateBottom > hostBottom + EPSILON) {
      host = candidate;
      hostBottom = candidateBottom;
    }
  }
  return host;
}

function assignLayout(schema: Schema, prevHost: Schema | undefined): void {
  if ((schema as Schema & { layout?: SchemaLayoutRule }).layout !== undefined) return;
  const layout: SchemaLayoutRule = {
    mode: 'anchored',
    x: { mode: 'pageLeft', offsetMm: schema.position.x },
    y: prevHost
      ? {
          mode: 'belowBottomEdge',
          ref: { schemaId: prevHost.name },
          offsetMm: schema.position.y - prevHost.position.y - prevHost.height,
        }
      : { mode: 'pageTop', offsetMm: schema.position.y },
  };
  (schema as Schema & { layout: SchemaLayoutRule }).layout = layout;
}
