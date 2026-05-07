# PDFweave

> A PDF template engine with first-class data binding, anchor layouts,
> smart tables, and stationery PDFs. **Forked from
> [pdfme](https://github.com/pdfme/pdfme) by [hand-dot](https://github.com/hand-dot)
> and the pdfme contributors — released under the MIT license.**

PDFweave keeps everything that makes pdfme productive — the JSON template
format, the React Designer, the plugin architecture — and adds the layer
that production document workflows actually need:

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

If you want a JSON template + Node generator + React designer that
"just works", **upstream pdfme is probably what you want.** PDFweave is
for teams whose templates need to bind to real data, reflow correctly
across pages, and ship branded stationery.

See [GOALS.md](GOALS.md) for the mission and quality bar, and
[ROADMAP.md](ROADMAP.md) for the live punch list.

---

## Quick start

```bash
pnpm add @pdfweave/generator @pdfweave/schemas
# or: npm install @pdfweave/generator @pdfweave/schemas
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

For data binding, anchor layouts, smart tables, and stationery PDFs —
see the docs at [pdfweave.dev](https://pdfweave.dev) (coming soon).

---

## Coming from pdfme?

See **[MIGRATION.md](./MIGRATION.md)** — for templates that don't use
the new features, switching is one find-and-replace and a `pnpm install`.

---

## What's the same as pdfme

| | pdfme | PDFweave |
| --- | :-: | :-: |
| JSON template format | ✅ | ✅ (superset) |
| Node generator | ✅ | ✅ |
| React Designer | ✅ | ✅ |
| Plugin architecture | ✅ | ✅ |
| Built-in schemas (text/image/table/barcodes/svg/lines/shapes) | ✅ | ✅ |
| Form / Viewer modes | ✅ | ✅ |
| MIT license | ✅ | ✅ |

## What PDFweave adds

| | pdfme | PDFweave |
| --- | :-: | :-: |
| Schema → data path bindings (`binding.path`, `binding.format`, `binding.columns`) | — | ✅ |
| Anchor-relative positioning (`SchemaLayoutRule`) | — | ✅ |
| Smart table reflow with header repeat | partial | ✅ |
| Designer binding panel (drag-from-data, JSON-path picker) | — | ✅ |
| `StationeryPdf` basePdf shape (single-page PDF stamped on every page) | — | ✅ |
| Plugin `measure` hook for layout-aware schemas | — | ✅ |

## What pdfme has that PDFweave is intentionally not chasing

- **pdfme Cloud** — pdfme has a hosted service. PDFweave is library-only.
- **Smaller bundle / fewer dependencies** — pdfme is leaner. PDFweave's
  binding + anchor system adds weight to `@pdfweave/common`.

If those things matter more to you than the PDFweave additions, **use
pdfme**. Both are good choices.

---

## Status

Pre-1.0. APIs may change between minor versions. Breaking changes are
documented in [CHANGELOG.md](./CHANGELOG.md). The four PDFweave additions
above are what we consider stable contracts; everything else inherits
upstream pdfme's stability profile.

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

We're committed to keeping PDFweave aligned with upstream pdfme where
possible, sending bug fixes upstream, and crediting pdfme for everything
that came from it.

---

## License

MIT — same as upstream pdfme. See [LICENSE.md](./LICENSE.md).
