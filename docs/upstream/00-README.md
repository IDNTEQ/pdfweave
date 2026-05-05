# Upstream pdfme contributions — drafts

These are draft texts for issues and PRs we want to file against
[pdfme/pdfme](https://github.com/pdfme/pdfme). They live here so
maintainers can review before anything is sent.

## Pre-flight checklist

Before filing any of these:

- [ ] PDFweave's public README, MIGRATION, and CONTRIBUTING are merged
      and visible at `github.com/IDNTEQ/pdfweave`.
- [ ] PDFweave's IDNTEQ/pdfweave repo has a public release tag (or at
      least a published 0.1.0 to npm).
- [ ] An IDNTEQ employee — not an automation account — is logged into
      a GitHub account that can author the issue/PR. Upstream
      maintainers respond better to identifiable humans.
- [ ] You've personally read the draft and you'd be comfortable with
      the wording showing up in your inbox.

## Order

1. **`01-fork-announcement-issue.md`** — file FIRST. This is a
   transparency issue announcing the fork and asking which patches
   the maintainers would accept. Wait for a response (a few days to
   a couple of weeks) before opening any PRs. This earns goodwill
   and also tells you which PRs to actually write.

2. **`02-stationery-pdf-pr.md`** — file ONLY AFTER (1) gets an
   encouraging response. Most digestible patch we have. Single
   discriminated-union addition, no API breakage, comes with tests.
   Best first contribution.

3. _Future drafts go here_ — `03-table-repeathead-fix.md`,
   `04-plugin-measure-rfc.md`, etc. Don't write them until (1)
   has landed.

## Tone

These drafts are written in a **collaborative, deferential** tone
on purpose. We are NOT pdfme's customer or competitor — we are
downstream consumers who ran into walls and built around them, and
we want to give back what makes sense. Resist the urge to edit the
drafts to be more assertive. The tone is the offering.

## What if upstream is hostile or unresponsive

That's OK. The drafts are written to be useful even if upstream
declines:

- The fork-announcement issue is an open invitation; maintainers
  may close it without comment, may engage warmly, or may ignore
  it. All three outcomes are fine.
- If upstream is unresponsive after ~30 days, file the
  StationeryPdf PR anyway — silent maintainers sometimes ship PRs
  they didn't comment on. If THAT sits without engagement for
  another 60 days, close it ourselves with a "thanks anyway" note
  and move on.
- If upstream is actively hostile, withdraw the PR, link it from
  PDFweave's CHANGELOG ("we tried to upstream this; declined"),
  and move on.

The point is to be a good neighbor, not to push features.

## After contributions land

If/when the StationeryPdf PR lands upstream:

- Drop our local fork's StationeryPdf code in favour of upstream
  pdfme's version once their release goes out.
- Update PDFweave's `CHANGELOG.md` noting the upstream landing.
- Update `MIGRATION.md` — for the StationeryPdf section, add a note
  that upstream pdfme also supports this from version X onwards.
- Send the maintainer a thank-you note (privately or in the PR
  thread). Costs nothing, builds the relationship.
