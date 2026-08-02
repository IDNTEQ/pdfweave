# Production print platform roadmap

- **Status:** Active
- **Started:** 2026-07-31
- **Scope:** PDFweave from template engine to production-print platform
- **Source of truth:** [ROADMAP.md](../../ROADMAP.md)
- **Related quality bar:** [GOALS.md](../../GOALS.md)

## Outcome

PDFweave should remain a focused PDF composition engine while gaining the
production controls needed for high-volume transactional documents and
commercial print workflows. The target is not a monolithic PlanetPress clone.
It is a set of composable packages with explicit contracts:

1. bind and paginate variable data correctly;
2. generate large document batches without duplicating constant resources;
3. secure and validate the resulting PDFs;
4. impose logical pages onto physical sheets;
5. hand jobs to workflow, print, archive, and delivery adapters;
6. prove every stage with deterministic artifacts and operational telemetry.

## Current baseline

The repository already has a capable composition core:

- JSON templates, nested data binding, formatting, and safe expressions;
- anchor-based layout and dynamic multi-page tables;
- custom base PDFs and repeating stationery, with asymmetric CropBox overlay
  evidence and preserved surrounding artwork;
- built-in text, image, barcode, table, and form-oriented plugins;
- one-call multi-record generation with shared image, font, and base-PDF
  resources;
- PDF merge, split, insert, remove, move, rotate, and organize operations;
- A4 and arbitrary millimetre page sizes, with A2/A3 render coverage;
- deterministic simplex n-up imposition with named/custom sheets, source-box
  and `/UserUnit` normalization, clipping, copies, and collation;
- visual snapshots, JUnit, coverage, CRAP, size, CodeQL, OSV, and audit jobs.

The main gaps are production policy and workflow features: output encryption,
native grouped totals, advanced imposition/finishing, print preflight,
output-device profiles, job orchestration, and multichannel delivery. Several
existing quality gates also report incomplete or misleading results and must
be corrected before a production-readiness claim.

## Delivery rules

Every milestone below follows the same release contract:

- Public API changes require an RFC in `docs/rfc/`.
- Render changes require deterministic PDF and raster artifacts.
- Tests assert document structure as well as image appearance.
- New packages must build in browser and Node where their dependencies allow.
- New package coverage starts at 80% lines and 70% branches.
- Limits and validation errors are part of the public contract.
- A feature is not complete until its CLI or library usage is documented.
- Quality thresholds may only be loosened with a committed rationale.

## Dependency order

The roadmap is ordered by hard dependencies, not only by feature priority:

1. Runtime and security policy make builds reproducible.
2. Truthful CI makes release protection enforceable.
3. Document correctness makes batch and physical-sheet output trustworthy.
4. Imposition and preflight make output suitable for production equipment.
5. Workflow adapters automate already-qualified composition and print stages.

Feature work may proceed in parallel, but a release cannot advance past a gate
whose acceptance criteria are incomplete.

## P0 - Release integrity

**Goal:** make the existing repository safe to release and make every green CI
result mean what it claims. This is the next-release gate.

### P0.1 Runtime policy

- Standardize the supported runtime on Node `>=22.13`, with Node 22 and 24 CI.
- Run release and deployment workflows on Node 24.
- Pin npm to the repository's declared package-manager version.
- Add compatible `engines` metadata to the root and every public package.
- Add `.node-version` and `.nvmrc` with the CI development version.
- Correct Node 16/18/20 references in contributor and website documentation.

**Acceptance:** clean install, typecheck, build, test, and package smoke tests
pass on both supported Node lines without `EBADENGINE` warnings.

### P0.2 Security and dependency policy

- Audit the root, playground, and website production trees in CI.
- Add Dependabot coverage for the website lockfile.
- Clear high and critical findings or commit time-bounded exploitability
  decisions with owners.
- Triage all high and critical CodeQL findings.
- Add parser/input limits for PDFs, fonts, SVG, images, and remote resources.
- Add cumulative decoded-stream budgets or an isolated render worker with
  enforced heap and wall-clock termination for compressed PDF content.
