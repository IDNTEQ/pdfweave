import {
  Schema,
  Template,
  BasePdf,
  BlankPdf,
  StationeryPdf,
  CommonOptions,
  LayoutMeasureResult,
  LayoutFragment,
  Plugin,
  SchemaLayoutRule,
  TextLineRange,
} from './types.js';
import { cloneDeep, treatsLikeBlank } from './helper.js';
import { resolveSchemaValue } from './dataBinding.js';
import {
  buildSchemaIndex,
  getAnchoredLayout,
  resolveAnchorX,
  resolveAnchorY,
  topoSortByAnchorDeps,
} from './anchorGeometry.js';

/** Floating point tolerance for comparisons */
const EPSILON = 0.01;

/**
 * Sanitizes a height value returned from a plugin's `measure` hook (or
 * from dynamicHeights / fragments arrays).
 *
 * The *correct* behavior for a production document layout engine is to
 * never let NaN, negative, or infinite values propagate into placement
 * arithmetic. Doing so produces silently corrupted PDFs (overlaps,
 * cut-off content, infinite loops in placeRowsOnPages, or NaN coordinates
 * handed to pdf-lib).
 *
 * We fall back to the schema's originally declared height (clamped to >= 0).
 * This is a deliberate defensive choice, not a silent data loss — callers
 * that want strict failure can opt into strict mode elsewhere.
 */
export function sanitizeHeight(value: number, declaredFallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return Math.max(0, declaredFallback || 0);
  }
  return value;
}

export function sanitizeHeights(heights: number[], declaredFallback: number): number[] {
  const fb = Math.max(0, declaredFallback || 0);
  return heights.map((h) => sanitizeHeight(h, fb));
}

/**
 * Schema type marker for the built-in page-break primitive.
 *
 * A pageBreak schema is a layout-engine marker (CSS `break-before: page`
 * analogue): it has zero rendered output and forces subsequent schemas to
 * start on a new page during the dynamic reflow pass. Width/height are
 * nominal; only the position (and the type tag) is used by the engine.
 *
 * The render-time plugin (a no-op) lives in `@pdfweave/schemas` and is
 * shipped in a follow-up batch — this module owns only the layout-engine
 * support and the type tag.
 *
 * Original upstream issue: https://github.com/pdfme/pdfme/issues/637
 */
export const PAGE_BREAK_SCHEMA_TYPE = 'pageBreak';

const isPageBreakSchema = (schema: Schema): boolean => schema.type === PAGE_BREAK_SCHEMA_TYPE;

interface ModifyTemplateForDynamicTableArg {
  template: Template;
  input: Record<string, string>;
  _cache: Map<string | number, unknown>;
  options: CommonOptions;
  getDynamicLayout?: (
    value: string,
    args: {
      schema: Schema;
      basePdf: BasePdf;
      options: CommonOptions;
      _cache: Map<string | number, unknown>;
    },
  ) => Promise<LayoutMeasureResult>;
  getDynamicHeights?: (
    value: string,
    args: {
      schema: Schema;
      basePdf: BasePdf;
      options: CommonOptions;
      _cache: Map<string | number, unknown>;
    },
  ) => Promise<number[]>;
}

interface LayoutItem {
  schema: Schema;
  baseY: number;
  height: number;
  fragments: LayoutUnitFragment[];
}

type LayoutUnitFragmentSource = 'dynamicHeights' | 'fragments' | 'height';

type LayoutUnitFragment = LayoutFragment & {
  height: number;
  __source: LayoutUnitFragmentSource;
};

const FRAGMENT_SCHEMA_RESERVED_KEYS = new Set([
  'height',
  'width',
  'anchors',
  'pluginData',
  'lineRange',
  '__source',
]);

/**
 * Resolve anchored schemas on a page in topological order, mutating
 * `schema.position` in place. Single-pass, O(N + E). Cycles surface as
 * an error from `topoSortByAnchorDeps` with the cycle path.
 *
 * Used by `getDynamicTemplate`'s non-blank-PDF early return (no
 * measurement, declared heights only). The blank-PDF reflow path uses
 * the three-pass topo+engine flow inline.
 */
function resolveAnchoredSchemas(pageSchemas: Schema[]): void {
  const order = topoSortByAnchorDeps(pageSchemas);
  const lookup = buildSchemaIndex(pageSchemas);
  for (const schema of order) {
    const layout = (schema as Schema & { layout?: SchemaLayoutRule }).layout;
    if (!layout || layout.mode !== 'anchored') continue;
    const nextX = resolveAnchorX(schema, lookup);
    const nextY = resolveAnchorY(schema, lookup);
    if (nextX !== null) schema.position.x = nextX;
    if (nextY !== null) schema.position.y = nextY;
  }
}

