# Print Imposition

`@pdfweave/imposition` mounts logical PDF pages onto larger physical print
sheets. It is independent from the template generator, so its `source` can be
a PDF created by PDFweave or another system.

## Installation

Until the first npm publication, use the repository workspace. The root build
is required because imposition consumes declarations from upstream PDFweave
packages:

```bash
git clone https://github.com/IDNTEQ/pdfweave.git
cd pdfweave
npm install
npm run build
```

## Three-up A4 Example

Dimensions default to millimetres. The returned plan always uses PDF points.

```ts
import { impose } from '@pdfweave/imposition';

const { pdf, plan, warnings } = await impose({
  source: boletoPdf,
  sheet: {
    size: 'A4',
    margins: 6,
    gutter: { horizontal: 0, vertical: 3 },
  },
  layout: {
    type: 'n-up',
    rows: 3,
    columns: 1,
    scale: 'contain',
  },
});
```

Write `pdf` to disk or return it from an HTTP response. `plan.sheets` contains
every physical placement and empty slot; `warnings` reports source-box
fallbacks and annotations that cannot be carried into Form XObjects.

Source boxes with nonzero origins, page `/Rotate`, and `/UserUnit` values are
normalized into physical points in the plan and flattened into each placement.

## A3 and Custom Sheets

```ts
const a3 = await impose({
  source: statementsPdf,
  sheet: { size: 'A3', orientation: 'landscape', margins: 8, gutter: 4 },
  layout: { type: 'n-up', rows: 2, columns: 2, autoRotate: true },
});

const custom = await impose({
  source: labelsPdf,
  unit: 'mm',
  sheet: { size: { width: 330, height: 488 }, margins: 10, gutter: 3 },
  layout: { type: 'n-up', rows: 5, columns: 3 },
});
```

Named sizes include A2, A3, A4, A5, A6, Letter, and Legal. Use `unit: 'pt'`
when custom dimensions, margins, and gutters are already expressed in points.
Custom sheet dimensions must normalize to 0.01-14,400 PDF points.

## Pages, Copies, and Collation

`pages` contains zero-based source page indexes and may repeat indexes. With
two copies, collated order repeats the selected document; uncollated order
repeats each selected page before advancing.

```ts
import { planImposition } from '@pdfweave/imposition';

const plan = await planImposition({
  source,
  sheet: { size: 'A3' },
  layout: { type: 'n-up', rows: 2, columns: 2 },
  pages: [0, 2, 2, 5],
  sequence: { copies: 2, collation: 'uncollated' },
});
```

Use `limits.maxPlacements` and `limits.maxSheets` at service boundaries to
apply workload limits below the package hard caps.

These options limit planned placements and sheets only. They do not yet bound
source-file bytes or decoded content streams. Treat arbitrary PDFs as
untrusted input and run them in an isolated process with memory and time limits
until the parser/resource budgets in the production-print roadmap are complete.

## Test Artifacts

Run `npm run qualification` in the repository. It creates
`test-artifacts/qualification-report.html`, a self-contained dashboard with the
feature matrix, exact test definitions, clickable PDFs, rendered PNGs, and
placement manifests. Pull-request CI publishes it as the
`pdfweave-qualification-report` artifact. Individual files remain available
under `packages/imposition/test-artifacts/n-up/`.

## Current Boundary

Phase 1 supports deterministic simplex n-up imposition. It does not yet
implement duplex front/back pairing, booklet signatures, creep, crop or
registration marks, color bars, or press preflight. Those stages are tracked
in the production-print roadmap.
