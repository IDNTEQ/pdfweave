# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFweave is an open-source TypeScript PDF template engine with first-class
data binding, anchor layouts, smart tables, stationery PDFs, and physical-sheet
imposition. It is a hard fork of [pdfme](https://github.com/pdfme/pdfme) (MIT).

Those production-document capabilities are contracts the codebase exists to
protect. See [GOALS.md](GOALS.md) for the mission and quality bar and
[ROADMAP.md](ROADMAP.md) for the live punch list. `AGENTS.md` is a symlink to
this file.

## Toolchain

The task runner is **`vp`** (vite-plus / `vite-plus` package, binary at
`node_modules/.bin/vp`), not raw npm or turbo. Root npm scripts wrap `vp`,
which fans work out across the `@pdfweave/*` workspaces. Package manager is
**npm 11** (`packageManager` is pinned); use npm, not pnpm or yarn.

CI and release jobs use **Node 24**. Per-package scripts call Vite + TypeScript
for builds, `vp lint`/`vp fmt` for oxlint/oxfmt, and Vitest with the shared root
configuration for tests.

## Common Commands

Run from the repository root unless noted.

```bash
npm install            # install all workspaces
npm run build          # clean + build all packages in dependency order
npm run test           # vitest across all packages + report-builder tests
npm run qualification  # feature tests + inspectable HTML/PDF evidence
npm run typecheck      # tsc -b (project references)
npm run lint           # oxlint across packages + playground
npm run lint:strict    # ESLint flat config (deep, type-aware CI gate)
npm run fmt            # oxfmt write across packages, playground, meta files
npm run fmt:check      # oxfmt verify (no writes)
npm run coverage       # per-package v8 coverage + aggregate
npm run coverage:check # coverage + CRAP gate (scripts/crap.mjs)
npm run check          # full local gate, package/playground builds, browser test
npm run ci             # alias for the complete check gate
npm run size           # size-limit bundle budgets (.size-limit.json)
```

`npm run qualification` creates `test-artifacts/qualification-report.html`.
The self-contained report maps each catalogued feature to its source test and
embeds links/previews for generated PDFs and rendered pages. CI uploads the
same report and PDFs as the `pdfweave-qualification-report` artifact.

### Running a single package or test

```bash
# One package's whole suite (cwd selects the workspace):
cd packages/common && npx vitest run --config ../../vitest.config.ts

# One file or one test name:
cd packages/common && npx vitest run --config ../../vitest.config.ts \
  __tests__/anchorGeometry.test.ts -t "resolves right edge"

# Watch mode while iterating:
cd packages/generator && npx vitest --config ../../vitest.config.ts
```

Tests live in each package's `__tests__/` directory. A single root
`vitest.config.ts` holds per-workspace settings, including jsdom, timeouts,
and image-snapshot setup. Generator, imposition, and UI suites use image
snapshots; update snapshots only for intentional rendering changes.

## Quality Gates

Linting is deliberately layered:

- **oxlint** (`npm run lint`, config `.oxlintrc.json`) is the fast gate.
- **ESLint** (`npm run lint:strict`, `eslint.config.mjs`) is the authoritative,
  type-aware gate with complexity, boundary, security, and API-doc rules.

The CRAP gate (`scripts/crap.mjs`, `.crap-allowlist.json`) combines coverage
with cognitive complexity and fails functions over the configured limit.
Coverage floors are enforced per package.

## Architecture

### Monorepo build order

Builds run in dependency order:
`pdf-lib -> common -> converter -> schemas -> parallel(generator, imposition,
ui, manipulator) -> cli`. Rebuild an upstream package first when a downstream
workspace reports stale or missing declarations.

Packages:

- **packages/common** - core types, binding, expression, and dynamic layout.
- **packages/pdf-lib** - forked pdf-lib with CJK and custom modifications.
- **packages/converter** - format conversion utilities.
- **packages/schemas** - built-in field-type plugins and smart tables.
- **packages/generator** - PDF generation from templates and inputs.
- **packages/imposition** - deterministic n-up planning and PDF rendering.
- **packages/ui** - React Designer, Form, and Viewer.
- **packages/manipulator** - PDF merge, split, and rotation.
- **packages/cli** - `citty`-based CLI wrapping generator and schemas.
- **playground** - Vite app for interactive testing.
- **website** - Docusaurus documentation.

### Core production-document logic

The main PDFweave extensions live in `packages/common/src/`:

- `dynamicTemplate.ts` handles dynamic heights, automatic page breaking,
  layout trees, and stationery stamping across reflowed pages.
- `anchorLayout.ts` and `anchorGeometry.ts` implement relative positioning
  that survives sibling height changes and reflow.
- `dataBinding.ts` and `tableBinding.ts` bind schemas and table rows/columns
  to structured data with formatting hints.
- `expression.ts` securely evaluates expressions using Acorn parsing, AST
  validation, and cached compilation.
- `types.ts` defines the cross-package data contracts.
- `migrate.ts`, `pluginRegistry.ts`, and `schema.ts` handle migration,
  registration, and runtime validation.

### Plugin-based field system

Each field type exports `{ pdf, ui, propPanel }`: PDF rendering, interactive
browser rendering, and Designer configuration. The canonical examples live in
`packages/schemas/src/<field-type>/`. Plugins are passed explicitly to
`generate()` and UI components.

### Template and UI models

- `basePdf` is either a blank page definition or a PDF used as stationery.
- `schemas` is a two-dimensional array with one schema array per page.
- `staticSchemas` contains optional fields repeated on every page.

UI components extend `BaseUIClass` (`packages/ui/src/class.ts`) and support
viewer, form, and designer modes.

## PR Workflow

- Branch from and open PRs against `main`; use `feature/...` or `fix/...`.
- Use conventional commits: `type(scope): description`.
- Do not leave completed work only in the local checkout. Commit and push it;
  create the corresponding release when repository gates and publishing
  credentials are available, and document any external release blocker.
- Run `npm run check` before pushing, or at minimum strict lint, typecheck,
  tests, and qualification for rendering changes.
- Every PR is reviewed by Greptile and CodeRabbit. Wait for both to comment,
  then address findings or respond with technical reasoning before merging.
- For substantial changes, run periodic independent, read-only reviews through
  Claude Code with the `fable` model, including one before the final push.
  Verify each finding against current code and record material fixes or
  reasoned rejections in the PR.

## Fork Relationship

PDFweave is a hard fork, not a downstream mirror. Port useful upstream pdfme
changes selectively only when they preserve the binding, anchor, smart-table,
stationery, and production-print contracts. See `MIGRATION.md` and GOALS.md.

## Environment Notes

- Use Node 24.11+ and npm 11 for parity with the current repository toolchain
  and CI. Published-package runtime support remains package-specific. For large
  PDFs, set `NODE_OPTIONS=--max-old-space-size=8192`.
- Fonts are subset-embedded; CJK relies on the forked `@pdfweave/pdf-lib`.
- The codebase runs in Node and browsers; some modules have environment-specific
  implementations.