function getDynamicHeightsFromLayoutResult(schema: Schema, result: LayoutMeasureResult): number[] {
  const declared = schema.height;

  if (result.dynamicHeights && result.dynamicHeights.length > 0) {
    return sanitizeHeights(result.dynamicHeights, declared);
  }

  if (result.fragments && result.fragments.length > 0) {
    return sanitizeHeights(
      result.fragments.map((f) => f.height),
      declared,
    );
  }

  if (typeof result.height === 'number') {
    return [sanitizeHeight(result.height, declared)];
  }

  return [sanitizeHeight(declared, declared)];
}

function layoutFragmentsFromHeights(
  heights: number[],
  source: LayoutUnitFragmentSource,
): LayoutUnitFragment[] {
  return heights.map((height) => ({ height, __source: source }));
}

function getLayoutFragmentsFromLayoutResult(
  schema: Schema,
  result: LayoutMeasureResult,
): LayoutUnitFragment[] {
  const declared = schema.height;

  if (result.dynamicHeights && result.dynamicHeights.length > 0) {
    const safe = sanitizeHeights(result.dynamicHeights, declared);
    return layoutFragmentsFromHeights(safe, 'dynamicHeights');
  }

  if (result.fragments && result.fragments.length > 0) {
    const safeHeights = sanitizeHeights(
      result.fragments.map((f) => f.height),
      declared,
    );
    return result.fragments.map((fragment, i) => ({
      ...fragment,
      height: safeHeights[i] ?? sanitizeHeight(fragment.height, declared),
      __source: 'fragments' as const,
    }));
  }

  if (typeof result.height === 'number') {
    return layoutFragmentsFromHeights([sanitizeHeight(result.height, declared)], 'height');
  }

  return layoutFragmentsFromHeights([sanitizeHeight(declared, declared)], 'height');
}

const getFragmentLineRange = (fragments: LayoutUnitFragment[]): TextLineRange | undefined => {
  let start: number | undefined;
  let end: number | undefined;
  let hasOpenEndedRange = false;

  fragments.forEach((fragment) => {
    const range = fragment.lineRange;
    if (!range) return;
    start = start === undefined ? range.start : Math.min(start, range.start);
    if (range.end === undefined) {
      hasOpenEndedRange = true;
      return;
    }
    end = end === undefined ? range.end : Math.max(end, range.end);
  });

  if (start === undefined) return undefined;
  return { start, ...(hasOpenEndedRange || end === undefined ? {} : { end }) };
};

function applyFragmentSchemaData(schema: Schema, fragments: LayoutUnitFragment[]): void {
  fragments.forEach((fragment) => {
    Object.entries(fragment).forEach(([key, value]) => {
      if (FRAGMENT_SCHEMA_RESERVED_KEYS.has(key)) return;
      (schema as Schema & Record<string, unknown>)[key] = value;
    });
  });

  const lineRange = getFragmentLineRange(fragments);
  if (lineRange) {
    (schema as Schema & { __textLineRange?: TextLineRange }).__textLineRange = lineRange;
  }
}

/**
 * Generic dynamic-height dispatcher.
 *
 * Resolves the per-fragment heights of any schema by delegating to the
 * registered plugin's optional `measure` hook. This is the architectural
 * generalisation of the legacy `type === 'table'` switch — any plugin that
 * implements `measure(args)` participates in dynamic-height layout the same
 * way the built-in table plugin does.
 *
 * Resolution order matches `getDynamicHeightsFromLayoutResult`:
 *   1. `result.dynamicHeights` (explicit per-row breakdown)
 *   2. `result.fragments[*].height` (cross-page fragment heights)
 *   3. `[result.height]` (single static measurement)
 *   4. `[schema.height]` (fall-back to the design-time height)
 *
 * @param value   The resolved input value for the schema (already data-bound).
 * @param args    Standard layout-measure args (schema + basePdf + options + cache).
 * @param plugin  The registered plugin for `args.schema.type`, if any.
 *                When `undefined` or when the plugin has no `measure` hook,
 *                returns the schema's static height — preserving backwards
 *                compatible behaviour for plugins that don't reflow.
 *
 * Original upstream issue: https://github.com/pdfme/pdfme/issues/1418
 */
