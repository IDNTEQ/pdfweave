# RFC 0001 — Runtime anchor resolution + single-system layout

- **Status:** Accepted; Phases 1, 2, 3a, 4 all delivered (2026-05-11)
- **Author:** PDFweave maintainers
- **Date:** 2026-05-08, amended 2026-05-09, 2026-05-10, and 2026-05-11
- **Implementation tracking:** Phase 1 PR #43, Phase 2 PR #46,
  Phase 3a PR #47, Phase 4 PR (forthcoming)
- **Amendment note (2026-05-09):** clarified that PDFweave moves to a
  single-system layout model. Earlier draft framed Phase 4 as "two
  systems coexist on disjoint subsets" and described
  `mode: 'absolute'` as falling through to the engine's
  `totalYOffset` flow. That contradicts the actual decision: there is
  no flow mode; `absolute` is truly fixed; the engine's flow logic
  is deleted in Phase 4 and replaced by a migration script.
- **Amendment note (2026-05-10):** Phase 3 split into 3a (cross-page
  base case, **delivered as a side-effect of the Phase 2 PR via the
  global-Y `syncLastFragmentGeometry` encoding**) and 3b (advanced
  capabilities `belowFragment` mode + named-point
  `LayoutFragment.anchors`, **deferred** until requested by a user
  and likely warranting their own RFC).
- **Amendment note (2026-05-11):** Phase 4 delivered as a single PR
  per project decision (vs the originally scoped two-PR
  migrate-then-delete sequence). `processDynamicPage`'s grouped
  `totalYOffset` flow propagation replaced with `placeAbsoluteItems`
  (a literal-coords loop); pageBreak primitive becomes a no-op in
  the layout engine (constant retained for the migration tool's
  skip logic). All 6 dynamic-content playground templates migrated
  in-place via `migrateTemplateToAnchored`; `npx pdfweave migrate`
  CLI ships for future external users.

## Summary

PDFweave's anchor system was designed to be the runtime source of truth
for relative positioning, but the runtime consumer of measured
dimensions was never wired. As a result, the anchor graph today is
resolved exactly once with **declared** heights, before dynamic-height
measurement, and the upstream-inherited dynamic-layout engine's
`totalYOffset` accumulator silently fills the gap.

**The decision (committed):** PDFweave moves to a *single-system*
layout model. Two layout modes only:

- `anchored` — position is computed from the anchor graph using
  *actual* measured dimensions; updates as referents grow.
