# RFC 0002 - PDF imposition and physical sheet planning

- **Status:** Implemented; Phase 1 release pending
- **Author:** PDFweave maintainers
- **Date:** 2026-07-31
- **Roadmap:** [Production print platform roadmap](../roadmaps/production-print-platform.md)

## Summary

Add a dedicated `@pdfweave/imposition` package that converts a logical source
PDF into physical print sheets. Phase 1 implements deterministic n-up packing
with a dry-run placement plan. Later phases add production marks, duplex,
booklets/signatures, creep, and preflight without changing the Phase 1 API.

Imposition is deliberately separate from `@pdfweave/manipulator`:

- manipulator operations copy or reorder whole pages and return PDF bytes;
- imposition applies print-domain policy about sheet geometry, source boxes,
  scaling, clipping, copies, collation, marks, and front/back ordering;
- imposition needs its own qualification fixtures, artifacts, coverage, and
  release cadence as that policy grows.

## Goals

1. Pack logical PDF pages onto A-series or custom physical sheets.
2. Make every placement inspectable before or after PDF rendering.
3. Preserve physical geometry with explicit units and source-page boxes.
4. Reuse each embedded source page for all repeated placements.
5. Support predictable copy collation without mutating caller input.
6. Provide an additive API boundary for future imposition modes.
7. Work in Node and current evergreen browsers.

## Non-goals for Phase 1

- Booklet/signature ordering, duplex/tumble, creep, or shingling.
- Cut-and-stack ordering.
- Crop, registration, color, fold, or custom production marks.
- PDF/X conversion, ICC color management, or independent preflight.
- Preserving interactive annotations or AcroForm widgets.
- Cross-document content deduplication.
- Inferring a printer or finishing device's undocumented behavior.

## Public API

```ts
import { impose, planImposition } from '@pdfweave/imposition';

const options = {
  unit: 'mm',
  sheet: {
    size: 'A4',
    orientation: 'portrait',
    margins: { top: 8, right: 8, bottom: 8, left: 8 },
    gutter: { horizontal: 4, vertical: 4 },
  },
  layout: {
    type: 'n-up',
    rows: 4,
    columns: 2,
    fill: 'row-major',
    scale: 'contain',
    allowUpscale: false,
    autoRotate: false,
    align: { horizontal: 'center', vertical: 'middle' },
  },
  sourceBox: 'trim',
  sequence: { copies: 1, collation: 'collated' },
};

const props = { source: sourcePdf, ...options };
const plan = await planImposition(props);
const result = await impose(props);

await writeFile('sheets.pdf', result.pdf);
console.log(result.plan.sheetCount, result.warnings);
```

The initial contract is:

```ts
type PdfInput = ArrayBuffer | Uint8Array;
type Unit = 'mm' | 'pt';
type PaperSize = 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'Letter' | 'Legal';
type SourceBox = 'media' | 'crop' | 'trim' | 'bleed' | 'art';

type ImposeProps = {
  source: PdfInput;
  unit?: Unit;
  sheet: {
    size: PaperSize | { width: number; height: number };
    orientation?: 'portrait' | 'landscape';
    margins?: number | { top: number; right: number; bottom: number; left: number };
    gutter?: number | { horizontal: number; vertical: number };
  };
  layout: {
    type: 'n-up';
    rows: number;
    columns: number;
    fill?: 'row-major' | 'column-major';
    scale?: 'contain' | 'cover' | 'none';
    allowUpscale?: boolean;
    autoRotate?: boolean;
    align?: {
      horizontal?: 'left' | 'center' | 'right';
      vertical?: 'bottom' | 'middle' | 'top';
    };
  };
  sourceBox?: SourceBox;
  pages?: number[];
  sequence?: { copies?: number; collation?: 'collated' | 'uncollated' };
  limits?: { maxPlacements?: number; maxSheets?: number };
};

type ImpositionResult = {
  pdf: Uint8Array;
  plan: ImpositionPlan;
  warnings: ImpositionWarning[];
};
```