export async function getDynamicHeights(
  value: string,
  args: {
    schema: Schema;
    basePdf: BasePdf;
    options: CommonOptions;
    _cache: Map<string | number, unknown>;
  },
  plugin: Plugin | undefined,
): Promise<number[]> {
  if (!plugin?.measure) {
    return [args.schema.height];
  }

  const result = await plugin.measure({ value, ...args });
  return getDynamicHeightsFromLayoutResult(args.schema, result);
}

/**
 * Compute the effective per-page content bounds, taking into account both
 * basePdf.padding AND any staticSchema entries that occupy vertical space
 * inside the content area.
 *
 * staticSchema is rendered on every page (think headers / footers / page-frame
 * decorations). The reflow engine must treat the regions they occupy as
 * unavailable for dynamic content — otherwise tables (and other reflowing
 * schemas) paint over them on the second+ pages.
 *
 * Header-vs-footer classification: an entry whose vertical centre sits in the
 * top half of the page is treated as a header (extends `contentTop` downward).
 * Otherwise it is treated as a footer (pulls `contentBottom` upward).
 *
 * Entries whose horizontal extent lies entirely inside the left/right padding
 * (i.e. side-margin decorations) do not subtract vertical space — they don't
 * collide with the dynamic content column.
 *
 * Original upstream issue: https://github.com/pdfme/pdfme/issues/1434
 */
const getEffectiveContentBounds = (
  basePdf: BlankPdf | StationeryPdf,
): { contentTop: number; contentBottom: number; contentHeight: number } => {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = basePdf.padding;
  let contentTop = paddingTop;
  let contentBottom = basePdf.height - paddingBottom;

  const contentXStart = paddingLeft;
  const contentXEnd = basePdf.width - paddingRight;
  const verticalMidpoint = basePdf.height / 2;

  const staticSchema = basePdf.staticSchema ?? [];
  for (const entry of staticSchema) {
    const top = entry.position.y;
    const bottom = entry.position.y + entry.height;
    const left = entry.position.x;
    const right = entry.position.x + entry.width;

    // Skip entries that are entirely outside the content column (side
    // margins) — they cannot collide with reflowing content.
    const overlapsContentColumn = right > contentXStart + EPSILON && left < contentXEnd - EPSILON;
    if (!overlapsContentColumn) continue;

    // Skip entries that already sit inside the existing padding bands.
    const insideTopPadding = bottom <= paddingTop + EPSILON;
    const insideBottomPadding = top >= basePdf.height - paddingBottom - EPSILON;
    if (insideTopPadding || insideBottomPadding) continue;

    // Header-like (centre in top half) → push contentTop down.
    // Footer-like (centre in bottom half) → pull contentBottom up.
    const centre = (top + bottom) / 2;
    if (centre < verticalMidpoint) {
      if (bottom > contentTop) contentTop = bottom;
    } else {
      if (top < contentBottom) contentBottom = top;
    }
  }

  // Guard against a degenerate / negative content area when staticSchema
  // entries collide head-on. Falling back to padding-only bounds preserves
  // the legacy behaviour rather than producing a 0-height (or negative)
  // content area that would loop forever in placeRowsOnPages.
  if (contentBottom - contentTop <= EPSILON) {
    return {
      contentTop: paddingTop,
      contentBottom: basePdf.height - paddingBottom,
      contentHeight: basePdf.height - paddingTop - paddingBottom,
    };
  }

  return {
    contentTop,
    contentBottom,
    contentHeight: contentBottom - contentTop,
  };
};

/** Calculate the content height of a page (drawable area excluding padding) */
const getContentHeight = (basePdf: BlankPdf | StationeryPdf): number =>
  getEffectiveContentBounds(basePdf).contentHeight;

/** Get the input value for a schema */
const getSchemaValue = (
  schema: Schema,
  input: Record<string, string>,
  pageSchemas: Schema[],
): string => resolveSchemaValue({ schema, input, schemas: [pageSchemas] });

/**
 * Normalize schemas within a single page into layout items.
 * Returns items sorted by Y coordinate with their order preserved.
 */
