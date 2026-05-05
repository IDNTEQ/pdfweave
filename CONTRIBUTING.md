# Contributing to PDFweave

Thanks for considering a contribution. PDFweave is a small project with
a focused scope. Here's how to be effective.

---

## Repo layout

PDFweave is an npm-workspaces monorepo. Eight packages:

```
packages/
  common/       — shared types, dynamic-template (reflow), binding/anchor helpers
  pdf-lib/      — vendored fork of pdf-lib with PDFweave-specific tweaks
  schemas/      — built-in plugins: text, image, table, barcodes, svg, lines, shapes
  generator/    — Node-side PDF generation entry point
  ui/           — React Designer, Form, Viewer
  converter/    — image ⇄ PDF conversion utilities
  manipulator/  — PDF merge/split/rotate/etc.
  cli/          — command-line wrapper around generator + manipulator
```

Workspace tooling: `npm` (NOT pnpm). Top-level scripts live in the root
`package.json`.

---

## Setup

```bash
git clone git@github.com:IDNTEQ/pdfweave.git
cd pdfweave
npm install
npm run build -w packages/common -w packages/pdf-lib -w packages/converter -w packages/schemas -w packages/generator -w packages/ui
```

For testing a change against a real consumer, the recommended flow is to
`file:` link from the consumer's `package.json`:

```json
"dependencies": {
  "@pdfweave/generator": "file:../pdfweave/packages/generator",
  "@pdfweave/schemas": "file:../pdfweave/packages/schemas"
}
```

---

## What we accept

In rough priority order:

1. **Bug fixes** — with a regression test in the same PR. These get
   merged fastest.
2. **Performance improvements** to the generator or layout engine —
   include a benchmark before/after.
3. **New schema plugins** — must follow the existing plugin shape
   (`pdf`, `ui`, `propPanel`, optional `measure`/`validateLayout`).
4. **Designer improvements** — a11y, keyboard navigation, undo/redo,
   small UX polish on existing panels.
5. **Documentation** — fixing wrong examples, adding new ones,
   improving the migration guide.

## What we'll usually push back on

1. **Adding a configuration option just to make existing behavior toggleable.**
   We default to the right behavior and keep the API small.
2. **New `BasePdf` shapes** without a real production use case. The
   `BlankPdf` / `CustomPdf` / `StationeryPdf` triad covers the spectrum
   from "pure decoration via vector schemas" to "rendered artwork stamped
   per page". A fourth needs to demonstrate it's not (a) or (c) in disguise.
3. **Replacing the binding system** with a more elaborate templating
   language. Real-world templates are mostly path lookups and column
   mapping; we resist adding a full expression engine.
4. **Adding anchor-rule modes beyond the v1 grammar** without showing
   templates that need them. The five rules in `SchemaLayoutRule` are
   intentional. We'll grow the set when real templates demand it.

---

## PR checklist

Before opening a PR:

- [ ] Branch off `main`.
- [ ] One concept per PR. If you're touching three unrelated things,
      send three PRs.
- [ ] Tests for new behavior. We prefer unit tests in the changed
      package's `__tests__/` folder. Snapshot tests are accepted but
      explain what they're guarding against.
- [ ] Lint clean: `npm run lint`.
- [ ] Type clean: `npm run build -w <package>`.
- [ ] Update the relevant package's `CHANGELOG.md` under `## Unreleased`.
- [ ] If your change is user-visible, update `MIGRATION.md` AND the
      relevant section of the root `README.md`.

---

## Commit messages

We follow Conventional Commits. Example:

```
feat(common): support relative anchor offsets in horizontal mode

Adds optional `offset` (in mm) to HorizontalAnchorRule, applied after
the mode resolution. Used by templates with logo + tagline pairs that
need a fixed gap that survives reflow.

Closes #42
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`,
`build`, `ci`.

Scopes: package name (`common`, `generator`, etc.), or `repo` for
top-level changes.

---

## Issue triage

Issues tagged `good first issue` are bite-sized and don't require
deep familiarity with the layout engine. If you want to take one,
comment on it and we'll assign it to you.

We aim to respond to every issue within a week. If you haven't heard
back after that, ping the issue — we may have missed it.

---

## Releases

Releases are cut from `main` using changesets. Maintainers tag and
publish; contributors don't need to think about it.

Cadence target: **minor releases monthly, patches as needed.** We may
miss a month if there's nothing meaningful to release.

---

## Relationship with upstream pdfme

PDFweave was forked from [pdfme](https://github.com/pdfme/pdfme) and
shares most of its surface. Our policy:

1. **Bug fixes that apply to upstream too** should be sent upstream
   first. We'll merge here once they land there, or after a reasonable
   wait if upstream is unresponsive.
2. **PDFweave-specific features** (binding, anchors, smart tables,
   stationery PDFs) live here only.
3. **Designer / Form / Viewer changes** — if the change is generic UX
   polish, send upstream. If it touches the binding/anchor panels,
   it's PDFweave-only.
4. **Don't poach** upstream contributors. If you've found PDFweave by
   way of an upstream PR that didn't land, link to it in your PDFweave
   PR; we'll often co-review with upstream.

The goal is for both projects to be good neighbors. Upstream pdfme is
the reason PDFweave exists.

---

## Security

Email security@idnteq.com (or open a private security advisory on
GitHub) for vulnerabilities. Don't open public issues for security
problems.

---

## License

By contributing, you agree your contribution is licensed under the
same MIT license as the rest of PDFweave (and pdfme).