- `absolute` — position is the literal coords in the template; the
  schema does not move under any circumstance, even if a neighbour
  grows into its space (overlap is the user's contract).

There is **no flow mode**. The upstream engine's `totalYOffset`
flow propagation is not preserved as a fallback — it is going away
in Phase 4. Templates that used to rely on implicit flow get
migrated by an automated chain-anchoring script (each non-anchored
schema becomes `belowBottomEdge` of its predecessor in document
order, replicating flow exactly while making the dependency
explicit).

This is a strategic call, not a code call. We can make it because
the fork has no users yet (per the project status as of 2026-05-08).

The four phases:

1. **Stop-gap fix** for an active correctness bug in the engine,
   so the engine remains usable during the migration.
2. **Wire runtime anchor re-resolution** with topological
   single-pass resolution and actual measured heights.
3. **Make anchor resolution page-aware** (cross-page anchors,
   fragment-internal anchor refs).
4. **Delete the engine's flow logic.** What remains of the engine
   becomes a thin per-schema page-fragmentation primitive
   (`placeRowsOnPages`); `processDynamicPage` and `totalYOffset`
   are removed. Migration script ships in this phase to convert
   any remaining absolute-positioned templates that depend on
   flow into chain-anchored form.

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

1. Fix the active same-Y correctness bug as a stop-gap so the engine
   is usable during the migration window (Phases 1-3).
2. Make the anchor system the **sole** runtime source of truth for
   any schema that needs to react to neighbour growth.
3. Define `absolute` as truly fixed: position is the literal coords
   in the template; no engine push-down, no implicit flow. Overlap
   with growing neighbours is the user's contract.
4. Replace the engine's flow propagation entirely. Old templates that
   relied on implicit flow are migrated to chain-anchored form by an
   automated script shipped in Phase 4.

## Non-goals

- Preserving the upstream `totalYOffset` flow as a long-term option.
  It exists today only as the Phase 1 stop-gap; Phase 4 deletes it.
- Breaking the public stored-template format. The migration script is
  a one-time, opt-in conversion that emits standard `belowBottomEdge`
  anchor rules — no new schema fields, no new field semantics.
- Supporting dynamic anchor *offsets* (offsets that depend on input
  data). The offset in an anchor rule remains static.
- Heuristic auto-anchoring of arbitrarily positioned schemas. The
  Phase 4 migration script targets one specific pattern only —
  document-order chains — because that is what `totalYOffset`
  effectively implemented.

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
the same baseY during the Phase 1-3 migration window. Both anchored
and absolute schemas go through `normalizePageSchemas` +
`processDynamicPage` today, so two anchored siblings (e.g. both
`{ y: { mode: 'pageTop', offsetMm: 10 } }`) are ordered by `orderMap`
and the later one is pushed down by the earlier sibling's expansion.
The grouped-offset fix corrects this for them too. Phase 1 tests
cover both flavours of same-Y siblings.

**Why bother fixing the engine if Phase 4 deletes it?** Until Phase 2
ships, the engine is the only runtime mechanism that can react to
measured heights at all. The same-Y bug is a real-user-visible
regression today and Phases 2-4 take weeks to ship. Phase 1 is a
~1-day fix that buys correctness for the migration window.

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
   4. Mark `items[i].placement = 'anchored'` so any pre-Phase-2
      back-stop code path knows the schema is already placed.

   **For ABSOLUTE schemas** (measure + place at literal coords):
   1. Skip resolve (position is template-declared, already correct).
   2. **Measure.** Same as anchored case — call `measure()` and
      stash `schema.actualHeight`. This is essential: a downstream
      anchored schema may target this absolute and read its actual
      height to compute its own position.
   3. **Place at literal coords.** Run `placeRowsOnPages` with the
      schema's template-declared position. The schema may overflow
      its declared rectangle and split across pages via the standard
      per-schema fragmentation primitive — but its starting Y is the
      literal `position.y` from the template, never offset by any
      neighbour's expansion. Mark `items[i].placement = 'absolute'`.

4. **No engine flow pass.** Both anchored and absolute items are
   fully placed by the topo walk. The engine's `totalYOffset`
   propagation is not invoked. (During Phases 1-3 the engine still
   runs as the back-stop for pre-Phase-2 code paths and for the
   Phase 2 page-spanning caveat below; it is deleted entirely in
   Phase 4.)

5. **Anchored and absolute items share page slots.** Anchored
   positions come from the graph; absolute positions are literal.
   Conflicts (an anchored item overlapping an absolute, or two
   absolutes overlapping because the user typed coords that
   collide) are the user's contract: `absolute` means absolute,
   even if a growing neighbour overlaps it.
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

Two costs to keep distinct: anchor *resolution* (graph walk) and
*measure()* (per-plugin, often expensive — text-shaping, font lookups,
bwip-js for barcodes, etc.).

- **Anchor resolution alone** is sub-millisecond per page even for
  N = 500+; the topo walk + per-schema math is O(N + E) and cheap.
- **Measure()** is the dominant cost. For typical templates
  (N ≈ 50, mostly chains of 2-3 deep): ~50 measure calls × ~5 ms
  each ≈ 250 ms per page when serialised by chain depth. Wave-parallel
  execution within topo levels recovers most of that for templates
  with mostly-independent schemas. For large templates (N = 500+,
  deep chains): profile before optimising.

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
| **C absolute at (10, 60); B (anchored, dynamic) lands on top of C** | B and C overlap visually | User explicitly chose `mode: 'absolute'` for C; absolute means absolute. Overlap is the user's contract — that is what `absolute` means under the single-system model. |
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

**Outcome:** the topo walk owns placement for both modes. Anchored
positions are derived from actual measured heights of upstream
nodes; absolute positions are literal. The engine's `totalYOffset`
flow is no longer invoked by the new code path (it remains physically
present in the codebase as a pre-Phase-2 fallback for templates that
hit the page-spanning caveat). For all existing single-page-target
templates, final pixel positions match pre-Phase-2 — verified by the
snapshot suite.

**Risk:** medium. Single-pass topological resolution (per the §2-§3
algorithm above) means correctness depends on the topological ordering
being valid; cycle detection throws. Snapshot tests will catch any
positional drift introduced by the algorithm change.

### Phase 3 — Page-aware anchor resolution *(landed in two parts)*

**Goal:** support anchors across page boundaries — "B is below A's
last fragment when A spans multiple pages."

**Phase 3a — cross-page anchor base case (DELIVERED in Phase 2 PR #46):**

The cross-page basic case for `belowBottomEdge` and `alignBottomEdge`
landed as a side-effect of the Phase 2 implementation. The mechanism
is `syncLastFragmentGeometry` in
`packages/common/src/dynamicTemplate.ts`: after each item is placed
(absolute via the engine in Pass 2, anchored via the topo walk in
Pass 3), its corresponding `pageSchemas` entry has its
`position.y` rewritten to the **global Y** of its last fragment
(`lastPageIndex × contentHeight + lastFragmentY`) and its `height`
set to the last fragment's height.

With this encoding, `target.position.y + target.height` evaluated by
`resolveAnchorY` gives the bottom edge in global-Y space, and
`placeRowsOnPages`'s `pageIndex = floor(globalY / contentHeight)`
derivation places the dependent on the correct page. This avoids the
heavier `PlacedFragment[]` restructuring originally proposed for
Phase 3 — the global-Y arithmetic does the same job for the common
cases.

**Phase 3b — extended capabilities (DEFERRED, opt-in):**

Two advanced features remain available for follow-up PRs when a user
requests them:

- **New anchor mode `belowFragment(targetSchemaId, fragmentIndex)`** —
  for cases like "anchor below the second row of the table" where the
  user wants to land below an interior fragment, not the last
  fragment.
- **`LayoutFragment.anchors` becomes consumable** — anchor refs may
  target named points within a fragment, e.g.
  `{ schemaId: 'invoiceTable', anchorName: 'totalRowBaseline' }`.
  Today the field exists in `types.ts` and is populated by overlay
  rendering, but anchor resolution doesn't read it.

If/when these ship, anchor resolution will need to grow a richer
target model than the global-Y trick — likely the
`PlacedFragment[]` shape sketched in the original draft. That work
should arrive with its own RFC since the lookup model and Designer
ergonomics need design discussion.

**Migration:**

- Existing templates use schema-level anchor refs; these resolve to
  the LAST fragment. Backward compatible.
- The Designer's drag-along behaviour continues to work at the schema
  level; users don't need to think about fragments unless they
  explicitly opt in.

**Test coverage (Phase 3a):**

- `dynamicTemplate.test.ts > Page-aware anchor resolution (Phase 3)`
  block covers anchored→anchored chains where two upstream items
  paginate, anchored→absolute chains where the engine pushes the
  absolute upstream across pages, and X-anchor cross-page cases
  where the X target is on a different page than the dependent.
- The Phase 2 paginated-target test in the runtime re-resolution
  block also exercises the simple case.

**Risk (Phase 3a, retrospective):** low. The global-Y encoding is
contained within `syncLastFragmentGeometry`; existing snapshot tests
remained byte-equal across the Phase 2 merge.

### Phase 4 — Delete the engine flow + ship migration tooling *(~1–2 weeks)*

**Goal:** PDFweave runs on a single layout system. The
upstream-inherited `processDynamicPage` flow propagation is removed.
The remaining engine code is a thin per-schema page-fragmentation
primitive (`placeRowsOnPages`) that any layout mode can call to
split its content across pages.

**Code deletions:**

- Delete `processDynamicPage` from
  `packages/common/src/dynamicTemplate.ts`. The grouped `totalYOffset`
  logic from Phase 1 — `cumMaxActualEnd`, `cumMaxOriginalEnd`,
  `commitGroup`, `overlapsCurrentGroup` — goes with it.
- Delete `normalizePageSchemas` and the `LayoutItem.baseY` snapshot
  flow. Schema positions are read directly from `position.y` (literal
  for `absolute`; computed by the topo walk for `anchored`).
- `getDynamicTemplate` becomes: build dep graph → topo-walk →
  per-schema resolve/measure/place. No second pass, no engine
  back-stop. The Phase 2 caveat (page-spanning targets fall back to
  the engine) is closed by Phase 3 before Phase 4 deletes the engine,
  so no fallback path remains.
- `placeRowsOnPages` stays. It is the per-schema fragmentation
  primitive — independent of layout mode and called from the topo
  walk.

**Migration script:** ships in `packages/converter` (or a new
`packages/migrate` if conversion warrants it) and runs offline against
stored template JSON.

- **Input:** a stored template (`Template` JSON).
- **Detection rule:** a schema is "flow-dependent" if and only if it
  has no `layout` field (or `layout.mode === undefined`) AND there
  exists at least one schema earlier in document order whose
  declared bottom edge (`y + height`) is at or above its `y` AND
  there is at least one dynamic-height schema in the document. (The
  user-visible behaviour `totalYOffset` produces is "dynamic schemas
  earlier in the document push later schemas down". Schemas that
  don't have an earlier-in-document-order schema, or that aren't
  affected by any dynamic predecessor, can stay absolute without
  changing their rendered position.)
- **Conversion:** for each flow-dependent schema, set
  `layout = { mode: 'anchored', y: { mode: 'belowBottomEdge',
  ref: '<previous-schema-id>', offsetMm: <gap> } }` where `<gap>` is
  `currentSchema.y − (previousSchema.y + previousSchema.height)`
  computed from declared coords. This reproduces the exact pre-Phase-4
  rendered output for any template the engine handles correctly today.
- **Non-flow-dependent schemas** (no dynamic predecessor that affects
  them) get `layout = { mode: 'absolute' }` written explicitly so the
  template's intent survives future migrations.
- **Cycle / multi-page-base templates:** the script refuses to
  convert and prints the affected schema ids. The user manually
  resolves before retrying.

**CLI:**
```
$ npx @pdfweave/migrate --in template.json --out template.v2.json
$ npx @pdfweave/migrate --in templates/ --out templates.v2/  # batch
$ npx @pdfweave/migrate --in template.json --check  # dry-run, exit 1 if changes needed
```

**Documentation:**

- New `docs/architecture/dynamic-layout.md` walks through the
  single-system model with worked examples.
- New `docs/migration/v2-layout.md` is the migration guide:
  what changed, when to run the script, how to interpret its
  warnings.
- README "Pillars" section already mentions anchor layouts; the
  architecture doc is the deep reference.
- Plugin author guide explains `measure()` and how `anchors` /
  `fragments` flow into runtime anchor resolution.

**Risk:** medium. Engine deletion is large but well-contained — the
topo walk in Phase 2 + page-aware resolution in Phase 3 must be
proven correct first (snapshot equivalence on every existing
template). Migration script risk is bounded: dry-run mode, no
in-place mutation, and the script either converts safely or refuses
to touch the file.

## Layout model — answer to "do we keep both?"

**No.** PDFweave runs on a single layout system once Phase 4 ships.
Two modes only, both handled by the same topological walk:

| Mode | Position from | Reacts to neighbour growth? | Use when |
|---|---|---|---|
| `anchored` | Anchor graph, re-resolved with actual measured heights, page-aware | Yes | The schema's intent is "place me relative to X" — including the simple chain case "place me below the previous schema" |
| `absolute` | Literal `position.x`, `position.y` from the template | No — overlap with growing neighbours is the user's contract | The schema must stay put regardless of what surrounds it (page numbers, watermarks, headers/footers at fixed positions) |

There is no flow mode. The upstream `totalYOffset` propagation is not
preserved as a fallback.

**What this gives us:**

- A single, predictable mental model. A schema either depends on
  neighbours (anchored) or doesn't (absolute). No third "mostly
  doesn't but might get pushed" mode.
- The anchor system carries its weight at runtime — the gap this RFC
  was written to close.
- The same-Y bug becomes structurally impossible for anchored schemas
  (explicit positions; no shared accumulator). For absolute schemas
  the bug doesn't apply because absolute doesn't push.
- One source of truth per schema; no silent compensation between
  layers.

**What this costs:**

- A migration step for templates that depended on implicit flow.
  Phase 4 ships an automated script that converts them to
  chain-anchored form, reproducing the same rendered output.
- We can make this call because the fork has no users yet (as of
  2026-05-08). We would not make this call once external users had
  templates in production.

## Migration path / risk profile

| Phase | Risk | Reversible? | User-visible change |
|---|---|---|---|
| 1 | Low | Yes (revert) | None — bug fix only |
| 2 | Medium | Yes (disable topo-walk; fall back to engine-only flow) | None — same final positions, different mechanism |
| 3a | Low (delivered in Phase 2) | n/a | Cross-page anchor refs work via global-Y encoding |
| 3b | Medium-high (deferred) | Hard (richer target model) | New capabilities (`belowFragment`, named-point anchors within fragments) |
| 4 | Medium | Hard once shipped (engine deletion) | Templates relying on implicit flow must run the migration script; the script reproduces the same rendered output |

Ship phases independently. After Phase 1 lands, Phase 2 can be a
separate PR. Phase 3 is the largest piece and should land behind a
feature flag (env var or template field) for at least one minor
release before becoming default. Phase 4 ships only after Phase 3 is
default and snapshot tests on the full template suite are byte-equal
across the engine-on / engine-off code paths.

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
- **Engine-deletion regression:** every existing template renders
  byte-equal pre-Phase-4 (topo walk + engine fallback) vs.
  post-Phase-4 (topo walk only). Snapshot suite gates the merge.
- **Migration script:**
  - Round-trip test: `original.json` → migrate → `migrated.json` →
    render. Pixel-equal to `original.json` rendered with the
    Phase-3 code (engine still in place).
  - Unit tests for the detection rule: purely-static layouts
    (no dynamic schemas anywhere) round-trip with all schemas
    marked `absolute`. Mixed dynamic+static layouts get the
    expected chain-anchor rules. Layouts with cycles refuse to
    convert with a clear error message.
  - `--check` dry-run mode exit codes (0 if no changes needed,
    1 if changes required).
- **New documentation runnable examples** double as smoke tests
  (each worked example in `dynamic-layout.md` is a code-fenced
  template that the doc-test runner generates and pixel-compares).

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
4. **Performance.** Single-pass topological *resolution* is
   O(N + E) with E ≤ 2N — strictly better than the previous
   fixed-point iteration (O(N²) worst case for chains). The
   resolution math itself is sub-millisecond per page even for large
   N. The actual wall-time cost is dominated by per-schema
   `measure()` calls, which now serialise within chains where they
   were previously batch-parallel; expect ~250 ms per page for
   typical N ≈ 50 templates with chains of 2-3 (see §Performance
   above for the breakdown). For very deep chains (50+ schemas in a
   single chain), profile and consider wave-parallel execution
   within topo levels. *Defer until measured.*

## Decision (recorded)

This RFC was accepted on 2026-05-08 and amended on 2026-05-09. The
recorded decisions:

- **Two layout modes only.** `anchored` (graph-driven, runtime
  re-resolved) and `absolute` (literal coords, never moves). No
  flow mode.
- **The engine's `totalYOffset` flow is deleted in Phase 4.** It is
  not preserved as a fallback or a back-stop. What remains of the
  engine is the per-schema `placeRowsOnPages` fragmentation
  primitive only.
- **A migration script ships with Phase 4** to convert any
  pre-Phase-4 template that depends on implicit flow into
  chain-anchored form. The script reproduces the same rendered
  output, so the migration is a code change, not a behavioural
  change.
- **Phase order:** 1 (same-Y stop-gap, ships immediately) → 2
  (topo-walk, single page) → 3 (page-aware) → 4 (engine deletion +
  migration). Each phase ships as its own PR. Phase 4 ships only
  after the full template suite is byte-equal across the
  engine-on / engine-off code paths.