function normalizePageSchemas(
  pageSchemas: Schema[],
  paddingTop: number,
): { items: LayoutItem[]; orderMap: Map<string, number> } {
  const items: LayoutItem[] = [];
  const orderMap = new Map<string, number>();

  pageSchemas.forEach((schema, index) => {
    // Guard against negative Y position when schema.y < paddingTop
    // Prevents "Cannot read properties of undefined (reading 'push')" error
    const localY = Math.max(0, schema.position.y - paddingTop);
    items.push({
      schema: cloneDeep(schema),
      baseY: localY,
      height: schema.height,
      fragments: layoutFragmentsFromHeights([schema.height], 'height'), // Will be updated later
    });
    orderMap.set(schema.name, index);
  });

  // Sort by Y coordinate (preserve original order for same position)
  items.sort((a, b) => {
    if (Math.abs(a.baseY - b.baseY) > EPSILON) {
      return a.baseY - b.baseY;
    }
    return (orderMap.get(a.schema.name) ?? 0) - (orderMap.get(b.schema.name) ?? 0);
  });

  return { items, orderMap };
}

/**
 * Place rows on pages, splitting across pages as needed.
 * @returns The final global Y coordinate after placement
 */
function placeRowsOnPages(
  schema: Schema,
  fragments: LayoutUnitFragment[],
  startGlobalY: number,
  contentHeight: number,
  paddingTop: number,
  pages: Schema[][],
): number {
  let currentRowIndex = 0;
  let currentPageIndex = Math.floor(startGlobalY / contentHeight);
  let currentYInPage = startGlobalY % contentHeight;

  if (currentYInPage < 0) currentYInPage = 0;

  let actualGlobalEndY = 0;
  const dynamicHeights = fragments.map((fragment) => fragment.height);
  const isSplittable = dynamicHeights.length > 1;
  const usesBodyRange =
    isSplittable && fragments.every((fragment) => fragment.__source === 'dynamicHeights');

  while (currentRowIndex < dynamicHeights.length) {
    // Ensure page exists
    while (pages.length <= currentPageIndex) pages.push([]);

    const spaceLeft = contentHeight - currentYInPage;
    const rowHeight = dynamicHeights[currentRowIndex];

    // If row doesn't fit, move to next page
    if (rowHeight > spaceLeft + EPSILON) {
      const isAtPageStart = Math.abs(spaceLeft - contentHeight) <= EPSILON;

      if (!isAtPageStart) {
        currentPageIndex++;
        currentYInPage = 0;
        continue;
      }
      // Force placement for oversized rows that don't fit even on a fresh page
    }

    // Pack as many rows as possible on this page
    let chunkHeight = 0;
    const startRowIndex = currentRowIndex;

    while (currentRowIndex < dynamicHeights.length) {
      const h = dynamicHeights[currentRowIndex];
      if (currentYInPage + chunkHeight + h <= contentHeight + EPSILON) {
        chunkHeight += h;
        currentRowIndex++;
      } else {
        break;
      }
    }

    // Don't leave header alone on a page without any data rows
    // If only header fits and there are data rows remaining, move everything to next page
    // BUT: if already at page top, don't move (prevents infinite loop when data row is too large)
    const isAtPageTop = currentYInPage <= EPSILON;
    if (
      usesBodyRange &&
      startRowIndex === 0 &&
      currentRowIndex === 1 &&
      dynamicHeights.length > 1 &&
      !isAtPageTop
    ) {
      currentRowIndex = 0;
      currentPageIndex++;
      currentYInPage = 0;
      continue;
    }

    // Force at least one row to prevent infinite loop
    if (currentRowIndex === startRowIndex) {
      chunkHeight += dynamicHeights[currentRowIndex];
      currentRowIndex++;
    }

    // Create schema for this chunk
    const newSchema: Schema = {
      ...schema,
      height: chunkHeight,
      position: { ...schema.position, y: currentYInPage + paddingTop },
    };
    applyFragmentSchemaData(newSchema, fragments.slice(startRowIndex, currentRowIndex));

    // Set bodyRange for splittable elements
    // dynamicHeights[0] = header row, dynamicHeights[1] = body[0]
    // So subtract 1 to convert to body index
    if (usesBodyRange) {
      newSchema.__bodyRange = {
        start: startRowIndex === 0 ? 0 : startRowIndex - 1,
        end: currentRowIndex - 1,
      };
      newSchema.__isSplit = startRowIndex > 0;
    }

    pages[currentPageIndex].push(newSchema);

    // Update position
    currentYInPage += chunkHeight;

    if (currentYInPage >= contentHeight - EPSILON) {
      currentPageIndex++;
      currentYInPage = 0;
    }

    actualGlobalEndY = currentPageIndex * contentHeight + currentYInPage;
  }

  return actualGlobalEndY;
}

