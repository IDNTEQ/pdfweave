# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFweave is an open-source TypeScript PDF template engine with
first-class data binding, anchor layouts, smart tables, and stationery
PDFs. It is a hard fork of [pdfme](https://github.com/pdfme/pdfme) (MIT).

The four differentiators over upstream — data binding, anchor layouts,
smart tables, stationery PDFs — are the contracts the codebase exists to
protect. See [GOALS.md](GOALS.md) for the mission and quality bar and
[ROADMAP.md](ROADMAP.md) for the live punch list. `AGENTS.md` is a symlink
to this file.

## Toolchain

The task runner is **`vp`** (vite-plus / `vite-plus` package, binary at
`node_modules/.bin/vp`), not raw npm or turbo. Root npm scripts wrap `vp`,
which fans work out across the `@pdfweave/*` workspaces. Package manager is
**npm 11** (`packageManager` is pinned); use npm, not pnpm/yarn, despite
the README's `pnpm add` install example for consumers.

Per-package scripts call `vite build` + `tsc` (build), `vp lint`/`vp fmt`
(oxlint/oxfmt), and `vitest run --config ../../vitest.config.ts` (test).

## Common Commands

Run from the repo root unless noted.

```bash
npm install            # install all workspaces
npm run build          # clean + build all packages in dependency order
npm run test           # vitest across all @pdfweave/* packages
npm run typecheck      # tsc -b (project references)
npm run lint           # oxlint (fast gate) across packages + playground
npm run lint:strict    # ESLint flat config (deep, type-aware — the CI gate)
npm run fmt            # oxfmt write across packages, playground, meta files
npm run fmt:check      # oxfmt verify (no writes)
npm run coverage       # per-package v8 coverage + aggregate
npm run coverage:check # coverage + CRAP gate (scripts/crap.mjs)
npm run check          # full local gate: fmt:check + lint + lint:strict +
                       # typecheck + test + coverage:check + playground test
npm run ci             # check + build + playground build (what CI runs)
npm run size           # size-limit bundle budgets (.size-limit.json)
```

### Running a single package or test

```bash
# One package's whole suite (cwd selects the workspace via vitest.config.ts):
cd packages/common && npx vitest run --config ../../vitest.config.ts

# One file or one test name:
cd packages/common && npx vitest run --config ../../vitest.config.ts \
  __tests__/anchorGeometry.test.ts -t "resolves right edge"

# Watch mode while iterating:
cd packages/generator && npx vitest --config ../../vitest.config.ts
```

Tests live in each package's `__tests__/` directory. A **single root
`vitest.config.ts`** holds per-workspace settings (include globs, jsdom for
`ui`, timeouts, image-snapshot setup) keyed by the workspace path — so tests
must be invoked with that shared config and the package as the cwd.

The generator and ui suites use **image snapshots**; after intentional
rendering changes update them with `npm run test:update-snapshots` inside
the package (or `npm run test -w packages/ui -- -u`).

## Two-layer lint + the quality gate

Linting is deliberately layered (see ROADMAP Phase 1–4):

- **oxlint** (`npm run lint`, config `.oxlintrc.json`) — fast, runs locally
  and per-package. The everyday gate.
- **ESLint flat config** (`npm run lint:strict`, `eslint.config.mjs`) —
  `@typescript-eslint/strict-type-checked` + sonarjs (cognitive-complexity
  ≤ 15) + import boundaries + security + jsdoc-on-public-API. This is the
  authoritative CI gate. Phase 4 is an ongoing walk flipping warnings to
  errors per file, so new code should land clean under `lint:strict`, not
  just oxlint.

The **CRAP** gate (`scripts/crap.mjs`, `.crap-allowlist.json`) joins
coverage with cognitive complexity and fails any function over CRAP 30.
Coverage floor is ≥80% line / ≥70% branch per package. When touching a
hot-path function, keep it covered or it will trip the gate.

## Architecture

### Monorepo build order

Builds are ordered by dependency (`npm run build`):
`pdf-lib → common → converter → schemas → parallel(generator, ui,
manipulator) → cli`. If you hit "module not found" between packages,
the cause is almost always a stale/missing upstream `dist` — rebuild in
this order.

Packages:
- **packages/common** — core types, the dynamic layout engine, and *all
  the fork's defining logic* (see below). Most other packages depend on it.
- **packages/pdf-lib** — forked pdf-lib with CJK + custom modifications.
- **packages/converter** — format conversion utilities.
- **packages/schemas** — built-in field-type plugins.
- **packages/generator** — PDF generation from a template + inputs.
- **packages/ui** — React Designer / Form / Viewer.
- **packages/manipulator** — PDF merge/split/rotate.
- **packages/cli** — `citty`-based CLI wrapping generator + schemas.
- **playground** — Vite app for interactive testing (`cd playground && vp dev`).
- **website** — Docusaurus docs.

### The fork lives in `packages/common`

Upstream pdfme had absolute-position schemas. PDFweave's value-add modules
all sit in `packages/common/src/` and are what you must not break:

- `dynamicTemplate.ts` — **the dynamic layout engine** (`getDynamicTemplate`).
  Dynamic height calculation, automatic page breaking, layout-tree
  management, stationery (`basePdf`) stamping across reflowed pages. The
  current branch's work is here. (Note: older docs placed this in
  `generator` — it is in `common`.)
