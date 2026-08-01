import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(repoRoot, 'docs', 'testing', 'qualification-cases.json');
const outputPath = path.join(repoRoot, 'test-artifacts', 'qualification-report.html');
const validEvidenceKinds = new Set(['visual', 'hybrid', 'logic']);
const catalogIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,127})$/;
const artifactFilenamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,254})$/;

const fail = (message) => {
  throw new Error(`[@pdfweave/qualification-report] ${message}`);
};

export const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const resolveRepositoryPath = (relativePath) => {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    fail(`Invalid repository-relative path: ${String(relativePath)}`);
  }
  const resolved = path.resolve(repoRoot, relativePath);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    fail(`Path escapes the repository: ${relativePath}`);
  }
  return resolved;
};

const assertUniqueIds = (items, label) => {
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || item.id.length === 0) {
      fail(`${label} contains an item without an id`);
    }
    if (!catalogIdPattern.test(item.id)) {
      fail(`${label} contains invalid id '${item.id}'`);
    }
    if (ids.has(item.id)) fail(`${label} contains duplicate id '${item.id}'`);
    ids.add(item.id);
  }
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
};

const assertArtifactFilename = (value, extension, label) => {
  if (!artifactFilenamePattern.test(value) || !value.toLowerCase().endsWith(extension)) {
    fail(`${label} must be a safe ${extension} filename`);
  }
};

export const serializeInlineScriptData = (value) =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');

export const validateCatalog = (catalog) => {
  if (!catalog || typeof catalog !== 'object') fail('Catalog must be an object');
  if (catalog.schemaVersion !== 1) fail('Unsupported catalog schemaVersion');
  assertNonEmptyString(catalog.title, 'Catalog title');
  assertNonEmptyString(catalog.description, 'Catalog description');
  if (!Array.isArray(catalog.features) || !Array.isArray(catalog.scenarios)) {
    fail('Catalog requires features and scenarios arrays');
  }
  assertUniqueIds(catalog.features, 'features');
  assertUniqueIds(catalog.scenarios, 'scenarios');

  for (const scenario of catalog.scenarios) {
    for (const field of ['id', 'title', 'description', 'artifactDirectory', 'pdf', 'manifest']) {
      assertNonEmptyString(scenario[field], `Scenario '${scenario.id ?? 'unknown'}' ${field}`);
    }
    assertArtifactFilename(scenario.pdf, '.pdf', `Scenario '${scenario.id}' PDF`);
    assertArtifactFilename(scenario.manifest, '.json', `Scenario '${scenario.id}' manifest`);
  }

  const scenarioIds = new Set(catalog.scenarios.map((scenario) => scenario.id));
  for (const feature of catalog.features) {
    for (const field of ['id', 'category', 'name', 'definition']) {
      assertNonEmptyString(feature[field], `Feature '${feature.id ?? 'unknown'}' ${field}`);
    }
    if (!validEvidenceKinds.has(feature.evidenceKind)) {
      fail(`Feature '${feature.id}' has invalid evidenceKind '${String(feature.evidenceKind)}'`);
    }
    if (
      !Array.isArray(feature.assertions) ||
      feature.assertions.length === 0 ||
      feature.assertions.some(
        (assertion) => typeof assertion !== 'string' || assertion.length === 0,
      )
    ) {
      fail(`Feature '${feature.id}' has invalid assertions`);
    }
    if (!Array.isArray(feature.tests) || feature.tests.length === 0) {
      fail(`Feature '${feature.id}' has no test definitions`);
    }
    for (const testReference of feature.tests) {
      if (
        !testReference ||
        typeof testReference.file !== 'string' ||
        testReference.file.length === 0 ||
        typeof testReference.title !== 'string' ||
        testReference.title.length === 0
      ) {
        fail(`Feature '${feature.id}' has an invalid test reference`);
      }
    }
    if (!Array.isArray(feature.scenarios) || feature.scenarios.length === 0) {
      fail(`Feature '${feature.id}' has no PDF evidence reference`);
    }
    for (const scenarioId of feature.scenarios) {
      if (!scenarioIds.has(scenarioId)) {
        fail(`Feature '${feature.id}' references unknown scenario '${String(scenarioId)}'`);
      }
    }
  }
  return catalog;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getRevision = () => {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return dirty ? `${commit} + local changes` : commit;
  } catch {
    return 'unknown';
  }
};

const sourceCache = new Map();

