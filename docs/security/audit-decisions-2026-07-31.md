# Dependency audit decisions - 2026-07-31

This record captures the non-zero findings that remain after the July 2026
security refresh. It is not a permanent allowlist. Each decision has an owner,
an expiry, and a concrete removal condition.

Audits must use the repository-declared npm `11.12.1`. The host's npm `10.8.2`
contains an Arborist peer-resolution bug that can crash `npm audit fix` while
building the ideal dependency tree.

## Verified baseline

| Lockfile | Production audit at `high` | Remaining finding |
| --- | --- | --- |
| Root | Pass, 0 findings | Full development tree has one high finding described below |
| Playground | Accepted exception | One advisory represented by `react-router` and `react-router-dom` |
| Website | Pass, 0 high/critical | 19 moderate records from one development-server chain |

## Temporary decisions

### Root development tooling: `brace-expansion`

- **Advisory:** `GHSA-mh99-v99m-4gvg`
- **Exposure:** transitive copies under ESLint packages, used against
  repository-controlled paths during development and CI; not shipped in any
  public PDFweave runtime package.
- **Reason pending:** the fixed `1.1.17` release is temporarily excluded by the
  environment's package-freshness window. No major-version override will be
  forced through ESLint's dependency graph.
- **Owner:** PDFweave maintainers.
- **Expires:** 2026-08-07.
- **Removal:** refresh the root lockfile once `brace-expansion >=1.1.17` is
  eligible, then require the full-tree high-severity audit to pass.

### Playground: React Router unstable RSC path

- **Advisory:** `GHSA-qwww-vcr4-c8h2`.
- **Exposure:** the playground is a client-side `BrowserRouter` application and
  does not use React Server Components or the affected unstable RSC APIs.
- **Reason pending:** React Router `7.18.1` fixes the other router advisories,
  but this RSC-specific advisory requires the next compatible major line.
  npm's suggested forced downgrade to `7.11.0` is rejected because it
  reintroduces older high-severity advisories.
- **Owner:** PDFweave maintainers.
- **Expires:** 2026-08-31.
- **Removal:** test and adopt a compatible React Router release containing the
  fix, or remove React Router from the playground.

### Website development server: `uuid`

- **Advisory:** `GHSA-w5hq-g745-h8pq`.
- **Exposure:** Docusaurus `3.10.2` -> webpack-dev-server `5.2.6` -> sockjs
  `0.3.24` -> uuid `8.3.2`. This chain is used by the local documentation
  development server and is absent from the deployed static site output.
- **Reason pending:** current sockjs has no compatible fixed dependency. A
  forced uuid major override would violate sockjs's declared range.
- **Owner:** PDFweave maintainers.
- **Expires:** 2026-10-31.
- **Removal:** update when Docusaurus adopts a webpack development server that
  removes the vulnerable chain.

## Commands

```bash
npx --yes npm@11.12.1 audit --omit=dev --audit-level=high
npx --yes npm@11.12.1 --prefix playground audit --omit=dev --audit-level=high
npx --yes npm@11.12.1 --prefix website audit --omit=dev --audit-level=high
```

The playground command remains non-zero only for its time-bounded exception.
