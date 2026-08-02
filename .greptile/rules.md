# PDFweave Review Rules

PDFweave is a TypeScript npm-workspace monorepo. Prioritize correctness,
security, compatibility, and production document behavior over style. Oxlint
and strict ESLint already report style and complexity debt.

## Shared Geometry

Code touching anchor resolution, anchor cycles, or table column-width inference
must reuse `@pdfweave/common/anchorGeometry` or
`@pdfweave/common/tableBinding`. Flag duplicated geometry or binding logic in UI
or renderer packages.

## Template Compatibility

Stored templates must remain readable. New required fields in common schema or
type contracts are breaking changes; new optional fields require migration and
round-trip consideration.

## Fork Identity

Flag new `@pdfme/*` identifiers or `pdfme-*` CSS names unless an adjacent
`Compat:` comment explains why the upstream identifier must be retained.

## Test Quality

Flag untested branches in payment, security, layout, resource-caching, and
multi-page rendering paths. Do not repeat findings already enforced by the
repository lint configuration.
