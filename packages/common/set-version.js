import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VERSION = 'x.x.x';

// The generated `src/version.ts` exports `PDFWEAVE_VERSION` as the
// canonical name and re-exports it as `PDFME_VERSION` for one
// major-version backward-compatibility window. Both names resolve to
// the same string. The generated file is gitignored, so the rationale
// lives here.
const VERSION_TEMPLATE = (version) => `// Public API: \`PDFWEAVE_VERSION\` is the canonical exported version
// constant from \`@pdfweave/common\`. The previous name \`PDFME_VERSION\`
// is kept as a deprecated alias for one major-version compatibility
// window (see set-version.js).
export const PDFWEAVE_VERSION = '${version}';

/**
 * @deprecated Use \`PDFWEAVE_VERSION\`. This alias is preserved for
 * one major-version compatibility window with consumers that imported
 * \`PDFME_VERSION\` before the independence sweep.
 */
export const PDFME_VERSION = PDFWEAVE_VERSION;
`;

const updateVersion = (version) => {
  const filePath = path.join(__dirname, 'src/version.ts');
  fs.writeFileSync(filePath, VERSION_TEMPLATE(version), 'utf8');
  console.log(`Replaced PDFWEAVE_VERSION with '${version}' in ${filePath}`);
};

const getLatestGitTag = () => {
  try {
    return execFileSync(
      'git',
      ['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)', '--count=1', 'refs/tags'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    return '';
  }
};

updateVersion(getLatestGitTag() || DEFAULT_VERSION);
