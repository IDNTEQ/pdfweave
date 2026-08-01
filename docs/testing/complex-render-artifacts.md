# Complex render test artifacts

The artifact suite includes production-shaped, multi-page render cases for:

- an invoice with bound line items, repeated table headings, and subtotal, tax, and total rows;
- a bank extract with bound transactions, repeated table headings, running balances, and a closing-balance row;
- seven boleto-style items packed three-up over three A4 sheets;
- five A5 client statements packed four-up over two landscape A3 sheets;
- one hundred client invoice statements in one PDF with one shared logo/font resource;
- every named paper preset and a custom millimeter sheet;
- contain, cover, none, alignment, upscale, clipping, and auto-rotation modes;
- media, crop, bleed, trim, and art source boxes with fallback warnings;
- intrinsic page rotation at 0, 90, 180, and 270 degrees;
- row-major, column-major, collated, and uncollated ordering.

The regular generator suite separately includes a 100-document batch test that verifies every client value and constant logo reaches the renderer while the shared image and font are embedded only once in the output PDF.

Build the complete qualification dashboard from the repository root:

```bash
npm run qualification
```

This command removes stale generated evidence, runs every artifact-producing
test, validates the committed feature catalog against the exact Vitest test
definitions, and writes one self-contained page to:

```text
test-artifacts/qualification-report.html
```

Open that HTML file directly in a browser. It contains the feature matrix,
expandable test source, embedded PDFs, every rendered PNG, manifests, and PDF
SHA-256 values. No development server or network access is required.

The latest successful `main` build is also deployed as a directly viewable
[qualification dashboard](https://idnteq.github.io/pdfweave/qualification/).
Pull-request artifacts remain the authoritative evidence for changes that have
not yet merged.

For a visual-development loop, `npm run test:render-artifacts` regenerates every
catalogued PDF and PNG. `npm run qualification:build` rebuilds the presentation
from whatever evidence and JUnit files are already present; without an
authoritative test-run outcome, the page reports the qualification as
incomplete. Always use `npm run qualification` when producing evidence for the
current revision.

Generated files are written to:

```text
packages/generator/test-artifacts/complex-documents/
packages/generator/test-artifacts/resource-reuse/
packages/imposition/test-artifacts/n-up/
```

Each generator scenario contains the generated PDF, one PNG per rendered page,
and a JSON manifest with the page count and table row ranges. Each imposition
scenario contains the imposed print PDF, one PNG per physical sheet, and a
JSON manifest containing the normalized sheet options and every placement and
empty slot. The PNGs are also compared with committed image snapshots, so
render changes fail the test unless the visual baseline is deliberately
updated.

Pull-request CI publishes the consolidated page as the
`pdfweave-qualification-report` artifact for 14 days and adds its download URL
to the workflow summary. GitHub delivers the artifact as a ZIP; extract it and
open `qualification-report.html`. When their producing tests run, the original
`complex-pdf-renders` and `imposition-renders` artifacts are also uploaded for
direct file access. Test setup failures after dependencies are installed can
leave those render artifacts absent while the diagnostic dashboard records the
incomplete run. When an image comparison fails, CI also publishes
`visual-diff-diagnostics` with the actual render and available diff output.
JUnit results are published as a
Checks report, while coverage artifacts remain separate.