`pages` is zero-based and may contain duplicates intentionally. Default page
selection is every source page in document order. Defaults are millimetres,
portrait orientation, zero margins/gutters, row-major fill, contain scaling,
no upscaling, no auto-rotation, centered alignment, trim source box, and one
collated copy.

The single props object matches `generate()` and leaves room for multi-source
jobs without adding positional arguments.

`layout` is discriminated by `type`. A later booklet API is added as another
union member such as `{ type: 'booklet', signatureSize: 16, ... }`; it does not
reinterpret n-up options.

## Placement plan

`planImposition()` parses and validates the source but does not embed or save
output. The returned plan uses PDF points regardless of the input option unit:

```ts
type ImpositionPlacement = {
  sequenceIndex: number;
  sourcePageIndex: number;
  copyIndex: number;
  sheetIndex: number;
  slotIndex: number;
  row: number;
  column: number;
  source: { x: number; y: number; width: number; height: number };
  cell: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
  scale: number;
  sourceUserUnit: number;
  intrinsicRotation: 0 | 90 | 180 | 270;
  rotation: 0 | 90 | 180 | 270;
};
```

The complete plan also includes physical sheet dimensions, capacity, sheet
count, normalized options, placements, and explicit empty slots. This is the
machine-readable audit record used by previews, print jobs, and tests.

## Geometry

User-facing rows fill from the physical sheet's top edge, even though PDF
coordinates originate at the bottom-left. For row `r` and column `c`:

```text
cellWidth =
  (sheetWidth - leftMargin - rightMargin - (columns - 1) * horizontalGutter)
  / columns

cellHeight =
  (sheetHeight - topMargin - bottomMargin - (rows - 1) * verticalGutter)
  / rows

cellX = leftMargin + c * (cellWidth + horizontalGutter)
cellY = sheetHeight - topMargin - (r + 1) * cellHeight - r * verticalGutter
```

Row-major advances columns before rows. Column-major advances rows before
columns. Partial final sheets retain explicit empty slots and never create
phantom placements.

Scaling is uniform:

- `contain`: largest scale that keeps all source content inside the cell;
- `cover`: smallest scale that fills the cell, clipped at the cell boundary;
- `none`: scale 1 in PDF points, aligned and clipped at the cell boundary.

`allowUpscale: false` caps calculated contain/cover scale at 1. Alignment is
applied after scale and rotation. Auto-rotation compares the valid 0- and
90-degree layouts and rotates only when it produces a strictly larger usable
scale; ties remain unrotated for deterministic output.

Source `/Rotate` is part of the effective page orientation and must be
flattened into the placement transform because a Form XObject does not inherit
the source page dictionary's rotation.

Source page boxes are expressed in default user-space units. `/UserUnit` is
validated and multiplied into the plan's `source` rectangle, so all exposed
geometry remains physical PDF points. Rendering embeds the raw page box and
applies `/UserUnit` in the placement transform; this avoids changing the Form
XObject's coordinate system or silently shrinking large-format source pages.

## Page boxes and clipping

The selected source box is passed explicitly to `embedPages()` as
`{ left, bottom, right, top }`. This is required for nonzero MediaBox origins
and avoids the pdf-lib default bounding-box assumption that the origin is 0,0.

PDF box fallback follows PDF semantics:

- media: MediaBox;
- crop: CropBox, falling back to MediaBox;
- trim/bleed/art: selected box, falling back to CropBox and then MediaBox.

Every slot creates a clipping path matching its cell before drawing. This is
required for `cover` and `none` and is applied consistently to prevent content
from entering gutters or adjacent slots.

Pages without a content stream remain valid logical blank placements. The
implementation normalizes an empty content stream before embedding rather
than dropping the page or failing the entire job.

## Copies and collation

Copy expansion occurs before slot assignment:

