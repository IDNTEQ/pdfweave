# PDFweave Roadmap

The live punch list. See [GOALS.md](GOALS.md) for the mission and quality
bar; this document tracks the actual work.

## Now

### Tooling — Quality push (May 2026)

- [ ] **Phase 0** — Mission + roadmap + pinned tracking issue *(this PR)*
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
- [ ] **Phase 4** *(ongoing)* — walk packages flipping lint warns to
      errors as code is cleaned.

### Backports from upstream pdfme

- [ ] **#1290** — *(track upstream)*
- [ ] **#1250** — *(track upstream)*
- [ ] **#1159** — barcode controls (QR version/mask/qzone, PDF417, ITF,
      SVG output) by lsadehaan
- [ ] **#1055** — *(track upstream)*
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
- Stationery PDFs — first-class testing harness for stamped-page output
  (currently relies on host integration tests).

## Later

- Schema diff / migration tool — emit a structured diff between two
  template versions for review pipelines.
- WASM-only render path — drop the React Designer dependency for
  server-only generation use cases.
- i18n for the Designer beyond English / Portuguese.

## Done

- v0.2.0 release scaffold
- Sample-data tab in Designer RightSidebar
- Bulk-anchor edit (multi-select prop panel + right-click apply) with
  self-reference guard
- Anchor relationship overlay (triangles + lock badges)
- Dynamic text height with `overflow: visible | hidden | expand`

## Process

- Items move from **Next → Now** when picked up; from **Now → Done** when
  shipped to `main` and reflected in CHANGELOG.md.
- Items get a 1-line "why" if the reason isn't obvious from the title.
- This file is the source of truth for the public roadmap; the GitHub
  pinned issue links here.
