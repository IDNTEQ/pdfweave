# Branding audit — independence sweep — 2026-05-08

> Supersedes
> [docs/branding-audit-conservative-2026-05-07.md](./branding-audit-conservative-2026-05-07.md).

## Why this exists

The conservative sweep (2026-05-07, 3 strings renamed, 200+ kept as
compat) was scoped to "rename only what's already obviously bound to
PDFweave's brand and isn't part of any contract". The independence
sweep overrides that scope: PDFweave is now positioned as a standalone
library, not a deferential fork, so anything that still reads as
`pdfme-*` on the public surface is renamed unless it must stay for
legal, fixture-traceability, or migration-source reasons.

## What moved from Bucket A to Bucket B

### Public CSS class prefixes (BREAKING)

| File:line | Old | New |
|-----------|-----|-----|
| `packages/ui/src/constants.ts` | `'pdfme-designer-'`, `'pdfme-ui-'` | `'pdfweave-designer-'`, `'pdfweave-ui-'` |
| `packages/ui/src/components/Designer/Canvas/Moveable.tsx` | `'pdfme-moveable'` | `'pdfweave-moveable'` |
| `packages/ui/src/components/Designer/Canvas/Selecto.tsx` | `'pdfme-selecto'` | `'pdfweave-selecto'` |
| `packages/ui/src/components/Designer/Canvas/AnchorOverlay.tsx` | `'pdfme-designer-anchor-overlay'` | `'pdfweave-designer-anchor-overlay'` |
| `packages/ui/__tests__/components/__snapshots__/*.snap` | `pdfme-*` (28 occurrences) | `pdfweave-*` |
| `packages/ui/__tests__/components/Designer.test.tsx`, `Preview.test.tsx` | `.pdfme-ui-zoom-in` selector | `.pdfweave-ui-zoom-in` |

Documented as **breaking** in CHANGELOG. Downstream stylesheets that
target `.pdfme-*` must be updated.

### Public DOM data attributes (BREAKING)

| File:line | Old | New |
|-----------|-----|-----|
| `packages/ui/src/components/Renderer.tsx` | `data-pdfme-render-ready`, `data-pdfme-plugin-error` | `data-pdfweave-render-ready`, `data-pdfweave-plugin-error` |
| `packages/ui/__tests__/assets/normalizeSnapshot.ts`, `Renderer.test.tsx`, `Renderer.safeStringify.test.tsx`, `Preview.test.tsx` | Same | Same |

Documented as **breaking** in CHANGELOG. E2E suites waiting on these
attributes must be updated.

### Stored template format field (non-breaking on read)

| File:line | Change |
|-----------|--------|
| `packages/common/src/schema.ts` | `Template` zod object now accepts both `pdfweaveVersion` (canonical) and `pdfmeVersion` (legacy) as optional strings. |
| `packages/common/src/helper.ts` | `migrateTemplate` hoists `pdfmeVersion` onto `pdfweaveVersion` if the new field is missing. The old field is left intact for one major-version compat window. |
| `packages/ui/src/Designer.tsx` | On save / change, writes only `pdfweaveVersion`. |
| `packages/cli/src/diagnostics.ts` | `KNOWN_TEMPLATE_KEYS` accepts both names. |

Documented as **non-breaking on read; new templates write the new
field only**.

### Public exported version constant (non-breaking, deprecated alias)

| File:line | Change |
|-----------|--------|
| `packages/common/set-version.js`, `packages/common/src/version.ts` (generated) | Canonical export is now `PDFWEAVE_VERSION`. `PDFME_VERSION` is preserved as a `@deprecated` re-export of the same string for one major-version window. |
| `packages/common/src/index.ts` | Re-exports both names. |
| `packages/ui/src/Designer.tsx` | Internal usage migrated to `PDFWEAVE_VERSION`. |

Documented as **non-breaking; `PDFME_VERSION` will be removed in a
future major**.

## What stayed in Bucket A — the new minimal kept set