/** Sort elements within each page by their original order */
function sortPagesByOrder(pages: Schema[][], orderMap: Map<string, number>): void {
  pages.forEach((page) => {
    page.sort((a, b) => (orderMap.get(a.name) ?? 0) - (orderMap.get(b.name) ?? 0));
  });
}

/** Remove trailing empty pages */
function removeTrailingEmptyPages(pages: Schema[][]): void {
  while (pages.length > 1 && pages[pages.length - 1].length === 0) {
    pages.pop();
  }
}

/**
 * Place absolute items at their literal page coordinates and emit the
 * resulting per-page schema arrays.
 *
 * Phase 4 (RFC 0001) replaced the earlier `processDynamicPage`
 * implementation — which carried the upstream-inherited `totalYOffset`
 * grouped-offset flow propagation — with this single-loop placement.
 * Under the post-Phase-4 single-system layout model, `mode: 'absolute'`
 * means literal coords: an absolute schema does not move under any
 * circumstance, even if a growing neighbour overlaps it. Templates
 * that depended on the old flow propagation must run
 * `migrateTemplateToAnchored` (chain-anchoring document-order
 * predecessors) — see `packages/common/src/migrate.ts`.
 *
 * pageBreak primitive support is intentionally not preserved here.
 * It was a flow-aware concept (snap subsequent items to the next page
 * boundary in the offset accumulator) that has no meaning for items
 * with literal coords. If/when an anchored equivalent is requested,
 * it'll arrive as a new anchor mode.
 *
 * Anchored items skip this function entirely; they're placed by
 * `processAnchoredPage`'s Pass 3 walk via direct `placeRowsOnPages`
 * calls.
 */
function placeAbsoluteItems(
  items: LayoutItem[],
  orderMap: Map<string, number>,
  contentHeight: number,
  paddingTop: number,
): Schema[][] {
  const pages: Schema[][] = [];
  for (const item of items) {
    if (isPageBreakSchema(item.schema)) continue;
    placeRowsOnPages(item.schema, item.fragments, item.baseY, contentHeight, paddingTop, pages);
  }
  sortPagesByOrder(pages, orderMap);
  removeTrailingEmptyPages(pages);
  return pages;
}

interface PageReflowContext {
  pageSchemas: Schema[];
  basePdf: BlankPdf | StationeryPdf;
  input: Record<string, string>;
  options: CommonOptions;
  _cache: Map<string | number, unknown>;
  contentHeight: number;
  paddingTop: number;
  getDynamicLayout?: ModifyTemplateForDynamicTableArg['getDynamicLayout'];
  getDynamicHeights?: ModifyTemplateForDynamicTableArg['getDynamicHeights'];
}

/**
 * Measure a single layout item via the registered plugin's `measure` hook
 * (or fall back to the schema's static height). Returned fragments may be
 * a single-row entry (non-splittable plugin), a per-row dynamicHeights
 * breakdown, or per-fragment heights for cross-page splitting.
 */
async function measurePageItem(
  ctx: PageReflowContext,
  item: LayoutItem,
): Promise<LayoutUnitFragment[]> {
  const value = getSchemaValue(item.schema, ctx.input, ctx.pageSchemas);
  const measureArgs = {
    schema: item.schema,
    basePdf: ctx.basePdf,
    options: ctx.options,
    _cache: ctx._cache,
  };
  if (ctx.getDynamicLayout) {
    const result = await ctx.getDynamicLayout(value, measureArgs);
    const fragments = getLayoutFragmentsFromLayoutResult(item.schema, result);
    return fragments.length === 0 ? layoutFragmentsFromHeights([0], 'height') : fragments;
  }
  if (ctx.getDynamicHeights) {
    const heights = await ctx.getDynamicHeights(value, measureArgs);
    return layoutFragmentsFromHeights(heights.length === 0 ? [0] : heights, 'dynamicHeights');
  }
  return layoutFragmentsFromHeights([item.schema.height], 'height');
}

/**
 * Apply a measurement result to a layout item: store the fragments and
 * sync the actual height onto the schema (and its pageSchemas counterpart)
 * so downstream anchor lookups via `buildSchemaIndex` read the post-measure
 * value. `item.height` is intentionally NOT mutated — the engine relies
 * on it as the declared baseEnd for grouped-offset accounting.
 */