- Add an independently produced PDF compatibility corpus covering inherited
  page boxes, object streams, filtered content, transparency groups, Type 3
  fonts, and optional-content groups.
- Add SSRF, path traversal, decompression, timeout, and cancellation tests.

**Acceptance:** every production audit exits zero at `--audit-level=high`; no
unaccepted high/critical CodeQL alert remains; hostile inputs fail with typed,
bounded errors rather than hangs or memory exhaustion.

**2026-07-31 checkpoint:** the core production audit is clean and the website
has no high/critical findings after a nonbreaking refresh. The playground's
RSC-only React Router finding and development-only root/website findings are
tracked with owners and expiry dates in
[`docs/security/audit-decisions-2026-07-31.md`](../security/audit-decisions-2026-07-31.md).
Website Dependabot coverage is now enabled; parser/resource limits remain open.

### P0.3 Truthful quality gates

- Replace the expiring blanket CRAP allowlist with owned, issue-linked debt.
- Instrument `packages/manipulator/src/index.ts` instead of reporting 0/0.
- Run at least one deterministic browser E2E workflow in CI.
- Preserve current per-package coverage as a non-regression floor.
- Ratchet CLI, UI, schemas, and pdf-lib toward 80% lines/70% branches.
- Reduce strict ESLint warnings package by package and enable errors on clean
  files.

**Acceptance:** coverage and CRAP still pass after 2026-08-02; browser CI runs
real assertions; every package reports nonzero measured coverage; a threshold
reduction requires a committed rationale.

### P0.4 Release and legal integrity

- Replace the two publishing workflows with one protected pipeline.
- Build and `npm pack` once, then test and publish those exact tarballs.
- Publish in dependency order with resumable, integrity-checked retries.
- Route prereleases to `next`, never `latest`.
- Verify release tags are reachable from protected `main`.
- Include the MIT licence and third-party notices in every package.
- Generate SBOMs, checksums, signed tags/releases, and npm provenance.
- Restore a tested security-disclosure channel.

**Acceptance:** stable and prerelease dry runs use the correct dist-tags; an
injected partial failure resumes safely; consumer tests install only packed
artifacts; licences, SBOMs, signatures, checksums, and provenance verify.

## P1 - Production document semantics

**Goal:** make long transactional documents predictable without requiring
template authors to simulate document semantics with ordinary styled rows.

### P1.1 Native table groups and totals

- Add `headerRows`, `footerRows`, and `repeatFooter` semantics.
- Add `keepTogether` for row groups such as subtotal, tax, and grand total.
- Add group headers/footers and page-level carry-forward/carry-over rows.
- Define oversized-row behavior: split cells, move, scale, or typed failure.
- Preserve row identity and source ranges in pagination diagnostics.

**Acceptance:** invoice and bank fixtures cover totals at every page boundary;
no header/footer collision, orphaned total group, missing row, or duplicate row
is possible across the tested matrix.

### P1.2 Stationery and master pages

- Preserve custom-PDF MediaBox/CropBox geometry and place authored schemas
  relative to the visible CropBox. This baseline is implemented and qualified.
- Support selecting stationery pages instead of repeating only source page 1.
- Define first, continuation, last, odd, and even master-page rules.
- Make Designer, preview, and generator behavior identical.
- Preserve editable/read-only and required schema metadata through Designer
  open/save round trips.
- Cache stationery resources across all records in a batch.

**Acceptance:** a multi-page statement can use distinct first/continuation/last
backgrounds, and resource inspection proves each constant artwork is embedded
once per output document.

### P1.3 Batch job API

- Wrap existing multi-input generation in an explicit job API.
- Add progress callbacks, cancellation, record/page limits, and deterministic
  record-to-page manifests.
- Add chunked execution and temporary-spool strategies for bounded memory.
- Define retry and idempotency behavior at record and job boundaries.
- Record page count, resource count, bytes, duration, and peak RSS.
- Add a reproducible benchmark harness, separate from correctness tests, that
  captures cold/warm latency, throughput, peak RSS/heap, and output size as
  versioned JSON artifacts with explicit regression budgets.
