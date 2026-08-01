# PDFweave release setup (one-time)

To enable token-free CI publishing via GitHub OIDC trusted publishers:

1. Log into npmjs.com as the `pdfweave` org owner (currently `lsadehaan`).

2. For each package below, go to `https://www.npmjs.com/package/@pdfweave/<name>/access` and add a Trusted Publisher:

   - Provider: GitHub Actions
   - Repository: `IDNTEQ/pdfweave`
   - Workflow filename: `release.yml`
   - Environment: leave blank unless you decide to add a `release` environment for approval gating

   Packages: `common`, `pdf-lib`, `schemas`, `generator`, `imposition`, `ui`,
   `cli`, `converter`, and `manipulator`.

   npm cannot attach a trusted publisher until a package exists. Before the
   first release containing `@pdfweave/imposition`, publish an authenticated
   prerelease such as `0.4.0-rc.0` under the `next` tag, then configure it:

   ```bash
   npm trust github @pdfweave/imposition \
     --file release.yml \
     --repo IDNTEQ/pdfweave \
     --allow-publish
   npm trust list @pdfweave/imposition
   ```

   Use only the workflow filename in the npm configuration, not its full
   `.github/workflows/` path.

3. After registration, releases trigger via:

   ```bash
   git tag v0.1.1
   git push pdfweave v0.1.1
   ```

   The workflow handles npm publish and GitHub release creation automatically. No `NPM_TOKEN` secret is needed.

4. The `npm_PGkY...` token and any subsequent legacy publish tokens can be revoked at https://www.npmjs.com/settings/lsadehaan/tokens once OIDC is verified working.

## How to test before tagging

The workflow has a `workflow_dispatch` trigger. Use it from the GitHub Actions UI to dry-run the install, build, and test path.

The `publish-npm` and `create-github-release` jobs are guarded to `v*.*.*` tag pushes, so manual dispatch does not publish packages.
