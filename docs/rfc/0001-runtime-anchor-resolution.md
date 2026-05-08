# RFC 0001 — Runtime anchor resolution + dynamic-layout coexistence

- **Status:** Draft
- **Author:** PDFweave maintainers
- **Date:** 2026-05-08
- **Implementation tracking:** TBD GitHub issue

## Summary

PDFweave's anchor system was designed to be the runtime source of truth
for relative positioning, but the runtime consumer of measured
dimensions was never wired. As a result, the anchor graph today is
resolved exactly once with **declared** heights, before dynamic-height
measurement, and the upstream-inherited dynamic-layout engine's
`totalYOffset` accumulator silently fills the gap. This RFC proposes
a four-phase plan to (1) fix an active correctness bug in the engine,
(2) finish wiring runtime anchor re-resolution as originally intended,
(3) make anchor resolution page-aware, and (4) split responsibilities
cleanly between the anchor system (for anchored schemas) and the
engine (as a fallback for absolute-positioned schemas), so the two
mechanisms coexist without overlap.

## Problem statement

### What the anchor system actually does today

Tracing `getDynamicTemplate` in `packages/common/src/dynamicTemplate.ts`:

1. **Line 619** — `resolveAnchoredSchemas(pageSchemas)` runs once per
   page, BEFORE measurement. `resolveAnchorY` reads `target.height`,
   which at this point is the **declared** height from the template.
2. **Line 622** — `normalizePageSchemas` snapshots positions into
   `LayoutItem.baseY`.
