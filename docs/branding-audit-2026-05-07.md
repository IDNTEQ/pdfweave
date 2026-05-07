# Branding audit — 2026-05-07

GitHub issue: [#29 — P3: Branding sweep — residual @pdfme strings to @pdfweave](https://github.com/IDNTEQ/pdfweave/issues/29)

## Methodology

Source-only scan (excludes `node_modules`, `dist`, `coverage`, `.git`,
lock files, generated coverage HTML). Documentation files
(`website/`, `docs/upstream/`, top-level `*.md`) are intentionally
excluded — those reference upstream pdfme heritage and are uniformly
Bucket A (attribution / migration guides). Playground deep imports
(`@pdfme/common` etc.) are out of scope: the playground has not been
migrated to the renamed packages and that is tracked separately
(it does not run as part of `npm run test` / `npm run build`).

Three buckets:

- **A — keep as `pdfme`** (compat / attribution / public surface)
- **B — rename to `pdfweave`** (brand-bound)
- **C — ambiguous** (none in this sweep)

## Bucket B — renamed

| File:line | String | Reason | Action |
|-----------|--------|--------|--------|
| `packages/generator/src/constants.ts:1` | `TOOL_NAME = 'pdfme (https://pdfme.com/)'` | Default PDF metadata stamp (Author / Creator / Producer). User-visible in generated PDFs. Codex-flagged. | Rename to `'pdfweave (https://pdfweave.dev/)'` |
| `packages/schemas/src/date/helper.ts:143` | `'pdfme-air-datepicker-styles'` | Internal `<style>` element id. Not in any stored format, not documented as a public selector. | Rename to `'pdfweave-air-datepicker-styles'` |
| `packages/schemas/src/barcodes/propPanel.ts:24` | QR code default content `'https://pdfme.com/'` | New-QR-code default content shown in user-created templates. | Rename to `'https://pdfweave.dev/'` |

Counts: **3 strings renamed**.

## Bucket A — kept (annotated where canonical)

### Public CSS class prefixes (user CSS targets these)

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/ui/src/constants.ts:19` | `DESIGNER_CLASSNAME = 'pdfme-designer-'` | Public CSS class prefix; user stylesheets target `.pdfme-designer-*`. Renaming silently breaks downstream theming. |
| `packages/ui/src/constants.ts:21` | `UI_CLASSNAME = 'pdfme-ui-'` | Public CSS class prefix. Same rationale. |
| `packages/ui/src/components/Designer/Canvas/Moveable.tsx:31` | `'pdfme-moveable'` | Moveable component class prefix. Same rationale. |
| `packages/ui/src/components/Designer/Canvas/Selecto.tsx:16` | `'pdfme-selecto'` | Selecto component class. Same rationale. |
| `packages/ui/src/components/Designer/Canvas/AnchorOverlay.tsx:303` | `'pdfme-designer-anchor-overlay'` | Follows the `DESIGNER_CLASSNAME` prefix convention. |
| `packages/ui/__tests__/components/__snapshots__/Designer.test.tsx.snap` | `pdfme-designer-*`, `pdfme-ui-*`, `pdfme-moveable*`, `pdfme-selecto` (16) | Snapshot of the rendered DOM; kept consistent with the kept public class names. |
| `packages/ui/__tests__/components/__snapshots__/Preview.test.tsx.snap` | `pdfme-designer-*`, `pdfme-ui-*` (12) | Same. |

### Public DOM data attributes (external test selectors)

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/ui/src/components/Renderer.tsx:280,288,370,379` | `data-pdfme-render-ready`, `data-pdfme-plugin-error` | Documented selector pattern for E2E tests waiting on render-readiness; renaming would silently break consumer test suites. Task brief explicitly forbids touching this file unless audit requires it. |
| `packages/ui/__tests__/assets/normalizeSnapshot.ts:15`, `Renderer.test.tsx`, `Renderer.safeStringify.test.tsx`, `Preview.test.tsx` | Same data attributes | Same. |

### Stored template format / public exported API

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/common/src/schema.ts:237` | `pdfmeVersion: z.string().optional()` | Zod schema field shipped in stored templates. Renaming would reject all existing templates on load. |
| `packages/common/src/version.ts:1` | `export const PDFME_VERSION` | Public exported constant. Renaming breaks every consumer importing it. |
| `packages/common/set-version.js:14-26` | `PDFME_VERSION` literal | Build script that writes to the public exported constant; mirrors `version.ts` name. |
| `packages/ui/src/Designer.tsx:8,117,124` | `PDFME_VERSION`, `template.pdfmeVersion = ...` | Writes the stored template field; public-API import. |
| `packages/cli/src/diagnostics.ts:11` | `'pdfmeVersion'` in `KNOWN_TEMPLATE_KEYS` | Validation against the stored template field. |

### Legacy migration paths

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/cli/src/fonts.ts:9` | `LEGACY_CACHE_DIR = ~/.pdfme/fonts` | Source path of the legacy → new font-cache migration. Renaming makes the migration silently miss real users' caches. |
| `packages/cli/src/fonts.ts:65,69` | Migration log strings (`'PDFweave: migrating font cache from ~/.pdfme/fonts'`) | Already PDFweave-branded; the residual `~/.pdfme/fonts` is the literal legacy path. |
| `packages/cli/__tests__/doctor.test.ts:56,58,70` | Test of the legacy migration | Asserts the user-visible migration messaging. |

### Upstream attribution / forked-from text

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/cli/src/index.ts:15` | `'(forked from pdfme)'` description | Required attribution. |
| `packages/*/package.json` author field | `'PDFweave contributors (forked from pdfme by hand-dot)'` | Already PDFweave-branded with attribution. |
| `packages/cli/src/example-templates.ts:153`, `__tests__/examples*.ts` | Default `'pdfme'` author for upstream-provided example templates | Falls back to the upstream manifest's author when an example entry omits it; matches what upstream ships. |

### Upstream issue / PR / docs references in JSDoc and comments

These are attribution + traceability — every `pdfme/pdfme#NNN`,
`https://github.com/pdfme/pdfme/issues/NNN`, and `https://pdfme.com/docs/...`
reference is Bucket A. Renaming would either break the link or
fabricate one. The pdfweave.dev docs site is not yet authoritative;
the website still ships with `url: 'https://pdfme.com'` in
`website/docusaurus.config.js`.

| File | Count | Examples |
|------|-------|----------|
| `packages/common/src/expression.ts` | 4 | `pdfme/pdfme#1309`, `pdfme/pdfme#1345` |
| `packages/common/src/dynamicTemplate.ts` | 6 | `pdfme/pdfme#637`, `#1418`, `#1434`, `#1346` |
| `packages/common/src/helper.ts` | 4 | `pdfme/pdfme#1120`, `https://pdfme.com/docs/custom-fonts*` (×3) |
| `packages/common/src/schema.ts:204` | 1 | `pdfme/pdfme#1021` |
| `packages/generator/src/generate.ts` | 4 | `pdfme/pdfme#391` (×2), `pdfme#729`, `pdfme/pdfme#623` |
| `packages/generator/src/helper.ts` | 6 | `pdfme#729` (×3), `pdfme/pdfme#623` (×2), `https://pdfme.com/docs/custom-schemas` |
| `packages/converter/src/index.browser.ts:4` | 1 | `pdfme/pdfme#1290` |
| `packages/pdf-lib/src/core/crypto.ts` | 2 | `https://github.com/pdfme/pdfme/issues/1348` |
| `packages/schemas/src/barcodes/helper.ts` | 4 | `pdfme/pdfme#418`, `#702`, `#460` (×2) |
| `packages/schemas/src/graphics/svg.ts:111` | 1 | `https://github.com/pdfme/pdfme/issues/1433` |
| `packages/schemas/src/graphics/imagehelper.ts:166` | 1 | `pdfme/pdfme#1183` |
| `packages/schemas/src/graphics/image.ts` | 7 | `pdfme/pdfme#696` (×6), `https://pdfme.com//docs/custom-schemas...` |
| `packages/schemas/src/shapes/line.ts` | 4 | `pdfme/pdfme#530` (×4) |
| `packages/schemas/src/shapes/rectAndEllipse.ts` | 6 | `pdfme/pdfme#530` (×5), `pdfme/pdfme#382` |
| `packages/schemas/src/text/types.ts` | 5 | `pdfme/pdfme#851` (×3), `#707` (×1), and the JSDoc reference. |
| `packages/schemas/src/text/propPanel.ts` | 5 | `pdfme/pdfme#851`, `#707`, `https://pdfme.com//docs/custom-schemas...` |
| `packages/schemas/src/text/uiRender.ts` | 2 | `pdfme/pdfme#851`, `#707` |
| `packages/schemas/src/text/helper.ts` | 5 | `pdfme#1234`, `pdfme#1115`, `pdfme/pdfme#707` |
| `packages/schemas/src/text/constants.ts` | 2 | `pdfme#1115` (×2) |
| `packages/schemas/src/text/pdfRender.ts` | 2 | `pdfme/pdfme#707`, `#851` |
| `packages/schemas/src/text/richTextPdfRender.ts:200` | 1 | `pdfme/pdfme#851` |
| `packages/schemas/src/multiVariableText/uiRender.ts:55` | 1 | `pdfme#1296` |
| `packages/schemas/src/tables/cell.ts` | 2 | `pdfme/pdfme#851` (×2) |
| `packages/schemas/src/tables/dynamicTemplate.ts:24`, `tables/uiRender.ts:230` | 2 | `pdfme/pdfme#1299` |
| `packages/schemas/src/tables/helper.ts` | 2 | `pdfme/pdfme#1299` (×2) |
| `packages/schemas/src/tables/pdfRender.ts:122` | 1 | `pdfme/pdfme#1299` |
| `packages/ui/src/Designer.tsx` (comments only) | 3 | `pdfme#1235` (×3) |
| `packages/ui/src/hooks.ts:161` | 1 | `pdfme#1240` |
| `packages/ui/src/components/Designer/RightSidebar/DetailView/index.tsx:288` | 1 | `https://github.com/pdfme/pdfme/pull/367#issuecomment-1857468274` |
| `packages/ui/src/components/Designer/Canvas/index.tsx` | 3 | `pdfme#284` (×3) |
| `packages/ui/src/components/Designer/index.tsx` | 3 | `pdfme#1235` (×3) |
| `packages/ui/src/helper.ts` | 5 | `pdfme/pdfme#1465` (×2), `pdfme#284` (×3) |
| `packages/ui/src/components/Renderer.tsx:386` | 1 | `https://pdfme.com/docs/custom-schemas` (in error message — kept per task constraint to not modify Renderer.tsx) |

### Test fixtures + describe-block names referencing upstream regressions

All `__tests__/*.ts` `describe('… (pdfme/pdfme#NNN)')` strings, regression
guards, and stored-template fixtures (`pdfmeVersion: '5.2.16'`, etc.) are
Bucket A — they document upstream issue traceability and exercise the
real stored format.

Counts (see `rg -n '@pdfme|pdfme' packages/*/__tests__` for the full
list):

- `packages/schemas/__tests__/`: ~25 references
- `packages/generator/__tests__/`: ~6 references
- `packages/common/__tests__/`: ~10 references
- `packages/converter/__tests__/`: 3 references (stored fixtures)
- `packages/cli/__tests__/`: ~10 references (legacy migration test + example fixtures)
- `packages/pdf-lib/__tests__/`: 1 reference
- `packages/ui/__tests__/`: ~9 references (DOM attribute selectors + snapshots)
- `packages/generator/__tests__/assets/templates/*.json`: stored `pdfmeVersion` fields

## Annotation strategy

A single canonical comment is added at:

- `packages/ui/src/constants.ts` — protects `DESIGNER_CLASSNAME` /
  `UI_CLASSNAME` and (by reference) all derived class strings in
  `Moveable.tsx`, `Selecto.tsx`, `AnchorOverlay.tsx`, and the snapshots.
- `packages/common/src/schema.ts` — protects the `pdfmeVersion` Zod
  field name (and by reference all `pdfmeVersion` writes / reads).
- `packages/common/src/version.ts` — protects `PDFME_VERSION` public
  export.
- `packages/cli/src/fonts.ts` — protects `LEGACY_CACHE_DIR`.

Per-occurrence comments are not added; the canonical-definition rule
keeps the noise low while making the rationale auditable.

## Totals

- **Bucket A (kept):** 200+ string occurrences across ~80 files
  (dominated by JSDoc/issue refs, snapshots, and stored fixtures)
- **Bucket B (renamed):** 3 strings (1 user-visible default content,
  1 PDF metadata stamp, 1 internal DOM id)
- **Bucket C (deferred):** 0

## Out of scope (noted, not actioned)

- **Playground (`playground/`)** — imports `@pdfme/*` package names
  that no longer exist on disk. Confirmed broken (no `@pdfme` symlinks
  in `node_modules`). Tracked separately; this branding sweep does not
  fix the playground.
- **Website (`website/docusaurus.config.js`)** — site title / URL
  still set to `pdfme.com`. Site rebrand is a separate ticket.
- **Top-level `*.md`** — migration guides and changelog deliberately
  retain `pdfme` references for context.
