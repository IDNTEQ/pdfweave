# Draft: upstream pdfme issue — "PDFweave fork — announcement + which patches we'd like to upstream"

> **STATUS:** Draft for review. Do not file until reviewed.
> **TARGET:** [pdfme/pdfme](https://github.com/pdfme/pdfme)/issues
> **TYPE:** Discussion / heads-up — not a bug or feature request.
> **AUTHOR HANDLE:** Should be filed by an IDNTEQ employee or PDFweave
> maintainer, not by an automation account.

---

## Title

Heads-up: PDFweave (fork of pdfme) is now public — and a few patches we'd like to upstream

## Body

Hi @hand-dot and pdfme maintainers,

Quick courtesy note. We've been running a private fork of pdfme at IDNTEQ for production document workflows that needed first-class data binding, anchor-relative layouts, and reflowing tables with header repeat. The fork has now been published as **[PDFweave](https://github.com/IDNTEQ/pdfweave)** under MIT (same license as pdfme).

We want to be transparent about it and figure out the best path for the patches that aren't pdfweave-specific.

### What PDFweave adds (and what we're keeping fork-only)

- **Data binding** — schemas reference paths into input JSON (`binding.path`, `binding.format`, `binding.columns`). Designer has a binding panel.
- **Anchor layouts** — five-rule grammar (`alignRightEdge`, `belowBottomEdge`, etc.) for relative positioning. Designer has an anchor panel.
- **Smart tables** — column-level binding + reliable header repeat across overflow pages.
- **Stationery PDFs** — new `BasePdf` shape that stamps a single-page PDF onto every output page including reflow-added pages.

These four are reorienting changes — they make pdfme into a different product, and we don't think they belong upstream. We're maintaining them in the fork.

### What we'd like to upstream as separate PRs

These are additive, low-controversy, and useful regardless of whether you adopt the binding/anchor model:

1. **`StationeryPdf` basePdf shape** — pure addition to the `BasePdf` zod union. Single-page PDF stamped on every reflowed page. Solves the "I want a CustomPdf basePdf AND table reflow" problem (currently mutually exclusive). PR draft: would touch `packages/common/src/schema.ts`, `packages/common/src/helper.ts`, `packages/common/src/dynamicTemplate.ts`, `packages/schemas/src/tables/dynamicTemplate.ts`, `packages/generator/src/helper.ts`, `packages/generator/src/generate.ts`. Includes tests.

2. **Table `repeatHead` fix for non-blank basePdf** — small fix where `repeatHead` was gated on `isBlankPdf` even though the underlying mechanism doesn't require it. (Will be irrelevant if `StationeryPdf` lands first.)

3. **Plugin `measure` hook** — optional plugin export `measure(args): { width, height, fragments? }` so layout-aware schemas can participate in reflow without hard-coding their dimensions in the layout pass. We'd RFC this as an issue first before sending a PR.

We'd send these as three separate PRs with tests. Happy to write them whenever the maintainers have bandwidth to look — no pressure on timing.

### What we're NOT planning to upstream

- The binding system (`binding.path` etc.) — would require a model change in `Schema` and `inputs` semantics.
- Anchor layouts — same, requires `layout` as a typed first-class field on `Schema`.
- Smart-table column bindings — depends on the binding system.
- Designer panels for binding and anchors — depend on the above.

If any of these become interesting to upstream later, we'll happily send them as separate proposals.

### Asks

1. **Are the three additive PRs above welcome?** If so, we'll start with `StationeryPdf`.
2. **Anything we should flag in the README** about PDFweave, beyond the existing acknowledgement? We're crediting pdfme prominently in the PDFweave README and migration guide, and we want this to be a "good neighbor" relationship — not a competing thing.
3. **Are you OK with us linking to PDFweave** from issues/discussions where someone hits a wall that PDFweave has solved? We'd rather you tell people "use PDFweave for that" yourselves than have them stumble onto it; and we don't want to hijack pdfme threads with fork advocacy.

Thanks for the years of work on pdfme. PDFweave wouldn't exist without it.

— [your name], for IDNTEQ / PDFweave maintainers
