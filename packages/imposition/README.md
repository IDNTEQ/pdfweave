# @pdfweave/imposition

Deterministic n-up physical-sheet planning and PDF rendering for PDFweave.

```ts
import { impose } from '@pdfweave/imposition';

const { pdf, plan, warnings } = await impose({
  source: invoicePdf,
  sheet: { size: 'A4', margins: 8, gutter: 4 },
  layout: { type: 'n-up', rows: 2, columns: 2, autoRotate: true },
});
```

All dimensions supplied by callers default to millimetres. Named sheet sizes
are physical ISO/US sizes, while every coordinate in the returned plan is in
PDF points. Use `unit: 'pt'` for custom sizes, margins, and gutters already
expressed in points.

The initial API supports simplex n-up placement, explicit page selection,
copies, collated or uncollated sequencing, page-box selection, clipping,
alignment, and `contain`, `cover`, or unscaled rendering. The result exposes
the complete placement plan and warnings for page-box fallbacks or omitted
annotations.

`limits.maxPlacements` and `limits.maxSheets` bound planned output work. They
do not currently cap serialized source bytes or decoded PDF streams. Until the
bounded decoder/worker milestone lands, process untrusted PDFs in an isolated
worker with external memory and time limits.

Source page boxes and `/UserUnit` are normalized into physical PDF points in
the plan. Custom sheet dimensions must normalize to 0.01-14,400 points.

From the repository root, run `npm run qualification` and open
`test-artifacts/qualification-report.html` to inspect every supported option
alongside its exact test definition, PDF, rendered previews, and manifest.

See [`docs/rfc/0002-imposition.md`](../../docs/rfc/0002-imposition.md) for the
geometry contract and planned duplex, marks, and booklet extensions.