const getSourceFile = async (relativePath) => {
  const cached = sourceCache.get(relativePath);
  if (cached) return cached;
  const absolutePath = resolveRepositoryPath(relativePath);
  const text = await readFile(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const result = { text, sourceFile };
  sourceCache.set(relativePath, result);
  return result;
};

const normalizePath = (value) => value.split(path.sep).join('/').replace(/^\.\//, '');

export const parseJUnitReport = (xml, reportPath, root = repoRoot) => {
  const document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  const parserError = document.querySelector('parsererror');
  if (parserError) fail(`Invalid JUnit XML in ${normalizePath(path.relative(root, reportPath))}`);

  return [...document.querySelectorAll('testcase')].map((testcase) => {
    const suite = testcase.closest('testsuite');
    const classname = testcase.getAttribute('classname') || suite?.getAttribute('name');
    const name = testcase.getAttribute('name');
    if (!classname || !name) {
      fail(
        `JUnit testcase in ${normalizePath(path.relative(root, reportPath))} needs classname and name`,
      );
    }
    const failure = testcase.querySelector('failure, error');
    const skipped = testcase.querySelector('skipped');
    const status = failure ? 'failed' : skipped ? 'skipped' : 'passed';
    const candidate = classname.replace(/^file:\/\//, '');
    const absoluteCandidate = path.isAbsolute(candidate)
      ? candidate
      : candidate.startsWith('packages/')
        ? path.resolve(root, candidate)
        : path.resolve(path.dirname(reportPath), candidate);
    return {
      file: normalizePath(path.relative(root, absoluteCandidate)),
      fullTitle: name,
      status,
      durationSeconds: Number(testcase.getAttribute('time') ?? 0),
      message: failure?.getAttribute('message') || failure?.textContent?.trim() || undefined,
    };
  });
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const testTitlePattern = (template) => {
  const tokenPattern = /%%|%[sdifjoO#$]|\$[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/g;
  let source = '';
  let cursor = 0;
  for (const match of template.matchAll(tokenPattern)) {
    source += escapeRegExp(template.slice(cursor, match.index));
    const token = match[0];
    source += token === '%%' ? '%' : token === '%#' || token === '%$' ? '\\d+' : '.+?';
    cursor = match.index + token.length;
  }
  source += escapeRegExp(template.slice(cursor));
  return new RegExp(`(?:^| > )${source}$`);
};

export const mapTestReference = (testReference, testCases) => {
  const file = normalizePath(testReference.file);
  const titlePattern = testTitlePattern(testReference.title);
  const matches = testCases.filter(
    (testCase) => normalizePath(testCase.file) === file && titlePattern.test(testCase.fullTitle),
  );
  let status = 'missing';
  if (matches.some((testCase) => testCase.status === 'failed')) status = 'failed';
  else if (matches.some((testCase) => testCase.status === 'skipped')) status = 'skipped';
  else if (matches.length > 0 && matches.every((testCase) => testCase.status === 'passed')) {
    status = 'passed';
  }
  return { ...testReference, status, cases: matches };
};

export const deriveFeatureStatus = (tests) => {
  if (tests.some((test) => test.status === 'failed')) return 'failed';
  if (tests.some((test) => test.status === 'missing')) return 'missing';
  if (tests.some((test) => test.status === 'skipped')) return 'skipped';
  return tests.length > 0 && tests.every((test) => test.status === 'passed') ? 'passed' : 'unknown';
};

const testCalleeNames = new Set(['test', 'it']);

const getRootCalleeName = (expression) => {
  let node = expression;
  while (true) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
      node = node.expression;
      continue;
    }
    return undefined;
  }
};

const extractTestCall = (text, sourceFile, title) => {
  const matches = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callTitle = node.arguments[0];
      const calleeName = getRootCalleeName(node.expression);
      if (
        ts.isStringLiteralLike(callTitle) &&
        callTitle.text === title &&
        calleeName !== undefined &&
        testCalleeNames.has(calleeName)
      ) {
        matches.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (matches.length !== 1) return { matches };
  const node = matches[0];
  const start = node.getStart(sourceFile);
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    matches,
    definition: {
      line: line + 1,
      source: text.slice(start, node.getEnd()),
    },
  };
};

export const extractTestCallFromSource = (text, file, title) => {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const { matches, definition } = extractTestCall(text, sourceFile, title);
  if (matches.length !== 1) {
    fail(`Expected one test titled '${title}' in ${file}, found ${String(matches.length)}`);
  }
  return definition;
};

const extractTestDefinition = async (testReference) => {
  if (
    !testReference ||
    typeof testReference.file !== 'string' ||
    typeof testReference.title !== 'string'
  ) {
    fail('Every test reference requires file and title strings');
  }
  const { text, sourceFile } = await getSourceFile(testReference.file);
  const { matches, definition } = extractTestCall(text, sourceFile, testReference.title);

  if (matches.length !== 1) {
    fail(
      `Expected one test titled '${testReference.title}' in ${testReference.file}, found ${String(matches.length)}`,
    );
  }
  return {
    ...testReference,
    ...definition,
  };
};

export const resolveArtifactPath = (directory, relativePath, label) => {
  if (path.isAbsolute(relativePath)) fail(`${label} must be relative to its artifact directory`);
  const resolved = path.resolve(directory, relativePath);
  if (resolved !== directory && !resolved.startsWith(`${directory}${path.sep}`)) {
    fail(`${label} escapes its artifact directory`);
  }
  return resolved;
};

export const loadScenario = async (scenario) => {
  try {
    const directory = resolveRepositoryPath(scenario.artifactDirectory);
    const pdfPath = resolveArtifactPath(directory, scenario.pdf, `Scenario '${scenario.id}' PDF`);
    const manifestPath = resolveArtifactPath(
      directory,
      scenario.manifest,
      `Scenario '${scenario.id}' manifest`,
    );
    const [pdf, manifestText, directoryEntries] = await Promise.all([
      readFile(pdfPath),
      readFile(manifestPath, 'utf8'),
      readdir(directory, { withFileTypes: true }),
    ]);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      fail(`Scenario '${scenario.id}' does not contain a valid PDF header`);
    }
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch (error) {
      fail(`Scenario '${scenario.id}' has invalid manifest JSON: ${error.message}`);
    }
    const previewNames = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
      .map((entry) => entry.name)
      .sort();
    if (previewNames.length === 0) fail(`Scenario '${scenario.id}' has no PNG previews`);
    const previews = await Promise.all(
      previewNames.map(async (name) => {
        const bytes = await readFile(path.join(directory, name));
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!bytes.subarray(0, 8).equals(pngSignature)) {
          fail(`Scenario '${scenario.id}' preview '${name}' is not a PNG`);
        }
        return { name, bytes, base64: bytes.toString('base64') };
      }),
    );
    const expectedPreviewCount =
      manifest.pageCount ?? manifest.sheetCount ?? manifest.output?.sheetPngBytes?.length;
    if (
      typeof expectedPreviewCount === 'number' &&
      Number.isInteger(expectedPreviewCount) &&
      expectedPreviewCount !== previews.length
    ) {
      fail(
        `Scenario '${scenario.id}' expected ${String(expectedPreviewCount)} previews, found ${String(previews.length)}`,
      );
    }
    const digest = sha256(pdf);
    if (manifest.output?.pdfSha256 && manifest.output.pdfSha256 !== digest) {
      fail(`Scenario '${scenario.id}' PDF hash does not match its manifest`);
    }
    return {
      ...scenario,
      available: true,
      pdfBytes: pdf.length,
      pdfSha256: digest,
      pdfBase64: pdf.toString('base64'),
      manifest,
      manifestText: `${JSON.stringify(manifest, null, 2)}\n`,
      previews,
    };
  } catch (error) {
    return {
      ...scenario,
      available: false,
      error: error instanceof Error ? error.message : String(error),
      previews: [],
    };
  }
};

const evidenceLabel = (kind) => {
  if (kind === 'visual') return 'Visual + automated';
  if (kind === 'hybrid') return 'Visual + logic';
  return 'Logic-only assertion';
};

const resultLabel = (status) => {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'missing') return 'Result missing';
  return 'Unknown';
};

