# Complex render test artifacts

The artifact suite includes production-shaped, multi-page render cases for:

- an invoice with fixed percentage columns, a multi-line wrapped description, automatic row-height growth, repeated table headings, and subtotal, tax, and total rows;
- a bank extract with bound transactions, repeated table headings, running balances, and a closing-balance row;
- seven distinct structured boleto test records rendered as a logical 200 x 95
  mm page book, with visible synthetic barcodes, linhas digitáveis, and Pix QR
  Codes decoded from 300 DPI rasters while the non-payable watermark remains;
- a boleto printed over dark patterned PDF stationery with a nonzero MediaBox
  and asymmetric CropBox, proving position translation, opaque backing, page-box
  preservation, unchanged surrounding artwork, and decodable test payment
  identifiers;
- seven boleto pages with visible synthetic ITF and Pix QR symbols packed
  without scaling two-up over four A4 sheets and four-up over two landscape A3
  sheets;
- five A5 client statements packed four-up over two landscape A3 sheets;
- one hundred client invoice statements in one PDF with one shared logo/font resource;
- every named paper preset and a custom millimeter sheet;
- contain, cover, none, alignment, upscale, clipping, and auto-rotation modes;
- media, crop, bleed, trim, and art source boxes with fallback warnings;
- intrinsic page rotation at 0, 90, 180, and 270 degrees;
- row-major, column-major, collated, and uncollated ordering.

The generator qualification suite also includes two 100-document batch tests.
The statement case verifies every client value and constant logo reaches the
renderer while its shared image and font are embedded once. The boleto case
validates 100 distinct barcode inputs, renders the explicitly enabled test
identifiers and Pix QR Codes while omitting their values from the manifest,
embeds one constant institution logo once, and enforces a PDF size bound. Both
full 100-page PDFs have their own manifest and representative raster previews
in the dashboard.

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
packages/generator/test-artifacts/boleto-book/
packages/generator/test-artifacts/resource-reuse/
packages/imposition/test-artifacts/n-up/
```

Generator visual scenarios contain the generated PDF, per-page PNGs, and a
JSON manifest with page count, control data, and output digests. Large-batch
scenarios may instead publish the representative pages declared in their
manifest; the full PDF remains directly inspectable. Each imposition scenario
contains the imposed print PDF, one PNG per physical sheet, and a JSON manifest
containing the normalized sheet options and every placement and empty slot.
The PNGs are also compared with committed image snapshots, so render changes
fail the test unless the visual baseline is deliberately updated.

The boleto artifacts are standards-aligned synthetic qualification specimens.
They explicitly opt into test payment-identifier rendering, carry a prominent
non-payable sample watermark, and are not bank-issued, certified, homologated,
or suitable for payment. The seven-page book uses dynamic Pix BR Codes with a
reserved `.test` location. Its 44-digit barcodes and Pix payloads are recovered
from 300 DPI raster output and compared with the in-memory fixtures; manifests
intentionally omit those values. A separate 170 x 95 mm specimen exposes the
minimum-width normal-text line transform and its 300 DPI printed-height bounds.
The dashboard links these scans with
structured-data, check-digit, structural Pix EMV/CRC, measured four-module QR
quiet-zone, three-lane instruction boundary, component layout, fail-closed
preflight, and exact-size imposition tests in one place.
These executable checks and image snapshots are regression evidence, not
independent scanner acceptance, hard-copy qualification, bank homologation, or
certification.

Pull-request CI publishes the consolidated page as the
`pdfweave-qualification-report` artifact for 14 days and adds its download URL
to the workflow summary. GitHub delivers the artifact as a ZIP; extract it and
open `qualification-report.html`. When their producing tests run, the original
`complex-pdf-renders` and `imposition-renders` artifacts are also uploaded for
direct file access. Test setup failures after dependencies are installed can
leave those render artifacts absent while the diagnostic dashboard records the
incomplete run. When an image comparison fails, CI also publishes
`visual-diff-diagnostics` with the actual render and available diff output.
JUnit results from the boleto schema, generator, and imposition qualification
suites are published as a Checks report, while coverage artifacts remain
separate.
