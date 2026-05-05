# Changelog

All notable changes to PDFweave will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). PDFweave
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While PDFweave is pre-1.0, breaking changes may land on minor releases
(`0.x.0`). We'll call them out clearly and provide migration notes.

---

## [0.1.0] — Unreleased

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
