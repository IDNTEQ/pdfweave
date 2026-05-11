import type { Schema, SchemaLayoutRule, Template } from './types.js';
import { cloneDeep } from './helper.js';
import { PAGE_BREAK_SCHEMA_TYPE } from './dynamicTemplate.js';

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
 * The conversion is **document-order chaining**: every schema on a
 * page that lacks a `layout` field gets one, with
 *
 *   - `x: { mode: 'pageLeft', offsetMm: schema.position.x }`
 *   - `y: { mode: 'pageTop', offsetMm: schema.position.y }`
 *     (for the first schema on the page), OR
 *     `y: { mode: 'belowBottomEdge', ref: { schemaId: prev.name },
 *          offsetMm: schema.position.y - prev.position.y - prev.height }`
 *     (for subsequent schemas, where `prev` is the immediately
 *     preceding non-pageBreak schema in document order).
 *
 * Same-Y / overlapping siblings work naturally via *negative* offsets
 * — e.g. a schema sitting at the same Y as its predecessor produces
 * `offsetMm = -prev.height`, which `resolveAnchorY` evaluates back to
 * the predecessor's top edge, preserving the original visual layout.
 *
 * Schemas that already have a `layout` field are left untouched — the
 * tool is idempotent on already-migrated templates.
 *
 * pageBreak schemas (PAGE_BREAK_SCHEMA_TYPE) are skipped entirely:
 * they retain whatever layout (or lack thereof) they had, and they
 * don't participate as a predecessor in the chain.
 */
export function migrateTemplateToAnchored(template: Template): Template {
  const next = cloneDeep(template);
  for (const pageSchemas of next.schemas) {
    let prev: Schema | undefined;
    for (const schema of pageSchemas) {
      if (schema.type === PAGE_BREAK_SCHEMA_TYPE) continue;
      const hasLayout = (schema as Schema & { layout?: SchemaLayoutRule }).layout !== undefined;
      if (hasLayout) {
        prev = schema;
        continue;
      }
      const layout: SchemaLayoutRule = {
        mode: 'anchored',
        x: { mode: 'pageLeft', offsetMm: schema.position.x },
        y: prev
          ? {
              mode: 'belowBottomEdge',
              ref: { schemaId: prev.name },
              offsetMm: schema.position.y - prev.position.y - prev.height,
            }
          : { mode: 'pageTop', offsetMm: schema.position.y },
      };
      (schema as Schema & { layout: SchemaLayoutRule }).layout = layout;
      prev = schema;
    }
  }
  return next;
}
