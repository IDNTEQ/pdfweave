# Changelog

All notable changes to PDFweave will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). PDFweave
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While PDFweave is pre-1.0, breaking changes may land on minor releases
(`0.x.0`). We'll call them out clearly and provide migration notes.

---

## [Unreleased] — Independence sweep

### Changed (BREAKING)

- CSS class prefixes renamed from `pdfme-*` to `pdfweave-*`. Any
  downstream stylesheet targeting `.pdfme-designer-*`, `.pdfme-ui-*`,
  `.pdfme-moveable*`, or `.pdfme-selecto*` must be updated.
- DOM data attributes `data-pdfme-render-ready` and
  `data-pdfme-plugin-error` renamed to `data-pdfweave-render-ready`
  and `data-pdfweave-plugin-error`. E2E tests selecting on these
  attributes must be updated.

### Changed (non-breaking)

- New stored-template field `pdfweaveVersion`. The old `pdfmeVersion`
  field is still accepted on read for backward compatibility; new
  templates write only `pdfweaveVersion`.
- New public export `PDFWEAVE_VERSION`. The old `PDFME_VERSION` export
  is preserved as a deprecated alias and will be removed in a future
  major version.

### Documentation

- README and GOALS.md no longer defer to upstream pdfme; PDFweave is
  positioned as a standalone library. A dignified attribution footer
  remains for the MIT-licensed foundation pdfme provided.

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