- Pin each benchmark to named 100-record and 10,000-record fixtures and record
  their hashes, Node and renderer versions, OS/architecture, CPU and memory
  profile, cache state, warm-up count, measured iterations, and aggregation
  method. Compare results only within the same documented runner class.
- Make the release gate fail when a workload exceeds its latency, throughput,
  peak-memory, or output-size budget, while retaining the JSON result as a CI
  diagnostic artifact.

**Acceptance:** 100 and 10,000-record qualification jobs meet documented time,
memory, and output-size budgets; cancellation releases resources; retries do
not duplicate documents.

### P1.4 Output security

- Add typed user/owner password and permissions options.
- Start with an audited Node adapter such as qpdf behind the postprocessing
  contract; keep browser capability explicit rather than implied.
- Define AES level, metadata-encryption, copy, print, modify, annotation, and
  accessibility permissions.
- Add signing as a separate postprocessor so encryption and signatures compose
  in a defined order.

**Acceptance:** Acrobat, qpdf, and at least one additional reader agree on
passwords and permissions; wrong passwords fail; allowed operations work;
unencrypted output remains byte-compatible when security options are absent.

## P2 - Physical print production

**Goal:** transform logical document pages into device-ready physical sheets.

### P2.1 N-up imposition - implemented, release pending

- Add a dedicated `@pdfweave/imposition` package.
- Accept A2/A3/A4/A5/A6, Letter, Legal, or arbitrary sheet dimensions.
- Pack source PDF pages into configurable rows and columns.
- Support margins, horizontal/vertical gutters, row-major and column-major
  fill, contain/no-scale placement, alignment, and optional auto-rotation.
- Support copy count with collated and uncollated logical-page ordering.
- Embed each source page once and reuse it for every placement.
- Return deterministic PDF bytes and an inspectable placement manifest.

**Acceptance:** seven specification-validated 200 x 95 mm boleto components
packed without scaling two-up on A4 and four-up on landscape A3, plus five A5
client statements packed four-up on landscape A3, pass geometry assertions,
resource-count checks, PDF parsing, and committed visual snapshots. CI
publishes the PDFs, PNGs, and manifests. Independent text-order extraction and
a 100-page imposition stress fixture remain follow-up hardening tasks.

### P2.2 Production marks and boxes

- Add crop, registration, color-bar, fold, and configurable custom marks.
- Carry or synthesize MediaBox, CropBox, BleedBox, TrimBox, and ArtBox.
- Add bleed expansion and safe-area validation.
- Add per-slot labels and sheet/job identifiers outside trim areas.

**Acceptance:** a preflight fixture verifies every page box and mark coordinate;
marks never enter trim unless explicitly configured.

### P2.3 Duplex, booklet, and signatures

- Add long-edge/short-edge duplex ordering and tumble controls.
- Add booklet page ordering, signatures, blank insertion, creep, and shingling.
- Add cut-and-stack and step-and-repeat modes.
- Add booklet preview manifests showing front/back slot mapping.

**Acceptance:** automated front/back mapping tests cover 4, 8, 12, 16, and
non-multiple-of-four inputs; folded physical mockups match the manifest order.

### P2.4 Print preflight and output profiles

- Validate page size, fonts, image resolution, transparency, overprint, and
  color spaces.
- Add PDF/X targets, ICC output intents, spot-color preservation, and rich
  black policy.
- Add configurable fail/warn policies and machine-readable reports.
- Define device-independent output presets separate from templates.

**Acceptance:** known-good and known-bad fixtures produce stable reports;
qualified output passes independent preflight tooling for its declared target.

## P3 - Commercial workflow platform

**Goal:** orchestrate qualified document jobs without coupling connectors or
delivery protocols to the composition engine.

### P3.1 DataMapper and ingestion

- Add streaming CSV, fixed-width, XML, JSON, database, and print-stream input
  adapters.
