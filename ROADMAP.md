# PDFweave Roadmap

The live punch list. See [GOALS.md](GOALS.md) for the mission and quality
bar; this document tracks the actual work.

## Now

### Production print platform (July 2026)

The detailed, gated roadmap from document composition through imposition,
security, preflight, and workflow automation is maintained in
[docs/roadmaps/production-print-platform.md](docs/roadmaps/production-print-platform.md).

- [ ] **P0 - Release integrity:** Node policy, complete audits, truthful CI,
      CRAP remediation, and one protected publishing pipeline.
- [ ] **P1 - Production document semantics:** grouped totals, master pages,
      batch controls, and output security.
- [ ] **P1 - Designer round-trip semantics:** preserve editable/read-only and
      required metadata when programmatic templates are opened and saved.
- [ ] **P2.1 - N-up imposition (implemented locally; release pending):**
      configurable physical sheets, ordering, scaling, copy collation, visual
      artifacts, and placement manifests.
- [ ] **P2.2-P2.4 - Finishing:** marks, page boxes, duplex/booklets, preflight,
      PDF/X, and output profiles.
- [ ] **P3 - Workflow platform:** DataMapper, durable orchestration, print and
      delivery adapters, audit, and multichannel output.

### Tooling — Quality push (May 2026)

- [ ] **Phase 0** — Mission + roadmap + pinned tracking issue _(this PR)_
- [x] **Phase 1** — Layered linter: oxlint (fast, local) + ESLint flat
      config (deep, CI). `@typescript-eslint/strict-type-checked`,
      `eslint-plugin-import` boundaries, `eslint-plugin-sonarjs`
      cognitive-complexity ≤ 15, `eslint-plugin-unicorn`,
      `eslint-plugin-security`, `eslint-plugin-jsdoc` on public API only.
      Lands in **warn** mode; ratchet to error per-file in Phase 4.
- [x] **Phase 2** — Coverage + CRAP. vitest v8 coverage per package;
      `scripts/crap.mjs` joins coverage with cognitive-complexity →
      `crap-report.json`. CI fails if any function CRAP > 30.
- [x] **Phase 3** — CI artifacts + security:
  - vitest junit XML + dorny/test-reporter (PR check)
  - coverage HTML + lcov (artifact + PR comment)
  - CRAP report (PR comment)
  - `size-limit` per package (regression check)
  - CodeQL workflow → SARIF in Security tab
  - Dependabot config (weekly, security-only auto-PRs)
  - OSV-scanner workflow → SARIF
  - `npm audit --audit-level=high` gate
- [ ] **Phase 4** _(ongoing)_ — walk packages flipping lint warns to
      errors as code is cleaned.

### Backports from upstream pdfme

- [ ] **#1290** — _(track upstream)_
- [ ] **#1250** — _(track upstream)_
- [ ] **#1159** — barcode controls (QR version/mask/qzone, PDF417, ITF,
      SVG output) by lsadehaan
- [ ] **#1055** — _(track upstream)_
- [x] **#1467** — dynamic text height (merged upstream 2026-05-06,
      inherit on next sync)

## Next

- Plugin marketplace pattern — third-party schema plugins discoverable
  via `pdfweave.config.ts`.
- Designer accessibility audit — keyboard navigation, ARIA labels, screen
  reader announcements for canvas operations.
- Print-server reference adapter — minimal Node service that exposes
  `generate` over HTTP with auth + rate limiting; documented as the
  pattern for hosts to copy.

## Later

- Schema diff / migration tool — emit a structured diff between two
  template versions for review pipelines.
- Edge-runtime support _(on ice)_ — split the schemas package so a
  server-only entry (`@pdfweave/schemas/server`) re-exports only
  `pdfRender` paths and drops React from the server dep tree; audit
  generator's Node API usage; document Cloudflare Workers / Deno / Bun
  compatibility.
- i18n for the Designer beyond English / Portuguese.

## Done

- v0.2.0 release scaffold
- Sample-data tab in Designer RightSidebar
- Bulk-anchor edit (multi-select prop panel + right-click apply) with
  self-reference guard
- Anchor relationship overlay (triangles + lock badges)
- Dynamic text height with `overflow: visible | hidden | expand`
- Stationery PDF qualification harness with asymmetric CropBox positioning,
  preserved page boxes, opaque overlays, and inspectable raster/PDF artifacts
- P3 branding sweep — residual `@pdfme` / `pdfme` strings audited and
  classified; brand-bound strings renamed, compat-preserving strings
  annotated. See [docs/branding-audit-2026-05-07.md](docs/branding-audit-2026-05-07.md).
- Canvas / DetailView split (issue #28) — Designer Canvas decomposed
  into eight focused hooks (`useRenderedHeights`, `useShiftKeyTracker`,
  `usePageOverflow`, `useSelectionHelpers`, `useContextMenu`,
  `useDragResize`, `useMarqueeSelection`, `useMoveableSync`) plus
  `CanvasSchema` / `CanvasPage` / `DeleteButton` components.
  `Canvas/index.tsx` now sits under 250 lines and is pure composition.
  DetailView's `JSON.stringify` memo equality replaced with `dequal`.

## Process

- Items move from **Next → Now** when picked up; from **Now → Done** when
  shipped to `main` and reflected in CHANGELOG.md.
- Items get a 1-line "why" if the reason isn't obvious from the title.
- This file is the source of truth for the public roadmap; the GitHub
  pinned issue links here.
