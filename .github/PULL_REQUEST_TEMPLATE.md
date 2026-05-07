<!--
Thanks for contributing to PDFweave! Please fill out the sections below.
For trivial changes (typo fix, comment-only, etc.) feel free to keep it
short — but please keep at least the Summary and Test plan sections.
-->

## Summary

<!-- 1-3 bullet points: what changed and why. Lead with the why. -->

-

## Test plan

<!-- How did you verify this? Tick the boxes that apply. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint` (oxlint)
- [ ] `npm run lint:strict` (ESLint deep gate)
- [ ] `npm run test`
- [ ] `npm run coverage` *(if test coverage changed)*
- [ ] `npm run crap` *(if complexity might have changed)*
- [ ] `npm run build`
- [ ] Manual test in the Designer *(if UI changed)*

## Quality bar

<!--
Items that block merge. PRs that loosen any of these should explain why
in the body and link to a follow-up issue to ratchet back.
-->

- [ ] No new ESLint **errors** (warnings are OK; Phase 4 ratchets them)
- [ ] No new functions with cognitive complexity > 15
- [ ] No new functions with CRAP score > 30
- [ ] Public API changes have JSDoc
- [ ] No new TODO / FIXME / HACK comments without an issue link
- [ ] Tests added for new logic and for any regression this fixes

## Linked issues

<!-- Closes #N — or "Refs #N" if it's a partial step. -->

Closes #