- collated, two copies of pages 1,2,3: `1,2,3,1,2,3`;
- uncollated, two copies of pages 1,2,3: `1,1,2,2,3,3`.

`copyIndex` remains in every placement. Caller-provided `pages` and option
arrays are cloned and never sorted or mutated.

## Resource policy

The source PDF is loaded once and the output PDF is created once. The
implementation collects unique selected source pages and makes one
`output.embedPages()` call with their explicit boxes. Every placement reuses
the corresponding `PDFEmbeddedPage` reference.

This preserves resource sharing while copying the source document graph and
avoids one Form XObject per repeated copy. Resources shared between source
pages are copied by one `PDFObjectCopier`. Phase 1 does not attempt semantic
deduplication between different source documents or unrelated resource
objects.

The package has a 7 KB gzip size gate. The initial provisional 6 KB budget was
raised after `/UserUnit`, cross-realm input, numeric-boundary, and stable-error
hardening brought the measured bundle to 6.32 KB gzip; the additional code is
part of the public print-safety contract.

## Interactive content and warnings

Page embedding captures appearance content, not page annotations or AcroForm
widget behavior. Phase 1 emits a structured `annotations-omitted` warning for
affected source pages. It does not silently claim to preserve interactivity.

Future flattening support will be an explicit preprocessing option with its
own visual and structural tests.

## Validation and errors

Runtime validation rejects:

- corrupt or empty source PDFs;
- unknown option values;
- non-finite or non-positive sheet dimensions;
- zero, fractional, or unsafe row/column counts;
- negative margins or gutters;
- custom sheet dimensions outside 0.01-14,400 PDF points after normalization;
- margins/gutters that leave no positive cell area;
- empty page selections or indexes outside the source document;
- zero, fractional, or unsafe copy counts;
- invalid `/UserUnit` values or non-finite placement geometry.

Errors use the prefix `[@pdfweave/imposition]` and name the invalid path. Zod
validation issues are normalized into stable public messages rather than
leaking internal stack traces.

## Qualification evidence

### Planner unit tests

- exact A4 2x2 geometry with asymmetric margins and gutters;
- A3 landscape and custom-point dimensions;
- row-major and column-major ordering;
- partial final sheets and blank slots;
- contain, cover, none, allow-upscale, alignment, and auto-rotation math;
- collated and uncollated copy sequences;
- mixed source dimensions and every supported source box;
- invalid numbers, page indexes, and impossible printable areas;
- caller input immutability and plan determinism.

### PDF integration tests

- output sheet dimensions and counts;
- color-coded source pages with large IDs and orientation markers;
- nonzero MediaBox and explicit CropBox/TrimBox origins;
- source `/UserUnit` and `/Rotate` flattening, including a nonzero box origin;
- blank logical pages;
- cover/no-scale clipping at gutters;
- one source load and one embed-pages operation;
- byte-identical repeated output;
- visual order through raster snapshots.

### Inspectable artifacts

- seven boleto-style items packed three-up onto three A4 sheets, including a
  partial final sheet;
- five A5 client statements with line-item tables and totals packed four-up
  onto two landscape A3 sheets.

Each scenario writes the imposed PDF, one PNG per sheet, and the normalized
placement plan before image-snapshot assertions. Pull-request CI uploads these
files even when a later assertion fails.

Phase 1 currently has 45 package tests and 94.31% line, 87.89% branch, 100%
function, and 93.92% statement coverage. A larger 100-page imposition stress
fixture and independent text-order extraction remain hardening work; the
generator separately verifies a 100-record invoice batch with shared image and
font resources embedded once and bounded serialized resource counts.

## Evolution

1. Phase 1: n-up, copies/collation, source boxes, clipping, manifests.
2. Phase 2: production marks, page boxes, bleed, safe-area validation.
3. Phase 3: cut-and-stack, duplex, booklet/signatures, blank insertion, creep.
4. Phase 4: preflight, output presets, PDF/X and color-management adapters.
