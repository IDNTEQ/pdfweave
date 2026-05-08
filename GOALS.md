# PDFweave Goals

> PDFweave is developed with significant AI assistance, and held to a
> quality bar most hand-written codebases do not enforce: type-aware
> static analysis, cognitive-complexity caps, coverage thresholds,
> dependency scanning, reproducible builds, all checked into the
> repository and ratcheted upward over time. The cost of writing code
> has fallen; the cost of verifying it has not. That gap is where
> serious software now has to live.
>
> Proving clanker-code can be good code.

## Mission

Be the best open-source PDF data-binding solution on the internet — the
default choice when a JSON template needs to bind to real data, reflow
correctly across pages, and ship branded stationery.

## Pillars

1. **Data binding** — schemas reference paths into input JSON; format hints
   (currency, number, date) live alongside; templates carry no copy-pasted
   data.
2. **Anchor layouts** — relative positioning (`alignRightEdge`,
   `belowBottomEdge`, `afterRightEdge`, `pageLeft`, `pageTop`, …) that
   survives sibling height changes and content reflow.
3. **Smart tables** — header repetition across pages, per-row binding to
   data, column-level format and binding, dynamic row heights.
4. **Stationery PDFs** — a single-page PDF as `basePdf` is stamped onto
   every reflowed page; one re-usable artwork file for header / footer /
   page numbers / watermarks.

## Quality bar

- **Static analysis** — Google-grade ESLint flat config (strict-type-checked
  + sonarjs + import boundaries + security + jsdoc on public APIs);
  oxlint as the fast local gate.
- **Tests** — ≥ 80 % line coverage per package, ≥ 70 % branch coverage.
- **CRAP** — every hot-path function below CRAP score 30
  (`complexity × (1 − coverage)² + complexity`).
- **Security** — zero high or critical CVEs in production dependencies;
  CodeQL clean; SBOM published; releases signed.
- **Code style** — self-documenting code; comments only where the *why*
  is non-obvious; public API surfaces fully JSDoc'd.
- **CI** — every PR ships test report, coverage report, CRAP report, bundle
  size, security SARIF as artifacts and PR comments.

## Near-term roadmap

See [ROADMAP.md](ROADMAP.md) for the live punch list. Headline items:

- Backport selected upstream PRs (#1290, #1250, #1159, #1055).
- Inherit upstream merged work where useful (e.g. #1467 dynamic text
  height).
- Land the quality-bar tooling (Phases 1–3 of the tooling roadmap).
- Walk the codebase package-by-package flipping lint warnings to errors.

## Non-goals

- Drop-in compatibility with the pdfme template format beyond the shared
  core. Where the binding / anchor / table feature set requires a richer
  schema, PDFweave diverges.
- Mirroring upstream pdfme. PDFweave is a hard fork; we make our own
  decisions about feature scope and quality bar, and we do not defer
  to upstream on either.
- Supporting an arbitrarily wide browser matrix. We prioritise current
  evergreen browsers and Node ≥ 22.

## How decisions get made

- Anything affecting the public API surface (`@pdfweave/*` exports) gets a
  proposal in `docs/rfc/` first.
- Anything affecting render output gets a render-snapshot diff and a
  written justification.
- Anything affecting the quality bar (coverage thresholds, CRAP cap, lint
  rule severity) is loosened only with a written rationale committed
  alongside the change.

## Acknowledgement

PDFweave was forked from
[pdfme](https://github.com/pdfme/pdfme), released under the MIT
licence. The core template format, the Designer architecture, and the
plugin model came from pdfme; the PDFweave maintainers extended them
to support data binding, anchor layouts, smart tables, and stationery
PDFs, and own the quality bar of the fork. We are grateful for the
foundation pdfme provided.
