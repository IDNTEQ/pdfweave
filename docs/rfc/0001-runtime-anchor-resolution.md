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

**Implementation — single-pass topological resolution.** The current
`resolveAnchoredSchemas` is fixed-point iteration: re-walk all schemas
until no positions change (worst case O(N²) for deep chains; cycle
detection is "we tried N passes, give up"). We replace it with a
topological-order single pass: O(N + E) total, with E ≤ 2N because
each anchored schema has at most one X-target and one Y-target.

The existing `detectAnchorCycle` in `anchorGeometry.ts:276` already
uses DFS, which is the same algorithm topo-sort uses (with one tweak:
emit nodes in reverse-finish order). Extend it to return the topo
order as a byproduct; cycle detection comes for free with a useful
error message (`A → B → C → A`).

**Important: measurement and resolution must be interleaved.** Earlier
versions of this RFC proposed measuring all schemas up-front in
parallel batches, then doing a single resolution pass. That plan was
wrong: the built-in text plugin's `measure()` reads
`schema.position.y` (via `getRemainingPageHeight`) to decide whether
content fits or must split. If measurement runs with declared
(stale) positions, then anchor resolution moves the schema lower,
`placeRowsOnPages` later misjudges fit and may push an unsplittable
block to the next page instead of splitting line-by-line. So
measurement happens AFTER resolution, per schema.

Similarly, anchor resolution must use the target's *actual* height,
not its declared height — even for absolute-positioned targets.
Today's engine measures every schema regardless of layout mode, so
an absolute target can still expand dynamically; downstream anchors
must use that actual height.

The full Phase 2 sequence:

1. Build the anchor dep graph from `pageSchemas`: for each anchored
   schema, edges from the schemas it references on either axis.
2. Topo-sort + cycle check (single DFS, O(N + E)). Errors carry the
   cycle path: `Circular anchor: A → B → C → A`.
3. **Walk topo order. Per-schema work depends on the layout mode.**

   **For ANCHORED schemas** (interleaved resolve / measure / place):
   1. **Resolve position.** Targets are earlier in topo order and
      already fully placed. Read `target.actualHeight` (post-measure)
      regardless of target's layout mode. Apply `resolveAnchorX` /
      `resolveAnchorY`.
   2. **Measure.** Call the plugin's `measure()` with the
      now-correct position. Returns `LayoutMeasureResult` with
      width / height / fragments. Stash the measured total on the
      schema (`schema.actualHeight`).
   3. **Page-split + place.** Run `placeRowsOnPages` with the schema's
      resolved position and measured fragments. This emits per-page
      fragments and the placement record (which page the last
      fragment lands on, its Y, its height). Record on the schema
      (`schema.placement = { lastPageIndex, lastFragmentY,
      lastFragmentHeight, … }`) for downstream anchors to look up.
   4. Mark `items[i].placement = 'anchored'` so the post-walk engine
      pass skips it.

   **For ABSOLUTE schemas** (measure only — placement deferred):
   1. Skip resolve (position is template-declared, already correct).
   2. **Measure.** Same as anchored case — call `measure()` and
      stash `schema.actualHeight`. This is essential: a downstream
      anchored schema may target this absolute and read its actual
      height to compute its own position.
   3. Skip place. Mark `items[i].placement = 'absolute'`.

4. **Engine pass for absolute items only.** After the topo walk,
   run `processDynamicPage` over the items where
   `placement === 'absolute'`. The engine applies its grouped-offset
   propagation (Phase 1 fix) to place these items across pages with
   per-group same-Y handling. Anchored items are skipped in this
   pass — they were already placed in step 3.