const renderTest = (test) => `
  <details class="test-definition">
    <summary>
      <span class="test-title">${escapeHtml(test.title)}</span>
      <span class="source-ref">${escapeHtml(test.file)}:${String(test.line)}</span>
      <span class="test-result result-${escapeHtml(test.status)}">${resultLabel(test.status)}${test.cases.length > 1 ? ` (${String(test.cases.length)} cases)` : ''}</span>
    </summary>
    ${
      test.cases.length > 0
        ? `<ol class="case-results">${test.cases
            .map(
              (testCase) =>
                `<li><span class="result-${escapeHtml(testCase.status)}">${resultLabel(testCase.status)}</span> <code>${escapeHtml(testCase.fullTitle)}</code>${testCase.message ? `<pre><code>${escapeHtml(testCase.message)}</code></pre>` : ''}</li>`,
            )
            .join('')}</ol>`
        : '<p class="missing-result">No matching JUnit testcase was collected for this definition.</p>'
    }
    <pre><code>${escapeHtml(test.source)}</code></pre>
  </details>`;

const renderFeature = (feature, scenariosById) => {
  const scenarioLinks = feature.scenarios
    .map((id) => {
      const scenario = scenariosById.get(id);
      return `<a class="evidence-link${scenario.available ? '' : ' unavailable'}" href="#evidence-${escapeHtml(id)}">${escapeHtml(scenario.title)}${scenario.available ? '' : ' (unavailable)'}</a>`;
    })
    .join('');
  const evidenceAvailable = feature.scenarios.every((id) => scenariosById.get(id).available);
  return `
  <article class="feature-row" id="feature-${escapeHtml(feature.id)}" data-category="${escapeHtml(feature.category)}" data-search="${escapeHtml(`${feature.name} ${feature.definition} ${feature.assertions.join(' ')} ${feature.tests.map((test) => test.title).join(' ')}`.toLowerCase())}">
    <div class="feature-summary">
      <div class="category">${escapeHtml(feature.category)}</div>
      <h3>${escapeHtml(feature.name)}</h3>
      <span class="feature-result result-${escapeHtml(feature.status)}">${resultLabel(feature.status)}</span>
      <span class="evidence-kind evidence-${escapeHtml(feature.evidenceKind)}">${evidenceLabel(feature.evidenceKind)}</span>
      <span class="evidence-result ${evidenceAvailable ? 'evidence-available' : 'evidence-unavailable'}">${evidenceAvailable ? 'Evidence available' : 'Evidence unavailable'}</span>
    </div>
    <div class="feature-definition">
      <p>${escapeHtml(feature.definition)}</p>
      <ul>${feature.assertions.map((assertion) => `<li>${escapeHtml(assertion)}</li>`).join('')}</ul>
      <div class="evidence-links">${scenarioLinks}</div>
    </div>
    <div class="test-list">
      ${feature.tests.map(renderTest).join('')}
    </div>
  </article>`;
};

