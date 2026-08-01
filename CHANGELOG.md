# Changelog

All notable changes to PDFweave will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). PDFweave
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While PDFweave is pre-1.0, breaking changes may land on minor releases
(`0.x.0`). We'll call them out clearly and provide migration notes.

---

## [Unreleased]

_No unreleased changes yet._

---

## [0.4.0] — 2026-08-01

### Added

- **`@pdfweave/imposition` Phase 1.** New `planImposition()` and `impose()`
  APIs provide deterministic simplex n-up packing on A2, A3, A4, A5, A6,
  Letter, Legal, or custom sheets. The package supports page selection,
  copies, collated/uncollated sequencing, source-page boxes, uniform scaling,
  alignment, auto-rotation, slot clipping, explicit limits, and inspectable
  plans/warnings. Visual integration tests publish A4 boleto-style and
  landscape A3 client-statement PDFs, PNGs, and JSON manifests. Duplex,
  booklet signatures, press marks, and creep remain planned.
- **Production-shaped render qualification.** Multi-page invoice and bank
  extract fixtures exercise bound tables, repeated headings, subtotal/tax/
  grand-total rows, running balances, visual snapshots, PDFs, PNGs, and JSON
  manifests. A 100-client batch test verifies bounded serialized image/font
  resources, and CI publishes the render artifacts.
- **Self-contained qualification dashboard.** `npm run qualification` now
  produces one offline HTML page mapping supported production features to
  exact executable test definitions, clickable PDFs, raster previews,
  manifests, and SHA-256 values. CI publishes the page as a single artifact.

### Fixed

- Preserve interior and trailing declared blank template pages through dynamic
  layout and final PDF generation.
- Reserve repeated table-heading height during pagination while retaining the
  pagination-aware public `getDynamicHeightsForTable()` contract.
- Render every split schema fragment on a page, normalize ragged/non-string
  table cells, and keep terminal total rows in their original source ranges.
- Correct nonzero custom-PDF MediaBox embedding and date-only binding values.
- Configure pdf.js standard-font data for complete, warning-free Node raster
  artifacts.
- Preserve source-page transparency groups during embedding, reuse one Form
  XObject resource name per unique imposed page and sheet, and intersect
  effective Crop, Trim, Bleed, and Art boxes with MediaBox geometry.
- Keep repeated table headings clear of static footer bounds when the legacy
  table-height callback is composed with the shared layout engine.
- Make qualification runs execute every suite and always emit a diagnostic
  dashboard, including when an earlier suite fails; harden its inline report
  data and catalog paths against markup or path injection.
- Include the MIT license text in every published workspace tarball.
- Refresh DOMPurify, Vite/Vite Plus, React Router, PostCSS, and Docusaurus
  security patch levels; add website Dependabot coverage and time-bounded audit
  decisions for findings without a compatible upstream fix.

---

## [0.3.0] — 2026-05-20

Independence sweep + anchor-resolution rewrite. The biggest behavioural
shift is the new runtime anchor resolution system (RFC-0001), which
unifies how anchored layouts and dynamic content coexist. There are two
small BREAKING changes in the UI layer (CSS class prefix + DOM data
attribute rename); other API surfaces are backward-compatible.

### Changed (BREAKING)

- **CSS class prefixes** renamed from `pdfme-*` to `pdfweave-*`. Any
  downstream stylesheet targeting `.pdfme-designer-*`, `.pdfme-ui-*`,
  `.pdfme-moveable*`, or `.pdfme-selecto*` must be updated.
- **DOM data attributes** `data-pdfme-render-ready` and
  `data-pdfme-plugin-error` renamed to `data-pdfweave-render-ready` and
  `data-pdfweave-plugin-error`. E2E tests selecting on these
  attributes must be updated.

### Added

- **Runtime anchor resolution (RFC-0001).** Anchored layouts are now
  resolved at render time via a topologically-sorted single-pass walk,
  coexisting cleanly with the dynamic-layout engine. Phases 1–4 of the
  RFC landed: same-Y group fix backported from pdfme#1489, public
  `topoSortByAnchorDeps`, runtime re-resolution via topo walk,
  cross-page anchor support, and the delete-engine flow + migration
  script that retires the legacy resolver.
- **`pdfweaveVersion` stored-template field.** Old `pdfmeVersion`
  field is still accepted on read for backward compatibility; new
  templates write only `pdfweaveVersion`.
- **`PDFWEAVE_VERSION` public export.** The old `PDFME_VERSION` export
  is preserved as a deprecated alias and will be removed in a future
  major version.

### Changed (non-breaking)