function applyMeasurement(
  item: LayoutItem,
  fragments: LayoutUnitFragment[],
  originalBySchemaName: Map<string, Schema>,
): void {
  item.fragments = fragments;

  // Extra defensive sanitization at the point where we commit the measured
  // height back onto the schema objects that downstream anchor resolution
  // will read. This is the "more correct" belt-and-suspenders approach.
  let actualHeight = 0;
  for (const fragment of fragments) {
    actualHeight += sanitizeHeight(fragment.height, item.schema.height);
  }

  const safeHeight = sanitizeHeight(actualHeight, item.schema.height);
  item.schema.height = safeHeight;
  const original = originalBySchemaName.get(item.schema.name);
  if (original) original.height = safeHeight;
}

/**
 * Resolve an anchored schema's x / y against the current `pageSchemas`
 * geometry and mirror the result onto the layout item. Used for both
 * tentative resolution in Pass 1 and final resolution in Pass 3.
 *
 * `lookup` is a precomputed schema index (built once per page by the
 * caller) — buildSchemaIndex returns a Map keyed by id pointing to the
 * SAME schema objects that `pageSchemas` holds, so mutations to
 * `schema.height` and `schema.position` made earlier in the topo walk
 * are visible through the map without rebuilding.
 */
function resolveAnchoredItem(
  schema: Schema,
  item: LayoutItem,
  lookup: Map<string, Schema>,
  paddingTop: number,
): void {
  const newX = resolveAnchorX(schema, lookup);
  const newY = resolveAnchorY(schema, lookup);
  if (newX !== null) {
    schema.position.x = newX;
    item.schema.position.x = newX;
  }
  if (newY !== null) {
    schema.position.y = newY;
    item.schema.position.y = newY;
    item.baseY = Math.max(0, newY - paddingTop);
  }
}

/**
 * Walk the placed pages and write each placed schema's last-fragment
 * geometry back onto its `pageSchemas` entry. "Last fragment" = the
 * fragment with the bottom-most edge across all pages: highest
 * `pageIndex`, breaking ties by greatest `position.y + height` on that
 * page. (placeRowsOnPages today emits at most one chunk per schema per
 * page; the same-page tiebreak is defensive against future changes
 * that pack multiple chunks per page.)
 *
 * The encoded `position.y` is a GLOBAL Y
 * (`pageIndex * contentHeight + fragmentY`) so that:
 *   - resolveAnchorY's `target.position.y + target.height` arithmetic
 *     produces the bottom edge in global-Y space for cross-page
 *     anchor refs, and
 *   - placeRowsOnPages, which derives `pageIndex = floor(globalY /
 *     contentHeight)` and `yInPage = globalY mod contentHeight`,
 *     places dependents on the correct page without separate
 *     fragment-index plumbing. Phase 3 will introduce an explicit
 *     fragment-aware anchor model; this is the Phase 2 stop-gap.
 */
function syncLastFragmentGeometry(
  name: string,
  pages: Schema[][],
  contentHeight: number,
  originalBySchemaName: Map<string, Schema>,
): void {
  let last: { pageIndex: number; y: number; height: number; x: number } | undefined;
  for (let p = 0; p < pages.length; p++) {
    for (const placed of pages[p]) {
      if (placed.name !== name) continue;
      if (isPageBreakSchema(placed)) continue;
      const placedBottom = placed.position.y + placed.height;
      if (
        !last ||
        p > last.pageIndex ||
        (p === last.pageIndex && placedBottom > last.y + last.height)
      ) {
        last = {
          pageIndex: p,
          y: placed.position.y,
          height: placed.height,
          x: placed.position.x,
        };
      }
    }
  }
  if (!last) return;
  const original = originalBySchemaName.get(name);
  if (!original) return;
  original.position.x = last.x;
  original.position.y = last.pageIndex * contentHeight + last.y;
  original.height = last.height;
}

/**
 * Absolute-only fast path: parallel-batch measure followed by a single
 * `placeAbsoluteItems` call. Used for pages where every schema is
 * absolute (no anchored layouts).
 */
async function processAbsoluteOnlyPage(
  ctx: PageReflowContext,
  parallelLimit: number,
): Promise<Schema[][]> {
  const { items, orderMap } = normalizePageSchemas(ctx.pageSchemas, ctx.paddingTop);
  const originalBySchemaName = new Map<string, Schema>();
  for (const schema of ctx.pageSchemas) originalBySchemaName.set(schema.name, schema);
  for (let i = 0; i < items.length; i += parallelLimit) {
    const chunk = items.slice(i, i + parallelLimit);
    const chunkResults = await Promise.all(chunk.map((item) => measurePageItem(ctx, item)));
    for (let j = 0; j < chunkResults.length; j++) {
      applyMeasurement(items[i + j], chunkResults[j], originalBySchemaName);
    }
  }
  return placeAbsoluteItems(items, orderMap, ctx.contentHeight, ctx.paddingTop);
}