3. **Lines 625–662** — dynamic heights computed via
   `getDynamicLayout` / `getDynamicHeights` callback (or the unified
   `plugin.measure()` since pdfme#1418).
4. **Line 665** — `processDynamicPage(items, …)` walks items in
   baseY-sorted order, accumulating
   `totalYOffset = actualHeight − declaredHeight` from each item's
   expansion and applying it to all subsequent items.

There is no second `resolveAnchoredSchemas` pass after measurement.
Confirmed via git history: across the four commits that ever modified
`resolveAnchoredSchemas` (`c26a4e02`, `14f3ccb1`, `c9400b54`,
`844aefde`), no commit ever added a second pass.

The `LayoutMeasureResult.anchors` and `LayoutFragment.anchors` fields
exist in `types.ts` to support per-fragment named anchor points. They
are referenced only in `anchorLayout.ts` (overlay rendering) and
`AnchorOverlay.tsx` (Designer overlay). They are **never read by the
runtime layout engine**.

### What the dynamic-layout engine actually does today

`processDynamicPage` is the runtime adjustment mechanism:

```ts
let totalYOffset = 0;
for (const item of items) {
  const currentGlobalStartY = item.baseY + totalYOffset;
  const actualGlobalEndY = placeRowsOnPages(...);
  totalYOffset = actualGlobalEndY - (item.baseY + item.height);
}
```

This is the upstream-inherited algorithm, with the `pageBreak`
primitive interleaved (commit `c7f27e2d`, pdfme#637). It works for the
chain case (B `belowBottomEdge` of A) — the offset propagates correctly
to subsequent items. It is wrong for the same-Y sibling case — items at
the same baseline get pushed down by their sibling's expansion, even
though they share the baseline, not the dependency.

### Why the existing anchor tests pass

For chains of `belowBottomEdge`-anchored schemas, the engine's
`totalYOffset` produces the same final position the anchor graph
*would* produce if it re-resolved with actual heights. The two
mechanisms compose to give the right answer. The composition fails for
same-Y siblings — bug fix tracked as upstream PR `pdfme/pdfme#1489`.

### What the anchor system *does* contribute today (real value)

- **Designer ergonomics** — drag-along behaviour in the editor;
  resolved every input event via `helper.ts:627`.
- **Horizontal positioning** — the engine knows nothing about X. All
  `afterRightEdge`, `alignRightEdge`, `pageLeft` semantics run
  exclusively through the anchor system.
- **Initial relative Y placement** — the engine adjusts a baseY that
  must be relatively correct to start with. Anchors give the engine a
  correct baseline.
- **Semantic graph that survives editing** — `B is below A` is
  preserved across template mutations.

### What the anchor system *does not* contribute today (the gap)

- **Runtime re-resolution using actual heights.** The graph is not
  consulted after `measure()` runs.
- **Page-aware anchor relationships.** The graph cannot express "B is
  below A's last fragment when A spans multiple pages."
- **Anchoring to fragment-level named points.** The
  `LayoutFragment.anchors` field is unused.

## Goals

1. Fix the active same-Y correctness bug.
2. Make the anchor system the runtime source of truth for anchored
   schemas, using actual measured heights.
3. Define a clear coexistence model with the engine: anchors handle
   anchored schemas; engine handles non-anchored schemas; the two
   never disagree.
4. Preserve backward compatibility with existing templates throughout
   the migration.

## Non-goals

- Removing the engine. The engine still serves non-anchored schemas
  and is the backstop for users who prefer absolute-positioning
  templates.
- Breaking the public stored-template format.
- Supporting dynamic anchor *offsets* (offsets that depend on input
  data). The offset in an anchor rule remains static.
- Migration tooling that auto-anchors absolute-positioned schemas.
  That heuristic is fragile; users opt in to anchoring per schema as
  they always have.

## Proposed plan

### Phase 1 — Same-Y stop-gap *(stop-gap, ~1 day)*

**Goal:** apply upstream `pdfme/pdfme#1489`'s fix to our engine,
adapted for our `pageBreak` primitive.

**Implementation:**

- Replace the single `totalYOffset` accumulator with grouped accounting:
  schemas at overlapping Y ranges form a group; within a group all
  items share the same offset; only AFTER the group commits does the
  group's max expansion propagate.
- Use `cumMaxActualEnd − cumMaxOriginalEnd` formulation (handles
  page-spanning siblings — the page-break drift cancels in the
  subtraction).
- `commitGroup()` at the top of the `pageBreak` branch so a page-break
  flushes the current Y-group before snapping.
- Backport the 5 upstream tests, plus a 6th covering
  `pageBreak + same-Y siblings`.

**Outcome:** the engine produces correct results for any schemas at
the same baseY — anchored or absolute. Both go through
`normalizePageSchemas` + `processDynamicPage` today, so two anchored
siblings (e.g. both `{ y: { mode: 'pageTop', offsetMm: 10 } }`) are
ordered by `orderMap` and the later one is pushed down by the
earlier sibling's expansion. The grouped-offset fix corrects this
for them too. Phase 1 tests cover both flavours of same-Y siblings.

**Risk:** low. Pure runtime fix, no API change, behaviour-preserving for
all existing test cases.

### Phase 2 — Runtime anchor re-resolution (single-page) *(~3 days)*

**Goal:** make the anchor graph the runtime source of truth for
anchored schemas that fit on a single page.

**Implementation:**

After dynamic-height measurement (~line 662) but BEFORE
`processDynamicPage` runs, the cloned `items[]` array already holds
measured fragments. The crucial detail is that `processDynamicPage`
reads `items[i].schema`, `.height`, and `.baseY` — **not the original
`pageSchemas`**. Mutating `pageSchemas` and re-running
`resolveAnchoredSchemas(pageSchemas)` alone has no effect on placement.
So Phase 2 must:

1. Compute each item's actual total height from `items[i].fragments`
   (sum of fragment heights, with the same accumulation rule the engine
   uses today).
2. Write the actual height back onto `items[i].schema.height` and onto
   `pageSchemas` (so a fresh `buildSchemaIndex` sees actual heights).
3. Re-run `resolveAnchoredSchemas(pageSchemas)` — the existing
   pass-loop converges on chains.
4. Sync the re-resolved positions: for each `items[i]`, set
   `items[i].schema.position` and recompute `items[i].baseY =
   items[i].schema.position.y - paddingTop`.
5. Re-sort `items` by the new `baseY` (the engine assumes baseY-sorted
   input; positions can change).
6. **Mark anchored items as already-placed.** Add a flag (e.g.
   `items[i].placement = 'anchored'`). `processDynamicPage` consumes
   the flag: anchored items skip the `totalYOffset` machinery and use
   `items[i].baseY` directly as their global Y; they still go through
   `placeRowsOnPages` so their fragments split across pages
   correctly. Non-anchored items (`placement = 'absolute'`) continue
   to use the grouped-offset mechanism from Phase 1.
7. **Page-spanning detection** for the "fall back to engine" caveat
   below: detect from actual placement, not from `fragments.length`.
   Tables and multi-line text legitimately produce many fragments
   that all fit on one page. The right signal is whether
   `cumulativeFragmentHeight` starting at the schema's `baseY` ever
   crosses a page boundary, computed as part of step 1's accumulation.

**Caveat for Phase 2 (lifted in Phase 3):** if an anchored schema's
target page-spans (per the placement-derived signal in step 7), the
re-resolved position only knows the target's height, not which page
the target's bottom edge lands on. For these targets only, fall
through to the existing engine `totalYOffset` path. Phase 3 makes
the resolver page-aware so this caveat goes away.

**API:**

- No public API change. The `Plugin.measure` hook is unchanged.
- `LayoutMeasureResult.height` is now consumed by the anchor pass (was
  consumed only via fragments by the engine).

**Outcome:** anchored schemas have positions derived from actual
heights. The engine's offset becomes redundant for them but still
runs for absolute-positioned schemas. No behaviour change for users
who already had working templates — the final pixel positions match.

**Risk:** medium. Two-pass anchor resolution must converge; existing
chain handling already does. Snapshot tests will catch any drift.

### Phase 3 — Page-aware anchor resolution *(~1–2 weeks)*

**Goal:** support anchors across page boundaries — "B is below A's
last fragment when A spans multiple pages."

**Design:**

- Anchor resolution moves from operating on `Schema[]` to operating on
  a flat list of `PlacedFragment`:
  ```ts
  type PlacedFragment = {
    schemaId: string
    fragmentIndex: number  // 0 if non-spanning
    pageIndex: number
    position: { x: number; y: number }
    width: number
    height: number
    anchors: Record<string, LayoutAnchorPoint>
  }
  ```
- `resolveAnchorY` looks up the LAST fragment of its target. If the
  target spans pages, B is placed below the last fragment, on whatever
  page that fragment ended up on. If B itself overflows the page, it
  page-splits via the same fragmentation mechanism the target used.
- New anchor mode: `belowFragment(targetSchemaId, fragmentIndex)` —
  for advanced cases like "anchor below the second row of the table."
  Optional; deferred until requested by a user.
- `LayoutFragment.anchors` becomes consumable: anchor refs may target
  named points within a fragment, e.g.
  `{ schemaId: 'invoiceTable', anchorName: 'totalRowBaseline' }`.

**Migration:**

- Existing templates use schema-level anchor refs; these resolve to
  the LAST fragment. Backward compatible.
- The Designer's drag-along behaviour continues to work at the schema
  level; users don't need to think about fragments unless they
  explicitly opt in.

**Risk:** medium-high. The fragmentation model is invasive; cross-page
anchor relationships need careful test coverage; existing tests must
continue to pass byte-for-byte. RFC may need a follow-up RFC on the
PlacedFragment shape before implementation.

### Phase 4 — Final architecture *(~1 week of cleanup after Phase 3)*

**Goal:** clear separation of concerns; both systems coexist without
overlap.

**Final shape:**

- **Anchored schemas** → positions come exclusively from the anchor
  graph (re-resolved with actual heights, page-aware). The engine
  treats them as already-placed; it only handles their per-page
  splitting if they overflow.
- **Absolute-positioned schemas** → positions come from the engine's
  baseY + same-Y-group-aware `totalYOffset` (Phase 1 fix). The anchor
  graph does not touch them.
- **Migration of existing templates** → none required. Anchored
  schemas continue to work; absolute schemas continue to work; mixed
  templates work because the two systems operate on disjoint subsets.

**Documentation:**

- New `docs/architecture/dynamic-layout.md` walks through the model
  with worked examples.
- README "Pillars" section already mentions anchor layouts; the model
  doc is the deep reference.
- Plugin author guide explains `measure()` and how `anchors` /
  `fragments` flow into runtime anchor resolution.

## Coexistence model — answer to "do we keep both?"

**Yes, keep both.** They are not competing — once Phase 4 lands, they
operate on disjoint sets of schemas:

| Schema type | Position from | Why |
|---|---|---|
| `layout: { mode: 'anchored', … }` | Anchor graph (re-resolved with actual heights, page-aware) | Explicit dependency expression; survives runtime expansion via re-resolution |
| `layout: { mode: 'absolute' }` *or no `layout` field* | Engine's grouped `totalYOffset` (Phase 1) | "Just place it here; if siblings expand, shift below them; same-row siblings stay put" |

This split:

- Honours the original anchor-system design intent (runtime weight on
  the graph).
- Preserves the upstream "auto-flow" semantics for users who don't
  want to think about anchors.
- Makes the same-Y bug irrelevant for anchored schemas (their
  positions are explicit) AND fixes it for absolute-positioned
  schemas (Phase 1).
- Removes the silent compensation that confused this RFC's authors —
  each system is the source of truth in its own domain.

## Migration path / risk profile

| Phase | Risk | Reversible? | User-visible change |
|---|---|---|---|
| 1 | Low | Yes (revert) | None — bug fix only |
| 2 | Medium | Yes (skip second pass) | None — same final positions, different mechanism |
| 3 | Medium-high | Hard (new fragment shape) | New capabilities (cross-page anchors) |
| 4 | Low | Cleanup | Documentation, clearer model |

Ship phases independently. After Phase 1 lands, Phase 2 can be a
separate PR. Phase 3 is the largest piece and should land behind a
feature flag (env var or template field) for at least one minor
release before becoming default.

## Test plan

### Phase 1
- 5 upstream tests for absolute-positioned same-Y siblings.
- 1 new `pageBreak + same-Y` test (covers our adaptation).
- 1 new test: two anchored siblings (`{ y: { mode: 'pageTop',
  offsetMm: 10 } }` each), one dynamic; both stay at `y=10` after
  expansion. (Without Phase 1, the second sibling is pushed down by
  the first's expansion via `processDynamicPage` even though they
  share a baseline.)
- Render-snapshot regression test on the existing template suite.

### Phase 2
- New test cases:
  - Anchored chain (A → B → C all `belowBottomEdge`); A grows; B and C
    end up at correct positions via re-resolution (assert via the new
    code path, not via `totalYOffset` computation).
  - Anchored sibling (B `pageTop` offset 10, A `pageTop` offset 10
    dynamic); A grows; B stays at `pageTop` offset 10. *Currently
    works via Phase 1; this test ensures it works via re-resolution
    too.*
  - Mixed: A absolute, B anchored to A; A grows; B re-resolves
    correctly using A's actual height.
- Snapshot equivalence: every existing template renders byte-equal
  pre-Phase-2 vs. post-Phase-2.

### Phase 3
- Cross-page anchor: A spans 3 pages, B `belowBottomEdge` of A. B
  lands on page 3 below A's last fragment.
- Cross-page anchor with B itself dynamic: B starts on page 3, splits
  to page 4.
- Fragment-level anchor: schema anchored to a named point in another
  schema's third fragment.
- Cycle detection across page boundaries.

### Phase 4
- No new behaviour; existing tests cover.
- New documentation should include runnable examples that double as
  smoke tests.

## Open questions

1. **Anchor target's "last fragment" semantics.** When B is below A and
   A spans pages, is B always on the same page as A's last fragment?
   What if B is itself static (declared height 10) and A's last
   fragment ended at page-bottom-minus-5? Proposed: B is placed on
   the same page if it fits; otherwise its own fragmentation kicks in
   per the existing engine logic.
2. **`pageBreak` primitive interaction.** Anchored schemas don't
   interact with `pageBreak` markers today (the engine's
   `commitGroup()` at the page break boundary will be added in Phase 1
   for the engine's internal grouping; the anchor system is unaffected).
   Confirm in Phase 2 that this is correct.
3. **Designer-time `LayoutMeasureResult` availability.** The Designer
   doesn't run `measure()` continuously; it uses declared heights. Is
   there a noticeable visual difference between Designer-rendered
   positions and PDF-rendered positions for anchored schemas? In some
   cases, yes (Designer shows the schema at declared-height position;
   PDF shows it at actual-height position). This is by design — the
   Designer is a "what the user authored" view, not a "what will
   render" view. Preview mode in the Designer should run measure() to
   show actual-height positions. *Out of scope for this RFC; tracked
   as a future Designer-side enhancement.*
4. **Performance.** Two-pass anchor resolution doubles the resolution
   cost. For most templates the resolver is microseconds; for very
   large templates (200+ schemas) profile and reconsider. *Defer until
   measured.*

## Decision needed

- Approve / revise / reject the four-phase plan.
- Sign off on the coexistence model (anchored ⇒ graph,
  absolute ⇒ engine).
- Confirm the order: Phase 1 first (stop-gap), then Phase 2, then
  Phase 3, then Phase 4. Each phase ships as its own PR.
