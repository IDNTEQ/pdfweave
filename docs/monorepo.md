# PDFweave Monorepo Guide

This document describes the current structure, build order, and maintenance conventions for the PDFweave npm workspaces monorepo. It is the single source of truth for "how the packages fit together."

## Workspace Packages

| Package              | Purpose                                      | Publishes as          | Build order |
|----------------------|----------------------------------------------|-----------------------|-------------|
| `packages/pdf-lib`   | Forked pdf-lib with custom modifications (CJK, etc.) | `@pdfweave/pdf-lib`   | 1 (serial) |
| `packages/common`    | Core types, data binding, anchor geometry, dynamic layout engine, expression evaluator | `@pdfweave/common`    | 2 (serial) |
| `packages/converter` | pdf2img, img2pdf, pdf2size, pdf.js shims     | `@pdfweave/converter` | 3 (serial) |
| `packages/schemas`   | Built-in schema plugins (text, table, image, barcodes, etc.) | `@pdfweave/schemas`   | 4 (serial) |
| `packages/generator` | `generate()` + PDF rendering pipeline        | `@pdfweave/generator` | 5 (parallel) |
| `packages/ui`        | React Designer, Form, Viewer                 | `@pdfweave/ui`        | 5 (parallel) |
| `packages/manipulator` | PDF merge/split/rotate/insert/organize      | `@pdfweave/manipulator` | 5 (parallel) |
| `packages/cli`       | Command-line tool                            | `pdfweave` (bin)      | 6 (serial) |

**Parallel group**: generator, ui, and manipulator can build in parallel after schemas because they only depend on earlier packages.

## Build Order & Commands

The root `package.json` encodes the order explicitly:

```bash
npm run build
```

This runs:
1. Clean
2. pdf-lib (serial)
3. common (serial) — note: used to run set-version.js here (removed 2026-05)
4. converter (serial)
5. schemas (serial)
6. generator + ui + manipulator (parallel via `scripts/build-workspaces-in-parallel.sh`)
7. cli (serial)

**Why the explicit order?** TypeScript project references + Vite builds have inter-package dependencies. Building out of order produces broken `.d.ts` or runtime import errors.

See also `AGENTS.md` ("Build Order") and the troubleshooting section for common "build in the wrong order" errors.

## Common Metadata (Duplicated by Design for Now)

The following fields are intentionally duplicated across the 8 workspace `package.json` files:

- `description`, `keywords`, `homepage`, `bugs`, `license`, `author`, `contributors`, `repository` (type/url + directory), `files`, `type`, `sideEffects`, `main`, `module`, `types`, `exports`, `publishConfig`

**Current canonical values** (as of 2026-05):

```json
{
  "description": "TypeScript base PDF generator and React base UI. Open source, developed by the community, and completely free to use under the MIT license!",
  "keywords": ["pdfweave", "pdf", "pdf-designer", "pdf-generation", "pdf-viewer", "react", "typescript"],
  "homepage": "https://pdfweave.dev",
  "bugs": { "url": "https://github.com/IDNTEQ/pdfweave/issues" },
  "license": "MIT",
  "author": "PDFweave contributors (forked from pdfme by hand-dot)",
  "repository": {
    "type": "git",
    "url": "https://github.com/IDNTEQ/pdfweave.git"
  },
  "files": ["dist", "README.md"],
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" } },
  "publishConfig": { "access": "public" }
}
```

When adding a new package or changing one of these fields, update **all** workspace `package.json` files for consistency.

A future improvement could introduce a small sync script under `scripts/`, but we are deliberately keeping the setup simple for now.

## Version Handling

- The public version constant lives in `packages/common/src/version.ts` (committed).
- It used to be generated at build time by a `set-version.js` script that mutated source from the latest git tag. This was removed in 2026-05 (see Item 3 of the layout/hygiene work).
- Release tooling (`scripts/increment-version.sh` and the publish process) is responsible for updating the value in `version.ts` before tagging.

In development the value may be a placeholder (e.g. `0.1.0-dev`). This is acceptable — the string is primarily for user-facing diagnostics and support requests.

## Scripts Directory

- `build-workspaces-in-parallel.sh` — used for the parallel group.
- `coverage-aggregate.mjs`, `crap.mjs` — quality bar tooling.
- `link-workspaces.sh`, `determine-npm-tag.sh`, `increment-version.sh` — release / dev ergonomics.

## Adding a New Package

1. Add it to the `workspaces` array in root `package.json` in the correct position in the build graph.
2. Copy the canonical shared metadata block from an existing package.
3. Add the appropriate dependencies / peerDependencies on earlier packages.
4. Add the package to the root build script (serial or parallel group).
5. Update this document.

## Further Reading

- `AGENTS.md` — development commands, build order troubleshooting, contribution workflow.
- `DEVELOPMENT.md` — original contributor guide (slightly outdated but still useful).
- Root `package.json` scripts for the current `check`, `ci`, `fmt`, `lint`, etc. commands.

This document was created as part of the 2026-05 monorepo hygiene work.