/**
 * Three-pass layout for pages that contain any anchored schema (RFC 0001
 * Phases 2 + 3a + 4):
 *
 *   Pass 1. **Measure.** Topo-walk the page's schemas. For each
 *     anchored schema, do a tentative resolve against upstream measured
 *     heights so `measure()` sees a sensible `position.y`. Then measure;
 *     the actual height is synced onto schema.height for downstream
 *     anchor lookups.
 *   Pass 2. **Place absolute items.** `placeAbsoluteItems` runs on
 *     ABSOLUTE items only. Each absolute item lands at its literal
 *     coords. Anchored items don't participate (Option C: absolute
 *     items aren't pushed by anchored neighbours).
 *   Pass 3. **Re-resolve and place anchored items.** Sync each absolute
 *     item's final post-placement geometry back into pageSchemas
 *     (encoded as global Y so cross-page anchor refs work), then walk
 *     topo order, re-resolving anchored x / y against the now-final
 *     upstream geometry and placing via `placeRowsOnPages` into the
 *     same pages array. Each anchored placement also syncs its own
 *     last-fragment geometry so chains where an upstream target
 *     paginates resolve against the placed bottom edge.
 */
async function processAnchoredPage(ctx: PageReflowContext): Promise<Schema[][]> {
  const { pageSchemas, contentHeight, paddingTop } = ctx;
  const { items, orderMap } = normalizePageSchemas(pageSchemas, paddingTop);
  const itemBySchemaName = new Map<string, LayoutItem>();
  for (const item of items) itemBySchemaName.set(item.schema.name, item);
  const originalBySchemaName = new Map<string, Schema>();
  for (const schema of pageSchemas) originalBySchemaName.set(schema.name, schema);

  // Pass 1: tentative anchor resolve + measure for every item.
  // Build the schema index ONCE per page and reuse it for every
  // resolution call. The map is keyed by id and points to the same
  // schema objects in pageSchemas, so per-item mutations to height /
  // position made by applyMeasurement and resolveAnchoredItem are
  // visible to subsequent lookups without rebuilding (avoids O(N²)).
  const topoOrder = topoSortByAnchorDeps(pageSchemas);
  const lookup = buildSchemaIndex(pageSchemas);
  for (const schema of topoOrder) {
    const item = itemBySchemaName.get(schema.name);
    if (!item) continue;
    if (getAnchoredLayout(schema)) {
      resolveAnchoredItem(schema, item, lookup, paddingTop);
    }
    const fragments = await measurePageItem(ctx, item);
    applyMeasurement(item, fragments, originalBySchemaName);
  }

  // Pass 2: engine on absolute items only.
  const absoluteItems = items.filter((it) => !getAnchoredLayout(it.schema));
  absoluteItems.sort((a, b) => {
    if (Math.abs(a.baseY - b.baseY) > EPSILON) return a.baseY - b.baseY;
    return (orderMap.get(a.schema.name) ?? 0) - (orderMap.get(b.schema.name) ?? 0);
  });
  const processedPages = placeAbsoluteItems(absoluteItems, orderMap, contentHeight, paddingTop);

  // Pass 3: sync absolute items' final geometry, then re-resolve and
  // place each anchored item, syncing its own placed geometry back
  // before the next anchored dependent resolves.
  const absoluteNames = new Set<string>();
  for (const page of processedPages) {
    for (const placed of page) {
      if (isPageBreakSchema(placed)) continue;
      absoluteNames.add(placed.name);
    }
  }
  for (const name of absoluteNames) {
    syncLastFragmentGeometry(name, processedPages, contentHeight, originalBySchemaName);
  }

  for (const schema of topoOrder) {
    if (!getAnchoredLayout(schema)) continue;
    const item = itemBySchemaName.get(schema.name);
    if (!item) continue;
    resolveAnchoredItem(schema, item, lookup, paddingTop);
    placeRowsOnPages(
      item.schema,
      item.fragments,
      item.baseY,
      contentHeight,
      paddingTop,
      processedPages,
    );
    syncLastFragmentGeometry(schema.name, processedPages, contentHeight, originalBySchemaName);
  }

  // Anchored items were appended; resort each page by the original
  // template order, and trim trailing empties.
  sortPagesByOrder(processedPages, orderMap);
  removeTrailingEmptyPages(processedPages);
  return processedPages;
}