5. **Two placement modes co-exist on the same page.** Anchored items
   from step 3 and absolute items from step 4 share page slots.
   Anchored items have positions from the graph; absolute items
   from the engine. Conflicts (e.g. an anchored item overlapping an
   absolute item that didn't move) are the user's contract:
   absolute means absolute, even if a dynamic anchored neighbour
   grew into its space.
6. **Page-spanning detection** for the Phase 2 caveat below: derive
   from actual placement (does the last fragment land on a page
   different from the first?), not from `fragments.length`. Tables
   and multi-line text legitimately produce many fragments that all
   fit on one page.

**Performance.** Sequential per-schema work is the cost of doing
this correctly. For chains (worst case), measurement serialises
because each schema's measurement depends on the previous schema's
final placement. For independent schemas (no anchor edges between
them), wave-parallel execution is allowed: schemas at the same topo
level can resolve / measure / place concurrently. Implementation
should preserve the existing parallel-batch optimisation for
independent waves; chains pay sequential cost.

For typical templates (N ≈ 50, mostly chains of 2-3 deep): ~50
sequential resolutions × ~5ms measure ≈ 250 ms per page. Acceptable.
For large templates (N = 500+, deep chains): may need profiling.

**Caveat for Phase 2 (lifted in Phase 3):** if an anchored schema's
target page-spans, the re-resolved position only knows the target's
total height, not which page the target's bottom edge lands on.
Page-spanning is detected from actual placement (the placement record
written during step 3 for anchored items shows the target's last
fragment ending on a page index > the first fragment's), not from
fragment count — tables and multi-line text legitimately produce many
fragments that all fit on one page. For targets that page-span, fall
through to the existing engine `totalYOffset` path; Phase 3 makes the
resolver page-aware so this caveat goes away.

#### Page-splitting under the new model

Topological resolution and page-splitting compose cleanly. Walking
through every case I could think of:

| Case | Outcome | Why |
|---|---|---|
| **B `belowBottomEdge` of A; A fits on one page; B fits on the same page** | B placed at `A.bottom + offset` on A's page | Standard. Same as today. |
| **B `belowBottomEdge` of A; A fits on one page; B overflows** | B starts at `A.bottom + offset`, splits across pages via `placeRowsOnPages` | Page-splitting is per-schema fragmentation; whether a schema starts via anchor or absolute Y doesn't change how it splits. |
| **B `belowBottomEdge` of A; A spans 3 pages** | A is fully placed first (topo order) → `A.lastFragment.bottom` is on page 3. B starts there. *(Phase 3 only — Phase 2 falls back to engine for this.)* | Topo order guarantees A is placed by the time we resolve B. The "last fragment's bottom edge" is what `belowBottomEdge` refers to. |
| **Two side-by-side anchored siblings, both dynamic, different expansions** | Each placed independently at its own `pageTop` offset; expansions don't interfere | No anchor edge between them → no dependency → topo sort puts them in any order, neither sees the other's expansion. This is the case the same-Y bug breaks today; under the new model the bug is structurally impossible. |
| **B has X-anchor to A and Y-anchor to D (different targets)** | Both A and D placed before B; B reads `A.position.x` and `D.position.y` independently | Topo deps: B depends on both A and D. Both axes resolve from already-placed schemas. |
| **B's resolved Y leaves no room on the current page (e.g. y=98 on a 100mm-content page; B is 50mm tall)** | `placeRowsOnPages` orphan-protects: B page-breaks, starts at y=0 of the next page | Existing engine logic, unchanged. |
| **A absolute at (10, 50), B anchored `belowBottomEdge` of A; A is a dynamic-text schema** | B placed at `A.position.y + A.actualHeight + offset` (e.g. 50 + 30 + 5 = 85 if A measured to 30mm) | Anchor resolution always reads the target's actual measured height regardless of the target's layout mode. `mode: 'absolute'` fixes the schema's POSITION; its content can still grow dynamically and produce a larger rendered height. Every schema goes through `measure()` and gets a real `actualHeight`. |
| **C absolute at (10, 60); B (anchored, dynamic) lands on top of C** | B and C overlap visually | User explicitly chose `mode: 'absolute'` for C; absolute means absolute. Same-Y group fix from Phase 1 is for absolute schemas pushed by other absolutes — anchored schemas overlapping with absolutes is the user's contract. |
| **Anchor target is on page 1; B's resolved Y sends it to page 3** | B placed on page 3; intervening pages may be empty if no other schemas land there | Output has empty pages where nothing places. `removeTrailingEmptyPages` (line 498) handles trailing emptiness; mid-document empty pages are by design (the user explicitly anchored to a target whose bottom is many pages away). |
| **Anchored schema overflows, splitting itself across pages, then a downstream dep** | Schema splits via `placeRowsOnPages` → `lastFragment.bottom` recorded → next dep resolves against last fragment | Each schema records its placement (final page + final-fragment bottom edge) at the end of its `placeRowsOnPages` call. Anchor resolver consumes that record. |

**The key invariant**: in topo order, every schema is fully placed
(including page-splitting) before any of its dependents resolve.
Page-splitting becomes a per-schema concern that doesn't affect anchor
resolution correctness. The placement record (last fragment's page
index, X, Y, width, height) is what dependent anchors look up.

**What can still go wrong** (surfaced explicitly so we don't claim
"works without issues" prematurely):

- **A schema with a horizontal anchor whose target is on a different
  page than where the schema lands.** X is independent of page; this
  is fine — the X coordinate is just an X coordinate.
- **A schema anchored to a target that ends up off the rendered area
  entirely** (target overflowed past the last allowed page). Today
  the engine throws on overflow; we should document this and let it
  throw with a clear message (`Anchor target X never placed; check
  page count or schema heights`).
- **Performance of repeated lookups across many pages**: for a deep
  chain of anchored schemas where each spans pages, we do O(N)
  placements + O(N) anchor resolutions. No quadratic explosion.
- **Test coverage**: every row in the table above gets a unit or
  snapshot test in Phase 3.

**API:**

- No public API change. The `Plugin.measure` hook is unchanged.
- `LayoutMeasureResult.height` is now consumed by the anchor pass (was
  consumed only via fragments by the engine).

**Outcome:** anchored schemas have positions derived from actual
heights. The engine's offset becomes redundant for them but still
runs for absolute-positioned schemas. No behaviour change for users
who already had working templates — the final pixel positions match.

**Risk:** medium. Single-pass topological resolution (per the §2-§3
algorithm above) means correctness depends on the topological ordering
being valid; cycle detection throws. Snapshot tests will catch any
positional drift introduced by the algorithm change.

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
4. **Performance.** Single-pass topological resolution is O(N + E)
   with E ≤ 2N — strictly better than the previous fixed-point
   iteration (O(N²) worst case for chains). Per-schema measure() now
   serialises within chains (was batch-parallel). For chains of
   2-3 deep typical templates, sub-millisecond per page; for very
   deep chains (50+ schemas in a single chain), profile and consider
   wave-parallel execution within the topo levels. *Defer until
   measured.*

## Decision needed

- Approve / revise / reject the four-phase plan.
- Sign off on the coexistence model (anchored ⇒ graph,
  absolute ⇒ engine).
- Confirm the order: Phase 1 first (stop-gap), then Phase 2, then
  Phase 3, then Phase 4. Each phase ships as its own PR.