- Add visual field mapping, record grouping, validation, normalization, and
  sample-data profiling.
- Version mappings independently from templates.

### P3.2 Workflow runtime

- Add durable queues, schedules, triggers, retries, dead-letter handling,
  idempotency keys, secrets, and role-based access.
- Add job/record state, logs, traces, metrics, audit history, and replay.
- Keep the runtime deployable separately from the browser Designer.
- Select the first managed deployment target through an ADR, then ship
  versioned Terraform reference modules for its queues, workers, object
  storage, secrets, observability, and least-privilege identities. Keep the
  static Pages deployment and local runtime usable without that cloud stack.
- Keep secret values outside versioned Terraform and `.tfvars` files: inject
  them from the target secret manager or approved CI identity, expose only
  secret references to modules, and prevent values from entering plans, logs,
  or published artifacts.
- Require encrypted, versioned, and locked remote state with narrowly scoped
  read/write identities, access logging, and documented recovery. Treat state
  as sensitive even when Terraform outputs are marked `sensitive`.

### P3.3 Output and delivery adapters

- Add filesystem/object-storage/archive delivery.
- Add SMTP/email, HTTP/webhook, SFTP/FTP, and database adapters.
- Add IPP/LPR print queues and vendor-specific adapters behind capabilities.
- Add job tickets and JDF/JMF integration where equipment requires it.

### P3.4 Multichannel composition

- Reuse mapped data for print, accessible HTML/email, and web documents.
- Define shared content components without pretending PDF and responsive HTML
  have identical layout semantics.
- Add delivery tracking, bounce/failure events, and retention policy.

**Acceptance for P3:** a reference invoice flow ingests records, composes and
imposes print output, sends a digital copy, archives artifacts and manifests,
survives an injected delivery failure, and exposes a complete audit trail.

## Cross-cutting qualification matrix

Every relevant milestone must be tested across:

- Node 22 and 24;
- browser and Node where supported;
- A2, A3, A4, Letter, portrait, and landscape;
- blank, custom-PDF, and stationery bases;
- Latin, CJK, RTL, and mixed-script fonts;
- 1, 100, and large-batch records;
- deterministic UTC and non-UTC timezones;
- encrypted and unencrypted outputs once security ships;
- malformed, oversized, and adversarial resources;
- warm/cold caches and repeated generation.

The artifact manifest records the template and input fixture version, page and
sheet counts, row/record ranges, resource counts, output hash, runtime, peak
RSS, Node version, platform, and renderer version.

## Milestone completion record

| Milestone                                     | State                             | Evidence                                                                 |
| --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| Complex multi-page invoice and bank artifacts | Complete                          | `packages/generator/__tests__/complex-documents.test.ts`                 |
| 100-record shared-resource generation         | Complete                          | `packages/generator/__tests__/embed-once.test.ts`                        |
| A2/A3 populated and blank page sizes          | Complete                          | `packages/generator/__tests__/page-sizes.test.ts`                        |
| Custom base PDF/CropBox overlay               | Complete                          | Generator base-PDF and boleto artifact tests                             |
| P0 release integrity                          | Planned                           | Acceptance criteria above                                                |
| P1 document semantics                         | Planned                           | RFC required                                                             |
| Validated boleto ficha component              | Complete locally; release pending | RFC 0003, schema/generator/imposition tests, and qualification dashboard |
| P2.1 n-up imposition                          | Complete locally; release pending | RFC 0002, package tests, and qualification dashboard                     |
| P2.2-P2.4 production finishing                | Planned                           | P2.1 dependency                                                          |
| P3 workflow platform                          | Planned                           | P0-P2 dependency                                                         |

## Explicit non-goals

- Reimplementing printer firmware, RIP software, or proprietary device logic.
- Making every workflow adapter a dependency of the generator.
- Claiming PDF/X, color, permission, or signature compliance without an
  independent validator.
- Hiding unbounded memory or runtime behind a convenient batch API.
- Treating a visual snapshot alone as proof of structural PDF correctness.
