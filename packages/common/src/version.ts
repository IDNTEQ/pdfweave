// Public API: `PDFWEAVE_VERSION` is the canonical exported version
// constant from `@pdfweave/common`. The previous name `PDFME_VERSION`
// is kept as a deprecated alias for one major-version compatibility
// window (see the fork independence work in 2026).
//
// This file is now committed. Release tooling (increment-version.sh or
// the publish process) is responsible for updating the value before
// tagging a release. In development it may show a dev/placeholder value.
export const PDFWEAVE_VERSION = '0.1.0-dev';

/**
 * @deprecated Use `PDFWEAVE_VERSION`. This alias is preserved for
 * one major-version compatibility window with consumers that imported
 * `PDFME_VERSION` before the independence sweep.
 */
export const PDFME_VERSION = PDFWEAVE_VERSION;
