# Dynamic layout in PDFweave

> Status: living document. Captures the layout model as of RFC 0001
> Phases 1–3a (merged 2026-05-09 / 2026-05-10).

## Two layout modes

A schema's vertical position comes from one of two mechanisms:

- **`anchored`** — position is computed at runtime from the anchor
  graph using *actual* measured dimensions. Reacts to neighbour
  growth.
- **`absolute`** (default; no `layout` field) — position is the
  literal `position.x` / `position.y` from the template. Does not
  move under any circumstance, even if a growing neighbour overlaps
  it. (See "Phase 4 migration" in [RFC 0001][rfc] for the path that
  deletes the upstream `totalYOffset` flow propagation entirely;
  during the migration window `processDynamicPage` still flows
  absolute items so existing templates render unchanged.)

[rfc]: ../rfc/0001-runtime-anchor-resolution.md

## Per-page reflow flow

When `getDynamicTemplate` processes a page that contains at least one
anchored schema, three passes run in `processAnchoredPage`
(`packages/common/src/dynamicTemplate.ts`):

1. **Measure.** Walk the page's schemas in topological dep order.
   For each anchored schema, do a tentative resolve against upstream
   measured heights so `measure()` sees a sensible `position.y`
   (the built-in text plugin reads it via `getRemainingPageHeight`).
   The actual measured height is synced onto `schema.height` for
   downstream lookups.
2. **Engine on absolute items.** `processDynamicPage` runs on
   absolute items only and applies the Phase 1 grouped-offset flow.
   Anchored items don't influence the engine's accounting — Option C:
   absolute schemas aren't pushed by anchored neighbours.
3. **Re-resolve and place anchored.** Walk the topological order
   again; for each anchored schema, re-resolve x/y against the
   final post-engine geometry of upstream items, then place via
   `placeRowsOnPages` directly into the page array the engine
   produced. Each anchored placement also syncs its own
   last-fragment geometry so chains where an upstream target
   paginates resolve against the placed bottom edge of the last
   fragment, not the start-page-y of the first.

Pages with no anchored schemas use the existing absolute-only fast
path: parallel-batch measurement and a single `processDynamicPage`
call.

## Cross-page anchor refs (the "global-Y" encoding)

When an anchor target paginates across pages, anchor lookups need to
know *which page* the target's bottom edge ended up on. Phase 2's
`syncLastFragmentGeometry` solves this by encoding the bottom edge
as a **global Y** value:

```
target.position.y  ←  lastPageIndex × contentHeight + lastFragmentY
target.height      ←  lastFragmentHeight
```

With this encoding:

- `resolveAnchorY`'s `target.position.y + target.height` arithmetic
  yields the bottom edge in global-Y space — correct regardless of
  whether the target paginated.
- `placeRowsOnPages`, which derives `pageIndex = floor(globalY /
  contentHeight)` and `yInPage = globalY mod contentHeight`, places
  the dependent on the correct page without separate
  fragment-index plumbing.

Single-page targets are unaffected because `lastPageIndex = 0`, so
the encoded value equals the on-page coordinate.

## Worked examples

### Anchored chain on a single page

```
A: absolute,   y=10,  declared height 10, actual 30  (dynamic)
B: anchored to A.belowBottomEdge, offset 5
```

- Pass 1: A measured → actualHeight 30. B tentatively resolved
  against A's declared height (10).
- Pass 2: A placed by engine at y=10..40 (its actual extent).
  Engine grouped-offset state: `cumMaxActualEnd = 40`,
  `cumMaxOriginalEnd = 20`.
- Pass 3 sync (absolute): A's `position.y` rewritten to 10 (page 0,
  fragment top), `height` 30. B re-resolved: `B.y = A.y (10) +
  A.height (30) + offset (5) = 45`.
- B placed at y=45.

### Anchored chain where the upstream target paginates

```
basePdf:    page height 110, padding 10/10  (drawable 90mm)
A: anchored at pageTop, dynamic with 5 × 30mm rows  (total 150mm)
B: anchored to A.belowBottomEdge, offset 5
```

- Pass 1: A measured → 150mm total split into 5 per-row fragments
  of 30mm.
- Pass 3: A placed via `placeRowsOnPages`. 3 rows fit per page, so
  the function emits two Schema chunks:
  - chunk 1 (rows 1–3, height 90mm) on page 0 at `y=10`,
  - chunk 2 (rows 4–5, height 60mm) on page 1 at `y=10`.
- Sync after A's placement: A's `position.y` rewritten to
  `1 × 90 + 10 = 100` (global Y of last fragment top), `height` 60.
- B re-resolved: `B.y = 100 + 60 + 5 = 165` (global Y).
  `placeRowsOnPages(B, …, baseY=155, …)` →
  `pageIndex = floor(155/90) = 1`, `yInPage = 65`. B's
  10mm fits in the remaining 25mm of page 1, so B lands on page 1
  at `y=75` (5mm below A's last fragment bottom).

### Anchored item targets an absolute pushed by upstream growth

```
X: absolute, y=10, dynamic 10 → 50mm   (paginates if drawable < 50)
A: absolute, y=30, height 10            (engine pushes by X's growth)
B: anchored to A.belowBottomEdge, offset 5
```

- Pass 2 engine: X spans pages. A pushed by `X.actual − X.declared =
  40` to a later page.
- Pass 3 sync (absolute): A's `position.y` rewritten to its
  engine-determined global Y. B re-resolved against the synced value
  — *not* A's template-declared `y=30`.
- B lands directly below A's final position (or page-breaks per the
  orphan-protection logic if A's page has no remaining space).

## What's deferred

- **`belowFragment(targetSchemaId, fragmentIndex)`** — anchor refs
  that target an interior fragment of a paginated item (e.g. "below
  row 5 of the table"). Today every anchor ref resolves to the
  target's *last* fragment.
- **`LayoutFragment.anchors` consumed by anchor resolution** —
  named anchor points within a fragment, e.g.
  `{ schemaId: 'invoiceTable', anchorName: 'totalRowBaseline' }`.
  The field exists in `types.ts` and is populated by overlay
  rendering today, but anchor resolution doesn't read it.

Both are tracked as Phase 3b in [RFC 0001][rfc]; they'll arrive with
their own RFC since they need a richer target-lookup model than the
global-Y trick provides.