- `repairAnchorsAfterRemove` and related helpers moved to
  `anchorGeometry` for a cleaner module boundary.
- Quality-push Phase 4 lint configuration fixes — false-positive
  patterns silenced so real findings surface.

### Fixed

- Playground build restored after the `@pdfme/*` → `@pdfweave/*`
  package-name rename swept stale imports.

### Documentation

- README and GOALS.md no longer defer to upstream pdfme; PDFweave is
  positioned as a standalone library. A dignified attribution footer
  remains for the MIT-licensed foundation pdfme provided.
- RFC-0001 published and amended to single-system layout (Option C).

### CI / Release

- Release workflow's `RELEASE_PACKAGES` list now includes `manipulator`
  and `converter`, so all eight workspaces publish together on a
  `v*.*.*` tag push. (Previously they were silently skipped — that's
  why `@pdfweave/manipulator` and `@pdfweave/converter` remained on
  `0.1.0` after the 0.2.0 release. They jump straight to 0.3.0 here.)

---

## [0.2.0] — 2026-05-05

Substantive bug-fix + feature release covering 30+ upstream pdfme
issues plus PDFweave-specific additions. All eight packages move to
0.2.0 in lockstep. No breaking API changes vs 0.1.0 — purely additive.

### Added

- **`pageBreak` schema** — explicit page-break marker that forces
  subsequent dynamic schemas to a new page (pdfme#637 / common).
- **Hyperlink schema** — clickable link annotations in generated PDFs;
  Designer + propPanel + UI render (pdfme#319).
- **Designer context menu** — right-click on a schema for copy / cut /
  paste / duplicate / delete / bring-to-front / send-to-back
  (pdfme#28).
- **Designer schema grouping** — multi-select + Group / Ungroup;
  moves a group as a unit. `group?: string` field on schema (pdfme#26).
- **Text padding + border props** — `padding: [t,r,b,l]` and
  `border: { width?, color?, radius? }` on text schemas (pdfme#851).
- **`textTransform`** — `uppercase` / `lowercase` / `capitalize` on
  text schemas (pdfme#707).
- **Image `objectFit` + `imagePosition`** — CSS-like fit semantics
  (`fill` / `contain` / `cover` / `none`) for images whose intrinsic
  ratio differs from the schema's (pdfme#696).
- **`borderDashArray`** on line / rect / ellipse — dashed strokes
  (pdfme#530).
- **Generator `preprocessing` + `postprocessing` hooks** — sync-or-
  async callbacks for input transform + bytes transform (pdfme#391).
- **Public `getDynamicHeights(value, args, plugin)`** API in
  @pdfweave/common — surfaces the existing plugin-driven measure
  dispatch for direct use (pdfme#1418).
- **`Designer.updateTemplate(template, { page? })`** — preserves
  current page index by default; opt-in page jump (pdfme#1235).
- **CLI rebrand** — banner / cache dir / examples URL all use
  `pdfweave` (with one-time migration from `~/.pdfme/fonts`).
- **GitHub Actions release workflow** with OIDC trusted publishing.
  All 8 packages publish on `v*.*.*` tag push, with provenance
  attestation, no token required.

### Fixed

- **AES-256 PDF decryption** in Node — switched the `_decrypt` path
  to native `crypto.createDecipheriv` to avoid silent corruption
  (pdfme#1348).
- **Designer crash on malformed `{{1}` placeholder** — placeholder
  parser now falls through to literal display on parse error
  (pdfme#1309).
- **Multi-variable text crash in readOnly** — `replacePlaceholders`
  no longer evaluates MVT `content` JSON (pdfme#1345).
- **Runtime error when schema y < paddingTop** — clear validation
  error replaces the previous uncaught throw (pdfme#1346).
- **Template type infers as `unknown`** — zod schema rewritten with
  `z.custom<T>()` (pdfme#1021).
- **`cloneDeep` Illegal invocation** under farmfe — wrapped to
  preserve `globalThis` binding (pdfme#1120).
- **`getFontKitFont` rejects `blob:http` URLs** — added explicit
  blob branch (pdfme#1234).
- **Roman line-break rules** — start/end-of-line forbidden chars for
  Latin scripts, mirroring the existing Japanese rules (pdfme#1115).
- **MVT in `staticSchema` "Text block not found"** — designer-only
  lookup gated by mode (pdfme#1296).
- **MVT i18n** — typing-instruction strings now translatable
  (pdfme#1099).
- **bwip-js node-resolve failure** in bundlers like Directus —
  switched to `bwip-js/generic` (pdfme#418).
- **CMYK color input** parsed (RGB output remains a limitation,
  documented; pdfme#460).
- **bwip-js fails in Web Worker** — env-detected loader (pdfme#702).
- **Table readOnly with variable data** — pipeline JSON-parses
  through the placeholder layer (pdfme#1299).
- **Image EXIF parser** shipped (geometric application deferred;
  pdfme#1183 partial).
- **Rotated thick-bordered shapes** — rotation-around-center math
  matches SVG (pdfme#382).
- **Table row height + padding** — text-fit calculation now subtracts
  cell padding (pdfme#1422).
- **SVG plugin font passthrough** — non-Latin chars no longer crash
  WinAnsi encoder (pdfme#1433).
- **`.d.ts` barrel ESM extensions** — post-processor adds `.js`
  suffixes for `nodenext` consumer compat (pdfme#1435).
- **Designer keyboard shortcuts** — physical-key-invariant undo/redo
  (works on German keyboard layouts; pdfme#1465).
- **`staticSchema` overlap with reflowed table** — layout pass now
  accounts for staticSchema's vertical extent (pdfme#1434).
- **Viewer auto-page-switch at high zoom** — 25% buffer prevents
  flipping at exact page boundary (pdfme#1240).
- **Rotated drag bounds** — Canvas now allows the un-rotated top-left
  to go negative when the rotated bbox still fits on canvas, AND
  the persistence-time clamp respects this too (pdfme#284).
- **CropBox respected when positioning content** — schemas place
  relative to CropBox, not MediaBox; output PDF preserves both
  (pdfme#623).

### Changed

- **`@pdfweave/pdf-lib`** — Vite target bumped to ES2022 to support
  top-level `await` for the Node-only crypto path.
- **`@pdfweave/schemas`** bwip-js now lazy-loaded — main entry chunk
  is smaller for consumers that don't render barcodes (pdfme#161).

### Migration from 0.1.0

No breaking changes. `pnpm install` (or `npm install`) of
`@pdfweave/<package>@^0.2.0` is the only step. New features (hyperlink
schema, page-break, text padding/border, etc.) are opt-in.

### Acknowledgements

Continued thanks to upstream pdfme + everyone who reported issues we
fixed. See PR history in the IDNTEQ/pdfweave repo for per-fix
attribution.

---

## [0.1.0] — 2026-05-05

First public release of PDFweave. Forked from
[pdfme](https://github.com/pdfme/pdfme) at upstream commit `772fa20`.

### Added

- **Data binding system** — schemas can reference a path into their
  input JSON via `binding.path` instead of carrying a copy of the data.
  Format hints (`currency`, `number`, `date`, `boolean`) and column
  bindings (`binding.columns`) live alongside.
- **Anchor layouts** — schemas can be positioned relative to other
  schemas via `layout.horizontal` / `layout.vertical`. Five rules
  total: `pageLeft`, `afterRightEdge`, `alignRightEdge` for horizontal,
  `pageTop`, `belowBottomEdge` for vertical. Anchored schemas
  automatically follow when their target reflows.
- **Smart tables** — `repeatHead` now reliably repeats the header row
  across overflow pages. Column-level `binding` lets each column
  reference a different data path with its own format.
- **Stationery PDFs** — new `BasePdf` shape `{ stationeryPdf, width,
  height, padding, staticSchema? }`. The first page of `stationeryPdf`
  is stamped onto every output page, including pages added by table
  reflow. Composes with `staticSchema` for dynamic decorations like
  page numbers.
- **Plugin `measure` hook** — plugins can declare a layout-aware
  measurement function; the layout engine uses it during reflow.
- **Designer additions**:
  - `BindingWidget` in the right sidebar — JSON-path picker for the
    selected schema's `binding`.
  - `AnchorLayoutWidget` in the right sidebar — UI for picking
    horizontal/vertical anchor rules.
  - `TemplateDataPanel` in the left sidebar — drag-and-drop data
    fields from `options.designData` onto the canvas.

### Changed

- Package names: `@pdfme/<name>` → `@pdfweave/<name>` for all eight
  packages.
- TypeScript target bumped to `ES2022` to use `Object.hasOwn`.
- `@pdfweave/common` is ~30 KB larger gzipped than `@pdfme/common`
  due to the binding + anchor types and helpers.

### Migration from pdfme

See [MIGRATION.md](./MIGRATION.md). For templates that don't use the
new features, migration is a package-name find-and-replace.

### Acknowledgements

Everything that's good about PDFweave starts from
[pdfme](https://github.com/pdfme/pdfme). Thanks to
[hand-dot](https://github.com/hand-dot) and the pdfme contributors.