- `anchorLayout.ts` + `anchorGeometry.ts` — relative positioning
  (`alignRightEdge`, `belowBottomEdge`, `afterRightEdge`, `pageLeft`,
  `pageTop`, …) that survives sibling height changes and reflow.
- `dataBinding.ts` + `tableBinding.ts` — schemas reference JSON paths with
  format hints (currency/number/date) instead of carrying copied data;
  per-row/column table binding.
- `expression.ts` — secure JS expression evaluator (Acorn parse → AST
  validation → cached compilation) for dynamic content.
- `types.ts` — core type definitions; start here for any data shape.
- `migrate.ts`, `pluginRegistry.ts`, `schema.ts` — versioned template
  migration, plugin registration, Zod validation.

### Plugin-based field system

Each field type is a plugin exporting `{ pdf, ui, propPanel }`:
- `pdf` — renders in the PDF via pdf-lib
- `ui` — renders interactively in the browser
- `propPanel` — Designer configuration UI

Location: `packages/schemas/src/<field-type>/index.ts` (text is the
canonical complete example). Plugins are passed into `generate()` /
Designer explicitly — they are not auto-registered.

### Template structure

- `basePdf` — blank `{ width, height, padding }` **or** a single-page PDF
  used as stamped stationery.
- `schemas` — 2D array; each sub-array is one page.
- `staticSchemas` — optional fields repeated on every page.

### UI component model

All UI components extend `BaseUIClass` (`packages/ui/src/class.ts`) and run
in three modes: `viewer` (read-only), `form` (input), `designer` (authoring).
Designer entry: `packages/ui/src/components/Designer/index.tsx`.

## PR Workflow

- Branch from and PR against `main`. Branch names: `feature/...` or `fix/...`.
- Conventional commits: `type(scope): description`
  (`feat`/`fix`/`docs`/`style`/`refactor`/`test`/`chore`).
- Before pushing, `npm run check` should pass (or at minimum
  `lint:strict` + `typecheck` + `test`).
- Every PR against `IDNTEQ/pdfweave` is auto-reviewed by **Greptile**
  (`.greptile/settings.yaml`) and **CodeRabbit** (`.coderabbit.yaml`). Wait
  for both, then address or push back with reasoning. There is no `@claude`
  GitHub Action and one is not planned — the agent operates on the repo
  directly via `gh`.

## Fork relationship

PDFweave is a **hard fork**, not a downstream mirror. We selectively port
useful upstream pdfme changes case-by-case only when they don't conflict
with the data-binding / anchor / smart-table / stationery contracts. There
is no standing backport queue. See `MIGRATION.md` and GOALS.md "Non-goals".

## Environment Notes

- Node 18+ recommended (16 minimum). For large PDFs, raise the heap:
  `export NODE_OPTIONS="--max-old-space-size=8192"`.
- Fonts are subset-embedded; CJK relies on the forked `@pdfweave/pdf-lib`.
- The codebase runs in both Node and browser; some modules have
  environment-specific implementations.
