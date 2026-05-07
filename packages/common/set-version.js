import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VERSION = 'x.x.x';

// Compat (kept as `PDFME_VERSION`): the generated `src/version.ts`
// re-exports this name as a public API constant. Consumers import
// `PDFME_VERSION` from `@pdfweave/common` to stamp the engine version
// into stored templates (see `Template.pdfmeVersion`). Renaming would
// be a breaking API change. The generated file is gitignored, so this
// rationale lives here.
// See docs/branding-audit-2026-05-07.md.
const VERSION_HEADER = [
  '// Public API: `PDFME_VERSION` is exported from `@pdfweave/common`.',
  '// The name is preserved for backward compatibility with consumers',
  '// that imported it before the pdfme→pdfweave fork rename.',
  '// See docs/branding-audit-2026-05-07.md.',
].join('\n');

const updateVersion = (version) => {
  const filePath = path.join(__dirname, 'src/version.ts');
  let content = '';

  if (!fs.existsSync(filePath)) {
    content = `${VERSION_HEADER}\nexport const PDFME_VERSION = '${version}';\n`;
  } else {
    content = fs.readFileSync(filePath, 'utf8');
    const versionRegex = /export const PDFME_VERSION = '.*';/;
    if (versionRegex.test(content)) {
      content = content.replace(versionRegex, `export const PDFME_VERSION = '${version}';`);
    } else {
      content += `\nexport const PDFME_VERSION = '${version}';\n`;
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Replaced PDFME_VERSION with '${version}' in ${filePath}`);
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