const renderScenario = (scenario) => {
  if (!scenario.available) {
    return `
  <article class="evidence-item evidence-error" id="evidence-${escapeHtml(scenario.id)}">
    <header class="evidence-header">
      <div>
        <div class="category">PDF evidence unavailable</div>
        <h3>${escapeHtml(scenario.title)}</h3>
        <p>${escapeHtml(scenario.description)}</p>
      </div>
    </header>
    <p class="artifact-error"><strong>Artifact error:</strong> ${escapeHtml(scenario.error)}</p>
  </article>`;
  }
  return `
  <article class="evidence-item" id="evidence-${escapeHtml(scenario.id)}">
    <header class="evidence-header">
      <div>
        <div class="category">PDF evidence</div>
        <h3>${escapeHtml(scenario.title)}</h3>
        <p>${escapeHtml(scenario.description)}</p>
      </div>
      <div class="evidence-actions">
        <a class="command primary" href="#evidence-${escapeHtml(scenario.id)}" data-pdf-id="${escapeHtml(scenario.id)}" target="_blank" rel="noreferrer">Open PDF</a>
        <a class="command" href="#evidence-${escapeHtml(scenario.id)}" data-pdf-id="${escapeHtml(scenario.id)}" download="${escapeHtml(scenario.pdf)}">Download</a>
      </div>
    </header>
    <dl class="artifact-meta">
      <div><dt>Pages</dt><dd>${String(scenario.previews.length)}</dd></div>
      <div><dt>PDF size</dt><dd>${formatBytes(scenario.pdfBytes)}</dd></div>
      <div class="hash"><dt>SHA-256</dt><dd><code>${scenario.pdfSha256}</code></dd></div>
    </dl>
    <div class="preview-strip">
      ${scenario.previews
        .map(
          (preview, index) => `
        <a href="data:image/png;base64,${preview.base64}" target="_blank" rel="noreferrer" class="preview">
          <img src="data:image/png;base64,${preview.base64}" alt="${escapeHtml(scenario.title)} page ${String(index + 1)}" loading="lazy">
          <span>Page ${String(index + 1)}</span>
        </a>`,
        )
        .join('')}
    </div>
    <details class="manifest">
      <summary>Inspect manifest</summary>
      <pre><code>${escapeHtml(scenario.manifestText)}</code></pre>
    </details>
  </article>`;
};