### Legacy migration source paths

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/cli/src/fonts.ts` | `LEGACY_CACHE_DIR = ~/.pdfme/fonts` | Real users still have an upstream-pdfme font cache on disk; `ensureFontCacheMigrated()` moves it to `~/.pdfweave/fonts` on first run. Renaming silently misses every legacy cache. |
| `packages/cli/src/fonts.ts` (log strings) | `'PDFweave: migrating font cache from ~/.pdfme/fonts'` | Already PDFweave-branded; the residual `~/.pdfme/fonts` is the literal legacy path. |
| `packages/cli/__tests__/doctor.test.ts` | Test of the legacy migration | Asserts the user-visible migration messaging. |
| `packages/converter/__tests__/index.test.ts` | Stored-template fixtures with `pdfmeVersion: '5.2.16'` | Asserts the back-compat read path still works for templates produced before the independence sweep. |
| `packages/generator/__tests__/assets/templates/*.json` | Stored `pdfmeVersion` fields in legacy fixtures | Same. |

### Upstream issue / PR / docs references in JSDoc and comments

These are traceability — every `pdfme/pdfme#NNN`, `pdfme#NNN`, and
`https://github.com/pdfme/pdfme/issues/NNN` reference. Renaming would
either break the link or fabricate one. Per task constraint, comments
that read as deferential ("upstream's correct fix is ...", "we mirror
pdfme's behaviour here") would be reworded to be matter-of-fact —
none were found in this scope; the existing references are already
written as factual `pdfme#NNN: <what was fixed>` shortform.

The full file-by-file count is unchanged from the conservative audit;
see that document for the inventory.

### Upstream-author fallback in example-templates.ts

| File:line | String | Reason |
|-----------|--------|--------|
| `packages/cli/src/example-templates.ts:153`, `__tests__/examples*.ts` | Default `'pdfme'` author for upstream-provided example templates | Falls back to the upstream manifest's literal author when an example entry omits one. Renaming would fabricate an author for files we did not write. |

### LICENSE.md

Untouched. The MIT licence and pdfme's copyright notices remain
exactly as published.

### Renderer error-message URL

`packages/ui/src/components/Renderer.tsx:386` still emits
`https://pdfme.com/docs/custom-schemas` in its plugin-not-found error.
Kept until the pdfweave.dev docs site has the equivalent page; this
is a small fallback link in an error message, not a public surface,
and pdfme's docs are still the authoritative reference for custom
schemas.

## Bucket counts after the independence sweep

- **Bucket B (renamed in this sweep):** ~50 string occurrences
  (4 source files for CSS prefixes; 1 source file for DOM data
  attrs + 4 test files; 2 source files + 1 build script for the
  version field/export; 2 snapshot files).
- **Bucket A (kept):** the legacy font-cache path, the legacy
  template-fixture `pdfmeVersion` strings, the JSDoc/issue traceability
  references, the example-templates author fallback, the LICENSE
  notices, and the Renderer error-message URL.

## Linked work

- Conservative sweep (#29): commits `0084fa65`, `5c5dd23b`,
  `c8185233`, `9fc42692`.
- Independence sweep: commits on this PR — see CHANGELOG entry.

## Verification

After the independence sweep:

```
rg '@pdfme|pdfme-(designer|ui|moveable|selecto)|PDFME_VERSION|pdfmeVersion|data-pdfme' \
   packages/ --glob '!**/__snapshots__/**' --glob '!**/dist/**' \
   --glob '!**/coverage/**'
```

returns only:

- the back-compat aliases (`PDFME_VERSION` re-export, `pdfmeVersion`
  zod field + read paths, `KNOWN_TEMPLATE_KEYS` entry);
- intentionally-kept upstream issue references in JSDoc;
- the legacy font cache path in `packages/cli/src/fonts.ts`;
- the upstream-author fallback in `example-templates.ts`;
- the Renderer error-message URL (`https://pdfme.com/docs/custom-schemas`).
