# PDFweave

> A PDF template engine with first-class data binding, anchor layouts,
> smart tables, and stationery PDFs. Built for production document
> workflows that need real data binding and reflow that survives the
> way your data actually changes.

PDFweave is a JSON-template-driven PDF engine: a Node generator, a
React Designer, and a plugin architecture for custom schemas. On top
of that core, PDFweave adds the layer that production document
workflows actually need:

- **Data binding** — Schemas reference paths into your input JSON instead of
  carrying their own copy of the data. Format hints (currency / number /
  date) live alongside.
- **Anchor layouts** — Position any schema relative to another by named
  anchor (`alignRightEdge`, `belowBottomEdge`, …) instead of absolute
  coordinates that break the moment a sibling changes height.
- **Smart tables** — Tables reflow across pages with header repetition,
  per-row binding to data, and column-level format/binding.
- **Stationery PDFs** — Use a single-page PDF as the basePdf, and PDFweave
  stamps it onto every reflowed page (header, footer, page numbers all in
  one re-usable artwork file).
- **N-up imposition** — Pack smaller logical pages onto A2-A6, Letter, Legal,
  or custom physical sheets with deterministic geometry, clipping, page
  selection, copies, and collated or uncollated sequencing.

PDFweave is built for teams whose templates need to bind to real data,
reflow correctly across pages, and ship branded stationery.

See [GOALS.md](GOALS.md) for the mission and quality bar, and
[ROADMAP.md](ROADMAP.md) for the live punch list.

---

## Quick start

```bash
npm install @pdfweave/generator @pdfweave/schemas
```

```ts
import { generate } from '@pdfweave/generator';
import { text, image, table, barcodes } from '@pdfweave/schemas';

const template = {
  basePdf: { width: 210, height: 297, padding: [20, 20, 20, 20] },
  schemas: [[
    { name: 'name', type: 'text', position: { x: 20, y: 20 }, width: 80, height: 10 },
  ]],
};

const pdf = await generate({
  template,
  inputs: [{ name: 'Hello PDFweave' }],
  plugins: { text, image, qrcode: barcodes.qrcode, table },
});
```

To mount generated invoices, statements, labels, or boleto-style items onto
physical print sheets:

```bash
npm install @pdfweave/imposition
```

```ts
import { impose } from '@pdfweave/imposition';

const { pdf: printPdf, plan, warnings } = await impose({
  source: pdf,
  sheet: { size: 'A4', margins: 6, gutter: 3 },
  layout: { type: 'n-up', rows: 3, columns: 1 },
});
```

See the [imposition package guide](./packages/imposition/README.md) for page
selection, scaling, alignment, copies, and collation.

To inspect supported production features alongside their exact tests and
rendered PDF evidence, run `npm run qualification` and open
`test-artifacts/qualification-report.html`.

For pull requests, open the [Testing workflow](https://github.com/IDNTEQ/pdfweave/actions/workflows/test.yml),
select the run, and download `pdfweave-qualification-report` from its Summary
page. The artifact is retained for 14 days; extract it and open
`qualification-report.html`.

The latest successful `main` build is published as a directly viewable
[qualification dashboard](https://idnteq.github.io/pdfweave/qualification/).

For data binding, anchor layouts, smart tables, and stationery PDFs —
see the docs at [pdfweave.dev](https://pdfweave.dev) (coming soon).

---

## Coming from pdfme?

See **[MIGRATION.md](./MIGRATION.md)** — for templates that don't use
the new features, switching is one find-and-replace and an `npm install`.

---

## Feature surface

| | PDFweave |
| --- | :-: |
| JSON template format | ✅ |
| Node generator | ✅ |
| React Designer | ✅ |
| Plugin architecture | ✅ |
| Built-in schemas (text/image/table/barcodes/svg/lines/shapes) | ✅ |
| Form / Viewer modes | ✅ |
| Schema → data path bindings (`binding.path`, `binding.format`, `binding.columns`) | ✅ |
| Anchor-relative positioning (`SchemaLayoutRule`) | ✅ |
| Smart table reflow with header repeat | ✅ |
| Designer binding panel (drag-from-data, JSON-path picker) | ✅ |
| `StationeryPdf` basePdf shape (single-page PDF stamped on every page) | ✅ |
| Simplex n-up imposition on A2-A6, Letter, Legal, and custom sheets | ✅ |
| Page selection, copies, and collated/uncollated imposition | ✅ |
| Duplex, booklet signatures, crop/registration marks, and creep | Planned |
| Plugin `measure` hook for layout-aware schemas | ✅ |
| MIT license | ✅ |

---

## Status

Pre-1.0. APIs may change between minor versions. Breaking changes are
documented in [CHANGELOG.md](./CHANGELOG.md). Data binding, anchor
layouts, smart tables, and stationery PDFs are the headline stable
contracts. The imposition package currently implements Phase 1 simplex n-up;
duplex, booklet signatures, press marks, creep, and color preflight remain on
the [production-print roadmap](./docs/roadmaps/production-print-platform.md).

---

## Quality

[![Tests](https://github.com/IDNTEQ/pdfweave/actions/workflows/test.yml/badge.svg)](https://github.com/IDNTEQ/pdfweave/actions/workflows/test.yml)
[![CodeQL](https://github.com/IDNTEQ/pdfweave/actions/workflows/codeql.yml/badge.svg)](https://github.com/IDNTEQ/pdfweave/actions/workflows/codeql.yml)
[![OSV-Scanner](https://github.com/IDNTEQ/pdfweave/actions/workflows/osv-scanner.yml/badge.svg)](https://github.com/IDNTEQ/pdfweave/actions/workflows/osv-scanner.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Quality bar](https://img.shields.io/badge/quality_bar-GOALS.md-blue)](GOALS.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

---

## Maintainership

PDFweave is maintained by [IDNTEQ](https://github.com/IDNTEQ) and
contributors. Issues, PRs, and discussions welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Acknowledgement

PDFweave was forked from [pdfme](https://github.com/pdfme/pdfme),
released under the MIT licence. The core template format, the
Designer architecture, and the plugin model came from pdfme; the
PDFweave maintainers extended them to support data binding, anchor
layouts, smart tables, and stationery PDFs, and own the quality bar
of the fork. We are grateful for the foundation pdfme provided.

---

## License

MIT licence. See [LICENSE.md](./LICENSE.md). PDFweave is a fork of
pdfme (also MIT-licensed); pdfme's copyright notices are preserved in
LICENSE.md.