export const buildHtml = ({
  catalog,
  features,
  scenarios,
  runOutcome,
  revision,
  generatedAt,
  testCaseCount = 0,
  resultErrors = [],
}) => {
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const categories = [...new Set(features.map((feature) => feature.category))].sort();
  const uniqueTests = new Set(
    features.flatMap((feature) => feature.tests.map((test) => `${test.file}\u0000${test.title}`)),
  );
  const visualFeatures = features.filter((feature) => feature.evidenceKind !== 'logic').length;
  const availableScenarios = scenarios.filter((scenario) => scenario.available).length;
  const featureStatuses = features.map((feature) => feature.status);
  const qualificationStatus =
    runOutcome === 'failed' || featureStatuses.some((status) => status === 'failed')
      ? 'failed'
      : runOutcome === 'passed' &&
          featureStatuses.length > 0 &&
          featureStatuses.every((status) => status === 'passed') &&
          availableScenarios === scenarios.length
        ? 'passed'
        : 'incomplete';
  const statusClass = qualificationStatus === 'incomplete' ? 'unknown' : qualificationStatus;
  const statusLabel =
    qualificationStatus === 'passed'
      ? 'Passed'
      : qualificationStatus === 'failed'
        ? 'Failed'
        : 'Incomplete';
  const runLabel = resultLabel(runOutcome);
  const pdfAssets = Object.fromEntries(
    scenarios
      .filter((scenario) => scenario.available)
      .map((scenario) => [scenario.id, { base64: scenario.pdfBase64 }]),
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(catalog.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17212b;
      --muted: #5b6772;
      --line: #d5dce1;
      --soft: #f4f7f8;
      --paper: #ffffff;
      --teal: #0b5f69;
      --teal-soft: #e2f2f1;
      --green: #176b45;
      --green-soft: #e4f3e9;
      --red: #9d2d32;
      --red-soft: #f9e8e8;
      --amber: #805600;
      --amber-soft: #fbf1d8;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; color: var(--ink); background: var(--paper); font-size: 14px; line-height: 1.5; }
    a { color: var(--teal); }
    a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid #8dc9cf; outline-offset: 2px; }
    .shell { width: min(1480px, calc(100% - 40px)); margin: 0 auto; }
    .topbar { border-bottom: 1px solid var(--line); background: #132a32; color: #fff; }
    .topbar .shell { min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .brand { font-size: 18px; font-weight: 750; }
    .topbar nav { display: flex; gap: 18px; }
    .topbar a { color: #d8eff1; text-decoration: none; font-weight: 650; }
    .report-header { padding: 34px 0 28px; border-bottom: 1px solid var(--line); }
    .report-header h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
    .report-header p { margin: 0; max-width: 860px; color: var(--muted); font-size: 16px; }
    .run-meta { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 12px 22px; color: var(--muted); }
    .result-errors { margin-top: 18px; padding: 14px 18px; color: var(--red); background: var(--red-soft); border: 1px solid #e7b5b7; border-radius: 4px; }
    .result-errors ul { margin: 6px 0 0; padding-left: 20px; }
    .status { display: inline-flex; align-items: center; gap: 7px; font-weight: 750; }
    .status::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--amber); }
    .status.passed { color: var(--green); }
    .status.passed::before { background: var(--green); }
    .status.failed { color: var(--red); }
    .status.failed::before { background: var(--red); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
    .metric { padding: 20px 24px; border-right: 1px solid var(--line); }
    .metric:first-child { padding-left: 0; }
    .metric:last-child { border-right: 0; }
    .metric strong { display: block; font-size: 24px; line-height: 1.1; }
    .metric span { color: var(--muted); }
    main section { padding: 34px 0; }
    main section + section { border-top: 1px solid var(--line); }
    .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .section-heading h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0; }
    .section-heading p { margin: 0; color: var(--muted); }
    .filters { display: flex; gap: 10px; align-items: end; }
    .control { display: grid; gap: 4px; }
    .control label { color: var(--muted); font-size: 12px; font-weight: 700; }
    input, select { min-height: 38px; border: 1px solid #aeb9c1; border-radius: 4px; background: #fff; color: var(--ink); padding: 7px 10px; font: inherit; }
    input { width: min(320px, 42vw); }
    button { min-height: 38px; border: 1px solid #aeb9c1; border-radius: 4px; background: #fff; color: var(--ink); padding: 7px 12px; font: inherit; cursor: pointer; }
    .feature-head, .feature-row { display: grid; grid-template-columns: minmax(180px, 0.8fr) minmax(300px, 1.4fr) minmax(360px, 1.6fr); gap: 24px; }
    .feature-head { padding: 0 14px 9px; border-bottom: 2px solid #9aa8b1; color: var(--muted); font-size: 12px; font-weight: 750; text-transform: uppercase; }
    .feature-row { padding: 22px 14px; border-bottom: 1px solid var(--line); scroll-margin-top: 18px; }
    .feature-row[hidden] { display: none; }
    .category { color: var(--teal); font-size: 11px; font-weight: 800; text-transform: uppercase; }
    h3 { margin: 4px 0 8px; font-size: 17px; line-height: 1.3; letter-spacing: 0; }
    .feature-result, .evidence-kind, .evidence-result, .test-result { display: inline-block; margin: 0 5px 5px 0; padding: 3px 7px; border-radius: 4px; font-size: 11px; font-weight: 750; }
    .result-passed { color: var(--green); background: var(--green-soft); }
    .result-failed { color: var(--red); background: var(--red-soft); }
    .result-unknown, .result-missing, .result-skipped { color: var(--amber); background: var(--amber-soft); }
    .evidence-visual { color: var(--green); background: var(--green-soft); }
    .evidence-hybrid { color: var(--teal); background: var(--teal-soft); }
    .evidence-logic { color: var(--amber); background: var(--amber-soft); }
    .evidence-available { color: var(--green); background: var(--green-soft); }
    .evidence-unavailable { color: var(--red); background: var(--red-soft); }
    .feature-definition p { margin: 0 0 9px; }
    .feature-definition ul { margin: 0; padding-left: 19px; color: var(--muted); }
    .evidence-links { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
    .evidence-link { font-weight: 700; text-decoration: none; border-bottom: 1px solid #82b7bd; }
    .evidence-link.unavailable { color: var(--red); border-bottom-color: #d7989b; }
    .test-list { min-width: 0; }
    .test-definition { border-top: 1px solid var(--line); }
    .test-definition:last-child { border-bottom: 1px solid var(--line); }
    summary { cursor: pointer; }
    .test-definition summary { display: grid; gap: 3px; padding: 8px 2px; }
    .test-title { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .source-ref { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
    .test-result { width: fit-content; }
    .case-results { margin: 0; padding: 10px 14px 10px 34px; border-top: 1px solid var(--line); }
    .case-results li + li { margin-top: 5px; }
    .case-results span { font-weight: 750; }
    .missing-result, .artifact-error { margin: 0; padding: 14px 18px; color: var(--red); background: var(--red-soft); }
    pre { margin: 0; padding: 14px; overflow: auto; background: #101b22; color: #dce9ee; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; }
    .empty-state { padding: 28px 14px; color: var(--muted); border-bottom: 1px solid var(--line); }
    .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .evidence-item { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; scroll-margin-top: 18px; }
    .evidence-header { display: flex; justify-content: space-between; gap: 20px; padding: 18px; border-bottom: 1px solid var(--line); }
    .evidence-header p { margin: 0; color: var(--muted); }
    .evidence-actions { display: flex; gap: 8px; align-items: start; flex: 0 0 auto; }
    .command { display: inline-flex; align-items: center; min-height: 36px; padding: 7px 10px; border: 1px solid #97a7b0; border-radius: 4px; text-decoration: none; font-weight: 750; cursor: pointer; }
    .command.primary { color: #fff; background: var(--teal); border-color: var(--teal); }
    .artifact-meta { display: grid; grid-template-columns: 90px 110px minmax(0, 1fr); margin: 0; padding: 11px 18px; background: var(--soft); border-bottom: 1px solid var(--line); }
    .artifact-meta div { min-width: 0; }
    .artifact-meta dt { color: var(--muted); font-size: 11px; }
    .artifact-meta dd { margin: 1px 0 0; font-weight: 700; }
    .artifact-meta .hash code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .preview-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1px; background: var(--line); }
    .preview { min-width: 0; padding: 10px; background: #eef2f3; color: var(--ink); text-decoration: none; }
    .preview img { display: block; width: 100%; height: 180px; object-fit: contain; background: #dfe5e7; }
    .preview span { display: block; margin-top: 5px; font-size: 11px; text-align: center; }
    .manifest { border-top: 1px solid var(--line); }
    .manifest summary { padding: 11px 18px; font-weight: 750; }
    footer { padding: 28px 0 42px; border-top: 1px solid var(--line); color: var(--muted); }
    @media (max-width: 980px) {
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .metric:nth-child(2) { border-right: 0; }
      .feature-head { display: none; }
      .feature-row { grid-template-columns: 1fr; gap: 14px; }
      .evidence-grid { grid-template-columns: 1fr; }
      .section-heading { align-items: stretch; flex-direction: column; }
      .filters { flex-wrap: wrap; }
    }
    @media (max-width: 620px) {
      .shell { width: min(100% - 24px, 1480px); }
      .topbar .shell, .evidence-header { align-items: flex-start; flex-direction: column; }
      .topbar .shell { padding: 14px 0; }
      .report-header h1 { font-size: 25px; }
      .metrics { grid-template-columns: 1fr 1fr; }
      .metric { padding: 16px 12px; }
      input { width: calc(100vw - 48px); }
      .filters { align-items: stretch; }
      .control { width: 100%; }
      select { width: 100%; }
      .artifact-meta { grid-template-columns: 1fr 1fr; gap: 8px; }
      .artifact-meta .hash { grid-column: 1 / -1; }
      .evidence-actions { width: 100%; }
      .command { justify-content: center; flex: 1; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="shell">
      <div class="brand">PDFweave Qualification Report</div>
      <nav aria-label="Report sections"><a href="#features">Features</a><a href="#evidence">PDF evidence</a></nav>
    </div>
  </header>
  <div class="report-header">
    <div class="shell">
      <h1>${escapeHtml(catalog.title)}</h1>
      <p>${escapeHtml(catalog.description)}</p>
      <div class="run-meta">
        <span class="status ${statusClass}">Feature qualification: ${statusLabel}</span>
        <span>Package feature-test command: <strong>${runLabel}</strong></span>
        <span>JUnit testcases read: <strong>${String(testCaseCount)}</strong></span>
        <span>Report revision: <code>${escapeHtml(revision)}</code></span>
        <span>Generated: <time datetime="${escapeHtml(generatedAt)}">${escapeHtml(generatedAt)}</time></span>
        <span>Node: <code>${escapeHtml(process.version)}</code></span>
      </div>
    </div>
  </div>
  ${
    resultErrors.length > 0
      ? `<div class="shell result-errors"><strong>Test result warnings</strong><ul>${resultErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>`
      : ''
  }
  <div class="shell metrics" aria-label="Qualification summary">
    <div class="metric"><strong>${String(features.length)}</strong><span>catalogued features</span></div>
    <div class="metric"><strong>${String(uniqueTests.size)}</strong><span>traceable test definitions</span></div>
    <div class="metric"><strong>${String(visualFeatures)}</strong><span>features with visual evidence</span></div>
    <div class="metric"><strong>${String(availableScenarios)}/${String(scenarios.length)}</strong><span>clickable PDFs available</span></div>
  </div>
  <main>
    <section id="features">
      <div class="shell">
        <div class="section-heading">
          <div><h2>Feature qualification</h2><p>Expand any test to inspect the exact executable definition.</p></div>
          <div class="filters" aria-label="Feature filters">
            <div class="control"><label for="feature-search">Search</label><input id="feature-search" type="search" placeholder="Feature or test name"></div>
            <div class="control"><label for="category-filter">Category</label><select id="category-filter"><option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}</select></div>
            <button id="clear-filters" type="button">Clear filters</button>
          </div>
        </div>
        <div class="feature-head"><span>Feature</span><span>Definition and assertions</span><span>Executable tests</span></div>
        <div id="feature-list">${features.map((feature) => renderFeature(feature, scenariosById)).join('')}</div>
        <div id="empty-state" class="empty-state" hidden>No features match the current filters.</div>
      </div>
    </section>
    <section id="evidence">
      <div class="shell">
        <div class="section-heading"><div><h2>PDF evidence library</h2><p>Open the PDF, inspect every rasterized page, or expand its machine-readable manifest.</p></div></div>
        <div class="evidence-grid">${scenarios.map(renderScenario).join('')}</div>
      </div>
    </section>
  </main>
  <footer><div class="shell">Generated from <code>docs/testing/qualification-cases.json</code> and Vitest JUnit results. Coverage and CRAP are separate CI gates and are not represented by the feature-test command status.</div></footer>
  <script>
    const pdfAssets = ${serializeInlineScriptData(pdfAssets)};
    const decodeBase64 = (value) => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    };
    const pdfLinks = [...document.querySelectorAll('[data-pdf-id]')];
    for (const [id, asset] of Object.entries(pdfAssets)) {
      const url = URL.createObjectURL(new Blob([decodeBase64(asset.base64)], { type: 'application/pdf' }));
      for (const link of pdfLinks) {
        if (link.dataset.pdfId === id) link.href = url;
      }
    }
    const search = document.querySelector('#feature-search');
    const category = document.querySelector('#category-filter');
    const rows = [...document.querySelectorAll('.feature-row')];
    const emptyState = document.querySelector('#empty-state');
    const applyFilters = () => {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const matchesSearch = query.length === 0 || row.dataset.search.includes(query);
        const matchesCategory = category.value.length === 0 || row.dataset.category === category.value;
        row.hidden = !(matchesSearch && matchesCategory);
        if (!row.hidden) visible += 1;
      }
      emptyState.hidden = visible !== 0;
    };
    search.addEventListener('input', applyFilters);
    category.addEventListener('change', applyFilters);
    document.querySelector('#clear-filters').addEventListener('click', () => {
      search.value = '';
      category.value = '';
      applyFilters();
      search.focus();
    });
  </script>
</body>
</html>`;
};

const discoverJUnitPaths = async () => {
  const packagesDirectory = path.join(repoRoot, 'packages');
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDirectory, entry.name, 'test-results.xml'));
};

const loadJUnitResults = async () => {
  const argumentPaths = process.argv
    .slice(2)
    .filter((argument) => argument.startsWith('--junit='))
    .map((argument) => argument.slice('--junit='.length));
  const environmentPaths = (process.env.QUALIFICATION_JUNIT_PATHS ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  const configuredPaths = [...argumentPaths, ...environmentPaths];
  const candidates =
    configuredPaths.length > 0
      ? configuredPaths.map((candidate) => resolveRepositoryPath(candidate))
      : await discoverJUnitPaths();
  const testCases = [];
  const errors = [];
  const loadedPaths = [];

  for (const reportPath of candidates) {
    let xml;
    try {
      xml = await readFile(reportPath, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
      errors.push(
        `Could not read ${normalizePath(path.relative(repoRoot, reportPath))}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (xml.trim().length === 0) {
      errors.push(`${normalizePath(path.relative(repoRoot, reportPath))} is empty`);
      continue;
    }
    try {
      testCases.push(...parseJUnitReport(xml, reportPath));
      loadedPaths.push(reportPath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (loadedPaths.length === 0) errors.push('No readable Vitest JUnit reports were found');
  return { testCases, errors, loadedPaths };
};

const normalizeRunOutcome = (value) => {
  if (value === 'success' || value === 'passed') return 'passed';
  if (value === 'failure' || value === 'failed' || value === 'cancelled') return 'failed';
  return 'unknown';
};

export const resolveRunOutcome = ({
  cliArguments = process.argv.slice(2),
  environment = process.env,
} = {}) => {
  const statusArgument = cliArguments
    .find((argument) => argument.startsWith('--status='))
    ?.slice('--status='.length);
  return normalizeRunOutcome(statusArgument ?? environment.QUALIFICATION_TEST_STATUS ?? 'unknown');
};

export const assertQualificationGate = ({ runOutcome, features, scenarios }) => {
  if (runOutcome !== 'passed') return;
  const incompleteFeatures = features.filter((feature) => feature.status !== 'passed');
  const unavailableScenarios = scenarios.filter((scenario) => !scenario.available);
  if (incompleteFeatures.length === 0 && unavailableScenarios.length === 0) return;

  const details = [
    incompleteFeatures.length > 0
      ? `${String(incompleteFeatures.length)} feature result(s) are not passed`
      : undefined,
    unavailableScenarios.length > 0
      ? `${String(unavailableScenarios.length)} PDF evidence artifact(s) are unavailable`
      : undefined,
  ].filter(Boolean);
  fail(`Qualification report is incomplete after a successful test run: ${details.join('; ')}`);
};

export const main = async () => {
  const catalog = validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
  const junit = await loadJUnitResults();
  const scenarios = await Promise.all(catalog.scenarios.map(loadScenario));
  const features = await Promise.all(
    catalog.features.map(async (feature) => {
      const tests = await Promise.all(
        feature.tests.map(async (testReference) =>
          mapTestReference(await extractTestDefinition(testReference), junit.testCases),
        ),
      );
      return { ...feature, tests, status: deriveFeatureStatus(tests) };
    }),
  );
  const runOutcome = resolveRunOutcome();
  const generatedAt = new Date().toISOString();
  const html = buildHtml({
    catalog,
    features,
    scenarios,
    runOutcome,
    revision: getRevision(),
    generatedAt,
    testCaseCount: junit.testCases.length,
    resultErrors: junit.errors,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  process.stdout.write(
    `Qualification report: ${path.relative(repoRoot, outputPath)} (${String(features.length)} features, ${String(scenarios.length)} PDFs, ${formatBytes(Buffer.byteLength(html))})\n`,
  );
  assertQualificationGate({ runOutcome, features, scenarios });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
