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
  ANCHOR_EPSILON,
  buildSchemaIndex,
  getAnchoredLayout,
  resolveAnchorX,
  resolveAnchorY,
  topoSortByAnchorDeps,
} from './anchorGeometry.js';

/** Floating point tolerance for comparisons */
const EPSILON = 0.01;

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

const isPageBreakSchema = (schema: Schema): boolean =>
  schema.type === PAGE_BREAK_SCHEMA_TYPE;

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

type ItemPlacement = 'absolute' | 'anchored';

interface LayoutItem {
  schema: Schema;
  baseY: number;
  height: number;
  fragments: LayoutUnitFragment[];
  /**
   * Placement responsibility for this item.
   *
   * - `absolute` (default) — `processDynamicPage` places this item using its
   *   grouped-offset flow accounting (Phase 1 stop-gap).
   * - `anchored` — already placed by the Phase 2 topological resolve walk
   *   in `getDynamicTemplate` via a direct `placeRowsOnPages` call. The
   *   engine pass must skip it so its position is not double-shifted by
   *   upstream expansion.
   */
  placement: ItemPlacement;
  /**
   * Final global Y (baseY-space, padding-relative) at which this item's
   * placement ended. Set by `placeRowsOnPages`; read by
   * `processDynamicPage` so anchored items contribute to the engine's
   * grouped-offset accounting even though their placement is skipped.
   * Without this, downstream absolute items would not be pushed past an
   * anchored item that grew.
   */
  actualEndY?: number;
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
 * Iteratively forward-resolve anchored schemas on a page, mutating
 * `schema.position` in place. Anchor geometry is delegated to
 * `anchorGeometry`; this function is the reflow-engine's iteration driver
 * (multi-pass to handle chains of anchors) and divergence guard.
 */
function resolveAnchoredSchemas(pageSchemas: Schema[]): void {
  const lookup = buildSchemaIndex(pageSchemas);

  for (let pass = 0; pass < pageSchemas.length; pass += 1) {
    let changed = false;

    for (const schema of pageSchemas) {
      const layout = (schema as Schema & { layout?: SchemaLayoutRule }).layout;
      if (!layout || layout.mode !== 'anchored') continue;

      const previousX = schema.position.x;
      const previousY = schema.position.y;
      const nextX = resolveAnchorX(schema, lookup);
      const nextY = resolveAnchorY(schema, lookup);
      if (nextX !== null) schema.position.x = nextX;
      if (nextY !== null) schema.position.y = nextY;

      if (
        Math.abs(previousX - schema.position.x) > ANCHOR_EPSILON ||
        Math.abs(previousY - schema.position.y) > ANCHOR_EPSILON
      ) {
        changed = true;
      }
    }

    if (!changed) return;

    if (pass === pageSchemas.length - 1) {
      throw new Error('[@pdfweave/common] Circular or non-converging anchor layout detected.');
    }
  }
}

function getDynamicHeightsFromLayoutResult(schema: Schema, result: LayoutMeasureResult): number[] {
  if (result.dynamicHeights && result.dynamicHeights.length > 0) {
    return result.dynamicHeights;
  }

  if (result.fragments && result.fragments.length > 0) {
    return result.fragments.map((fragment) => fragment.height);
  }

  if (typeof result.height === 'number') {
    return [result.height];
  }

  return [schema.height];
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
  if (result.dynamicHeights && result.dynamicHeights.length > 0) {
    return layoutFragmentsFromHeights(result.dynamicHeights, 'dynamicHeights');
  }

  if (result.fragments && result.fragments.length > 0) {
    return result.fragments.map((fragment) => ({
      ...fragment,
      height: fragment.height,
      __source: 'fragments',
    }));
  }

  if (typeof result.height === 'number') {
    return layoutFragmentsFromHeights([result.height], 'height');
  }

  return layoutFragmentsFromHeights([schema.height], 'height');
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
const getSchemaValue = (schema: Schema, input: Record<string, string>, pageSchemas: Schema[]): string =>
  resolveSchemaValue({ schema, input, schemas: [pageSchemas] });

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
      placement: 'absolute',
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
 * Process a single template page that has dynamic content.
 *
 * Two schemas are treated as part of the same horizontal group when their
 * *original* Y ranges (`baseY` to `baseY + height`) overlap. Strict
 * baseY equality would falsely separate side-by-side schemas placed at
 * e.g. y=20 and y=21 due to manual layout drift. Items in a group share
 * the same offset; schemas below the group are pushed down by how far
 * the group as a whole expanded, not by each member's individual
 * expansion.
 *
 * The offset for a group is computed as
 * `cumMaxActualEnd - cumMaxOriginalEnd` over all already-committed
 * groups. This formulation has two important properties:
 *  1. When a single schema spans multiple pages (e.g. a long table that
 *     breaks across 5 pages), downstream schemas correctly land below
 *     the last page, because actualEnd reflects the page-break drift.
 *  2. When an unrelated schema is merely *pushed* onto a later page
 *     without expanding itself, both its actualEnd and originalEnd
 *     increase by similar amounts (the page-break drift cancels), so
 *     the offset for the *next* group does not accumulate the drift
 *     twice.
 *
 * `items` is pre-sorted by `normalizePageSchemas` (baseY ascending;
 * original order preserved for ties), so each new item only needs to
 * check whether it starts before the running `groupYEnd`.
 *
 * Adapted from upstream pdfme/pdfme#1489 with PDFweave-specific
 * pageBreak interleaving (pdfme#637): a page-break commits the current
 * group before snapping to the next page boundary, then resets the
 * group tracker so the items after the break form a fresh group.
 */
function processDynamicPage(
  items: LayoutItem[],
  orderMap: Map<string, number>,
  contentHeight: number,
  paddingTop: number,
  initialPages?: Schema[][],
): Schema[][] {
  const pages: Schema[][] = initialPages ?? [];

  let cumMaxActualEnd = 0;
  let cumMaxOriginalEnd = 0;
  let groupYEnd = Number.NEGATIVE_INFINITY;
  let groupMaxActualEnd = Number.NEGATIVE_INFINITY;
  let groupMaxOriginalEnd = Number.NEGATIVE_INFINITY;

  const commitGroup = () => {
    if (groupMaxActualEnd === Number.NEGATIVE_INFINITY) return;
    if (groupMaxActualEnd > cumMaxActualEnd) cumMaxActualEnd = groupMaxActualEnd;
    if (groupMaxOriginalEnd > cumMaxOriginalEnd) cumMaxOriginalEnd = groupMaxOriginalEnd;
    groupMaxActualEnd = Number.NEGATIVE_INFINITY;
    groupMaxOriginalEnd = Number.NEGATIVE_INFINITY;
  };

  for (const item of items) {
    // Phase 2: anchored items were placed in the topological resolve walk
    // via a direct placeRowsOnPages call (see getDynamicTemplate). Skip
    // their second placement here so their resolved position is not
    // double-shifted by the engine's grouped offset — but still feed
    // their actualEndY into the group accounting so downstream absolute
    // items get pushed past them when they consumed more vertical space
    // than their declared height.
    if (item.placement === 'anchored') {
      const itemBaseEnd = item.baseY + item.height;
      const overlapsCurrentGroup = item.baseY < groupYEnd - EPSILON;
      if (!overlapsCurrentGroup) {
        commitGroup();
        groupYEnd = itemBaseEnd;
      } else if (itemBaseEnd > groupYEnd) {
        groupYEnd = itemBaseEnd;
      }
      const actualEnd = item.actualEndY ?? itemBaseEnd;
      if (actualEnd > groupMaxActualEnd) groupMaxActualEnd = actualEnd;
      if (itemBaseEnd > groupMaxOriginalEnd) groupMaxOriginalEnd = itemBaseEnd;
      continue;
    }

    // pageBreak primitive (pdfme#637): force everything that follows
    // onto the next page regardless of remaining vertical space. We
    // don't emit the marker in the output (zero render footprint); we
    // just bump cumMaxActualEnd so the next item's groupOffset rounds
    // up to a page boundary, AND commit / reset the group tracker so
    // post-break items don't share a group with pre-break items.
    if (isPageBreakSchema(item.schema)) {
      commitGroup();
      const currentGroupOffset = Math.max(0, cumMaxActualEnd - cumMaxOriginalEnd);
      const currentGlobalStartY = item.baseY + currentGroupOffset;
      const currentPageIndex = Math.floor(currentGlobalStartY / contentHeight);
      const currentYInPage = currentGlobalStartY - currentPageIndex * contentHeight;
      // Snap to the start of the next page only if we're not already
      // exactly at one — back-to-back page breaks shouldn't double-skip.
      if (currentYInPage > EPSILON) {
        const nextPageStart = (currentPageIndex + 1) * contentHeight;
        cumMaxActualEnd += nextPageStart - currentGlobalStartY;
      }
      // Reset group tracker; items after a page break form a new group.
      groupYEnd = Number.NEGATIVE_INFINITY;
      // Ensure the (now-next) page exists so subsequent layout has a slot.
      const postBreakOffset = Math.max(0, cumMaxActualEnd - cumMaxOriginalEnd);
      const targetPageIndex = Math.floor((item.baseY + postBreakOffset) / contentHeight);
      while (pages.length <= targetPageIndex) pages.push([]);
      continue;
    }

    const itemBaseEnd = item.baseY + item.height;
    const overlapsCurrentGroup = item.baseY < groupYEnd - EPSILON;

    if (!overlapsCurrentGroup) {
      commitGroup();
      groupYEnd = itemBaseEnd;
    } else if (itemBaseEnd > groupYEnd) {
      groupYEnd = itemBaseEnd;
    }

    const groupOffset = Math.max(0, cumMaxActualEnd - cumMaxOriginalEnd);
    const currentGlobalStartY = item.baseY + groupOffset;

    const actualGlobalEndY = placeRowsOnPages(
      item.schema,
      item.fragments,
      currentGlobalStartY,
      contentHeight,
      paddingTop,
      pages,
    );

    if (actualGlobalEndY > groupMaxActualEnd) groupMaxActualEnd = actualGlobalEndY;
    if (itemBaseEnd > groupMaxOriginalEnd) groupMaxOriginalEnd = itemBaseEnd;
  }
  commitGroup();

  sortPagesByOrder(pages, orderMap);
  removeTrailingEmptyPages(pages);

  return pages;
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

  // Process each template page independently.
  //
  // Phase 2 (RFC 0001) — interleaved topological resolve + measure for
  // anchored schemas, with absolute schemas continuing to flow through
  // the engine until Phase 4 deletes that path.
  //
  // For each page we:
  //   1. Normalise schemas into items.
  //   2. If the page contains any anchored schema, walk the topo order
  //      and for each anchored schema:
  //        - re-resolve x / y against the latest measured heights of its
  //          dependencies (already processed earlier in topo order);
  //        - measure with the now-correct position;
  //        - place via placeRowsOnPages directly into the shared `pages`
  //          array, marking item.placement = 'anchored'.
  //      Absolute schemas in mixed templates are measured in topo order
  //      too (so their actual height is available to downstream anchored
  //      schemas) but NOT placed yet.
  //   3. Run processDynamicPage. It skips items where placement ===
  //      'anchored' (they're already placed) and applies the Phase 1
  //      grouped offset to absolute items.
  //
  // The pre-Phase-2 path called resolveAnchoredSchemas BEFORE measure
  // with declared heights. That left anchored chains misaligned by the
  // declared/actual delta; the engine's totalYOffset compensated. Phase 2
  // moves resolution into the topo walk so anchored positions reflect
  // actual measured heights of their referents — and skips the engine
  // for anchored items so their position is not double-shifted.
  //
  // PARALLEL_LIMIT is preserved as the default chunk size for the
  // ABSOLUTE-only fast path: when no schema on the page is anchored,
  // measurement order is irrelevant and we can revert to wave-parallel
  // batches. With anchors present we serialise per chain.
  for (let pageIndex = 0; pageIndex < workingTemplate.schemas.length; pageIndex++) {
    const pageSchemas = workingTemplate.schemas[pageIndex];

    // Normalize first so we have items to mutate during the topo walk.
    const { items, orderMap } = normalizePageSchemas(pageSchemas, paddingTop);
    const itemBySchemaName = new Map<string, LayoutItem>();
    for (const item of items) itemBySchemaName.set(item.schema.name, item);
    const originalBySchemaName = new Map<string, Schema>();
    for (const schema of pageSchemas) originalBySchemaName.set(schema.name, schema);

    const measureItem = async (item: LayoutItem): Promise<LayoutUnitFragment[]> => {
      const value = getSchemaValue(item.schema, input, pageSchemas);
      const measureArgs = {
        schema: item.schema,
        basePdf,
        options,
        _cache,
      };

      if (getDynamicLayout) {
        const result = await getDynamicLayout(value, measureArgs);
        const fragments = getLayoutFragmentsFromLayoutResult(item.schema, result);
        return fragments.length === 0
          ? layoutFragmentsFromHeights([0], 'height')
          : fragments;
      }

      if (getDynamicHeights) {
        const heights = await getDynamicHeights(value, measureArgs);
        return layoutFragmentsFromHeights(
          heights.length === 0 ? [0] : heights,
          'dynamicHeights',
        );
      }

      return layoutFragmentsFromHeights([item.schema.height], 'height');
    };

    const applyMeasurement = (item: LayoutItem, fragments: LayoutUnitFragment[]): void => {
      item.fragments = fragments;
      // DO NOT mutate item.height. The engine relies on it being the
      // declared height for grouped-offset accounting on absolute items.
      // Instead, sync the actual measured height onto schema.height so
      // downstream anchored schemas resolving against this item read the
      // post-measure value via buildSchemaIndex.
      let actualHeight = 0;
      for (const fragment of fragments) actualHeight += fragment.height;
      item.schema.height = actualHeight;
      const original = originalBySchemaName.get(item.schema.name);
      if (original) original.height = actualHeight;
    };

    const hasAnyAnchor = pageSchemas.some((s) => getAnchoredLayout(s));
    const sharedPages: Schema[][] = [];

    if (!hasAnyAnchor) {
      // Absolute-only fast path: parallelise measurement in batches.
      for (let i = 0; i < items.length; i += PARALLEL_LIMIT) {
        const chunk = items.slice(i, i + PARALLEL_LIMIT);
        const chunkResults = await Promise.all(chunk.map(measureItem));
        for (let j = 0; j < chunkResults.length; j++) {
          applyMeasurement(items[i + j], chunkResults[j]);
        }
      }
    } else {
      // Mixed / anchored path: topo walk interleaves resolve + measure;
      // anchored items are placed directly via placeRowsOnPages.
      const topoOrder = topoSortByAnchorDeps(pageSchemas);
      for (const schema of topoOrder) {
        const item = itemBySchemaName.get(schema.name);
        if (!item) continue;

        if (getAnchoredLayout(schema)) {
          // Re-resolve position from already-measured deps. The schema
          // index is rebuilt fresh because schema.height has been
          // mutated by applyMeasurement on prior topo nodes.
          const lookup = buildSchemaIndex(pageSchemas);
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

        const fragments = await measureItem(item);
        applyMeasurement(item, fragments);

        if (getAnchoredLayout(schema)) {
          // Place the anchored item directly. processDynamicPage skips
          // its second placement pass (placement === 'anchored') but
          // still consumes actualEndY for grouped-offset accounting so
          // downstream absolute items get pushed past it.
          item.actualEndY = placeRowsOnPages(
            item.schema,
            item.fragments,
            item.baseY,
            contentHeight,
            paddingTop,
            sharedPages,
          );
          item.placement = 'anchored';
        }
      }
    }

    // Engine pass — handles absolute items via Phase 1 grouped offset.
    // Anchored items are skipped (placement === 'anchored'). The shared
    // `sharedPages` array lets engine-placed items merge onto pages that
    // already contain anchored items.
    const processedPages = processDynamicPage(
      items,
      orderMap,
      contentHeight,
      paddingTop,
      sharedPages,
    );
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