/**
 * Process a template containing tables with dynamic heights
 * and generate a new template with proper page breaks.
 *
 * Processing is done page-by-page:
 * - Pages with height changes are processed with full layout calculations
 * - Pages without height changes are copied as-is (no offset propagation between pages)
 *
 * This reduces computation cost by:
 * 1. Limiting layout calculations to pages that need them
 * 2. Avoiding cross-page offset propagation for static pages
 */
export const getDynamicTemplate = async (
  arg: ModifyTemplateForDynamicTableArg,
): Promise<Template> => {
  const { template, input, options, _cache, getDynamicLayout, getDynamicHeights } = arg;
  const workingTemplate = cloneDeep(template);
  const basePdf = workingTemplate.basePdf;

  if (!treatsLikeBlank(basePdf)) {
    workingTemplate.schemas.forEach(resolveAnchoredSchemas);
    return workingTemplate;
  }

  // Validate up-front against the declared top padding (not the effective
  // staticSchema-adjusted contentTop). A schema positioned above
  // basePdf.padding[0] would otherwise crash deeper in the layout pass
  // with the opaque "Cannot read properties of undefined (reading 'push')"
  // — and that crash hits new users on the official getting-started
  // example. Surface a clear, actionable validation error instead.
  // Only absolute (non-anchored) schemas are checked here; anchored ones
  // get their final position resolved during the per-page reflow below.
  // Original upstream issue: https://github.com/pdfme/pdfme/issues/1346
  const declaredPaddingTop = basePdf.padding[0];
  for (const pageSchemas of workingTemplate.schemas) {
    for (const schema of pageSchemas) {
      const layoutMode = (schema as Schema & { layout?: SchemaLayoutRule }).layout?.mode;
      if (layoutMode === 'anchored') continue;
      // pageBreak markers (pdfme#637) carry a nominal position that may
      // legitimately sit above paddingTop; the layout engine reads only
      // their type tag, never their final y. Skip them here.
      if (isPageBreakSchema(schema)) continue;
      if (schema.position.y < declaredPaddingTop - EPSILON) {
        throw new Error(
          `[@pdfweave/common] Schema "${schema.name}" position.y (${schema.position.y}) ` +
            `must be >= basePdf.padding[0] (${declaredPaddingTop}).`,
        );
      }
    }
  }

  const { contentHeight, contentTop: paddingTop } = getEffectiveContentBounds(basePdf);
  const resultPages: Schema[][] = [];
  const PARALLEL_LIMIT = 10;

  // Process each template page independently. The per-page work is
  // delegated to processAnchoredPage / processAbsoluteOnlyPage; see
  // those helpers for the Phase 2 design.
  for (let pageIndex = 0; pageIndex < workingTemplate.schemas.length; pageIndex++) {
    const pageSchemas = workingTemplate.schemas[pageIndex];
    const ctx: PageReflowContext = {
      pageSchemas,
      basePdf,
      input,
      options,
      _cache,
      contentHeight,
      paddingTop,
      getDynamicLayout,
      getDynamicHeights,
    };
    const hasAnyAnchor = pageSchemas.some((s) => getAnchoredLayout(s));
    const processedPages = hasAnyAnchor
      ? await processAnchoredPage(ctx)
      : await processAbsoluteOnlyPage(ctx, PARALLEL_LIMIT);
    resultPages.push(...processedPages);
  }

  removeTrailingEmptyPages(resultPages);

  // Check if anything changed - return original template if not
  if (resultPages.length === template.schemas.length) {
    let unchanged = true;
    for (let i = 0; i < resultPages.length && unchanged; i++) {
      if (resultPages[i].length !== template.schemas[i].length) {
        unchanged = false;
        break;
      }
      for (let j = 0; j < resultPages[i].length && unchanged; j++) {
        const orig = template.schemas[i][j];
        const result = resultPages[i][j];
        if (
          Math.abs(orig.height - result.height) > EPSILON ||
          Math.abs(orig.position.x - result.position.x) > EPSILON ||
          Math.abs(orig.position.y - result.position.y) > EPSILON
        ) {
          unchanged = false;
        }
      }
    }
    if (unchanged) {
      return template;
    }
  }

  return { basePdf, schemas: resultPages };
};
