import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  assertQualificationGate,
  buildHtml,
  deriveFeatureStatus,
  extractSupportingDefinitionFromSource,
  extractTestCallFromSource,
  loadScenario,
  mapTestReference,
  parseJUnitReport,
  resolveArtifactPath,
  resolveRepositoryPath,
  resolveRunOutcome,
  serializeInlineScriptData,
  validateCatalog,
} from './build-qualification-report.mjs';

const validOnePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const createMinimalPdf = (pageCount) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${String(pageCount)} /Kids [${Array.from(
      { length: pageCount },
      (_, index) => `${String(index + 3)} 0 R`,
    ).join(' ')}] >>`,
    ...Array.from(
      { length: pageCount },
      () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources << >> >>',
    ),
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
};

const createArtifactFixture = async ({
  pdf = createMinimalPdf(1),
  manifest = { pageCount: 1, output: { pngCount: 1, previewPages: [1] } },
  previews = [['page-001.png', validOnePixelPng]],
} = {}) => {
  const repositoryRoot = resolveRepositoryPath('.');
  const artifactRoot = resolveRepositoryPath('test-artifacts');
  await mkdir(artifactRoot, { recursive: true });
  const directory = await mkdtemp(path.join(artifactRoot, 'scenario-validation-test-'));
  await Promise.all([
    writeFile(path.join(directory, 'artifact.pdf'), pdf),
    writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)),
    ...previews.map(([name, bytes]) => writeFile(path.join(directory, name), bytes)),
  ]);
  return {
    directory,
    scenario: {
      id: 'artifact-validation',
      title: 'Artifact validation',
      description: 'Parser-backed artifact validation',
      artifactDirectory: path.relative(repositoryRoot, directory),
      pdf: 'artifact.pdf',
      manifest: 'manifest.json',
    },
  };
};

const scenario = (overrides = {}) => ({
  id: 'evidence-one',
  title: 'Evidence one',
  description: 'Inspectable output',
  artifactDirectory: 'artifacts/evidence-one',
  pdf: 'evidence-one.pdf',
  manifest: 'manifest.json',
  available: true,
  pdfBytes: 8,
  pdfSha256: 'abc123',
  pdfBase64: Buffer.from('%PDF-1.7').toString('base64'),
  manifestText: '{}\n',
  previews: [{ name: 'page.png', base64: 'iVBORw0KGgo=' }],
  ...overrides,
});

const testDefinition = (overrides = {}) => ({
  file: 'packages/example/__tests__/feature.test.ts',
  title: 'renders the feature',
  line: 12,
  source: "test('renders the feature', () => expect(true).toBe(true))",
  status: 'passed',
  cases: [
    {
      file: 'packages/example/__tests__/feature.test.ts',
      fullTitle: 'feature > renders the feature',
      status: 'passed',
      durationSeconds: 0.01,
    },
  ],
  ...overrides,
});

const feature = (overrides = {}) => ({
  id: 'feature-one',
  category: 'Rendering',
  name: 'Feature one',
  evidenceKind: 'visual',
  definition: 'Renders one feature.',
  assertions: ['The output is visible.'],
  tests: [testDefinition()],
  scenarios: ['evidence-one'],
  status: 'passed',
  ...overrides,
});

const catalog = (overrides = {}) => ({
  schemaVersion: 1,
  title: 'Qualification report',
  description: 'Traceable tests and evidence.',
  scenarios: [
    {
      id: 'evidence-one',
      title: 'Evidence one',
      description: 'Inspectable output',
      artifactDirectory: 'artifacts/evidence-one',
      pdf: 'evidence-one.pdf',
      manifest: 'manifest.json',
    },
  ],
  features: [
    {
      id: 'feature-one',
      category: 'Rendering',
      name: 'Feature one',
      evidenceKind: 'visual',
      definition: 'Renders one feature.',
      assertions: ['The output is visible.'],
      tests: [
        {
          file: 'packages/example/__tests__/feature.test.ts',
          title: 'renders the feature',
        },
      ],
      scenarios: ['evidence-one'],
    },
  ],
  ...overrides,
});

const render = ({ features = [feature()], scenarios = [scenario()], runOutcome = 'passed' } = {}) =>
  buildHtml({
    catalog: catalog(),
    features,
    scenarios,
    runOutcome,
    revision: 'abc123',
    generatedAt: '2026-08-01T00:00:00.000Z',
    testCaseCount: features.flatMap((item) => item.tests).length,
  });

describe('qualification catalog validation', () => {
  test('accepts a valid catalog and rejects duplicate or unknown references', () => {
    assert.equal(validateCatalog(catalog()).schemaVersion, 1);

    const duplicate = catalog();
    duplicate.features.push({ ...duplicate.features[0] });
    assert.throws(() => validateCatalog(duplicate), /duplicate id 'feature-one'/);

    const unknown = catalog();
    unknown.features[0].scenarios = ['missing'];
    assert.throws(() => validateCatalog(unknown), /references unknown scenario 'missing'/);
  });

  test('rejects unsafe catalog ids and artifact filenames', () => {
    const unsafeFeature = catalog();
    unsafeFeature.features[0].id = '</script>';
    assert.throws(() => validateCatalog(unsafeFeature), /features contains invalid id/);

    const unsafeScenario = catalog();
    unsafeScenario.scenarios[0].id = 'evidence one';
    assert.throws(() => validateCatalog(unsafeScenario), /scenarios contains invalid id/);

    const unsafePdf = catalog();
    unsafePdf.scenarios[0].pdf = '../evidence-one.pdf';
    assert.throws(() => validateCatalog(unsafePdf), /must be a safe \.pdf filename/);

    const unsafeManifest = catalog();
    unsafeManifest.scenarios[0].manifest = 'manifest.html';
    assert.throws(() => validateCatalog(unsafeManifest), /must be a safe \.json filename/);
  });

  test('rejects repository and artifact path traversal and marks the scenario unavailable', async () => {
    assert.throws(() => resolveRepositoryPath('../../etc'), /Path escapes the repository/);

    const artifactDirectory = resolveRepositoryPath('test-artifacts');
    assert.throws(
      () => resolveArtifactPath(artifactDirectory, '../outside.pdf', 'Test PDF'),
      /Test PDF escapes its artifact directory/,
    );

    const loaded = await loadScenario({
      ...catalog().scenarios[0],
      artifactDirectory: '../../etc',
    });
    assert.equal(loaded.available, false);
    assert.match(loaded.error, /Path escapes the repository/);
  });

  test('loads a large PDF with manifest-declared representative previews', async () => {
    const fixture = await createArtifactFixture({
      pdf: createMinimalPdf(100),
      manifest: {
        pageCount: 100,
        output: { pngCount: 3, previewPages: [1, 50, 100] },
      },
      previews: ['001', '050', '100'].map((page) => [`page-${page}.png`, validOnePixelPng]),
    });

    try {
      const loaded = await loadScenario(fixture.scenario);

      assert.equal(loaded.available, true);
      assert.equal(loaded.documentPageCount, 100);
      assert.deepEqual(loaded.previewPageNumbers, [1, 50, 100]);
      assert.equal(loaded.previews.length, 3);
      assert.deepEqual(
        loaded.previews.map(({ width, height }) => ({ width, height })),
        Array.from({ length: 3 }, () => ({ width: 1, height: 1 })),
      );
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  test('rejects a PDF that only has a valid-looking header', async () => {
    const fixture = await createArtifactFixture({ pdf: Buffer.from('%PDF-1.7\n') });

    try {
      const loaded = await loadScenario(fixture.scenario);

      assert.equal(loaded.available, false);
      assert.match(loaded.error, /PDF cannot be parsed/);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  test('rejects a PNG that only has a valid signature', async () => {
    const fixture = await createArtifactFixture({
      previews: [['page-001.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]],
    });

    try {
      const loaded = await loadScenario(fixture.scenario);

      assert.equal(loaded.available, false);
      assert.match(loaded.error, /cannot be decoded as PNG/);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  for (const countName of ['pageCount', 'sheetCount']) {
    test(`rejects a manifest ${countName} that differs from the parsed PDF`, async () => {
      const fixture = await createArtifactFixture({
        pdf: createMinimalPdf(2),
        manifest: {
          [countName]: 3,
          output: { pngCount: 1, previewPages: [1] },
        },
      });

      try {
        const loaded = await loadScenario(fixture.scenario);

        assert.equal(loaded.available, false);
        assert.match(loaded.error, new RegExp(`manifest ${countName} 3`));
        assert.match(loaded.error, /parsed PDF page count 2/);
      } finally {
        await rm(fixture.directory, { recursive: true, force: true });
      }
    });
  }

  test('rejects a representative preview page outside the parsed PDF', async () => {
    const fixture = await createArtifactFixture({
      pdf: createMinimalPdf(2),
      manifest: {
        pageCount: 2,
        output: { pngCount: 1, previewPages: [3] },
      },
    });

    try {
      const loaded = await loadScenario(fixture.scenario);

      assert.equal(loaded.available, false);
      assert.match(loaded.error, /preview page exceeds its PDF page count/);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

describe('test definition extraction', () => {
  test('ignores unrelated calls and extracts direct and parameterized test declarations', () => {
    const directSource = `describe('renders evidence', () => {});\nwriteCatalog('renders evidence', {});\ntest('renders evidence', () => {});`;
    const direct = extractTestCallFromSource(
      directSource,
      'packages/example/direct.test.ts',
      'renders evidence',
    );
    assert.equal(direct.line, 3);
    assert.match(direct.source, /^test\('renders evidence'/);

    const eachSource = `combineCatalog('handles $name', {});\ntest.each([{ name: 'one' }])('handles $name', () => {});`;
    const parameterized = extractTestCallFromSource(
      eachSource,
      'packages/example/each.test.ts',
      'handles $name',
    );
    assert.equal(parameterized.line, 2);
    assert.match(parameterized.source, /^test\.each/);
  });

  test('extracts explicitly named top-level fixture definitions', () => {
    const source = `const other = 1;\nconst createFixture = () => ({ pages: 7 });\ntest('renders evidence', () => createFixture());`;
    const definition = extractSupportingDefinitionFromSource(
      source,
      'packages/example/fixture.test.ts',
      'createFixture',
    );

    assert.equal(definition.line, 2);
    assert.match(definition.source, /^const createFixture/);
    assert.throws(
      () =>
        extractSupportingDefinitionFromSource(
          source,
          'packages/example/fixture.test.ts',
          'missingFixture',
        ),
      /Expected one top-level definition named 'missingFixture'/,
    );
  });

  test('resolves every supporting definition in the real qualification catalog', async () => {
    const catalogPath = resolveRepositoryPath('docs/testing/qualification-cases.json');
    const realCatalog = validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
    const references = realCatalog.features.flatMap((feature) =>
      feature.tests
        .filter((testReference) => testReference.supportingDefinitions)
        .map((testReference) => ({ featureId: feature.id, testReference })),
    );
    const sourceFiles = [...new Set(references.map(({ testReference }) => testReference.file))];
    const sourceCache = new Map(
      await Promise.all(
        sourceFiles.map(async (file) => [
          file,
          await readFile(resolveRepositoryPath(file), 'utf8'),
        ]),
      ),
    );
    const failures = [];

    for (const { featureId, testReference } of references) {
      const source = sourceCache.get(testReference.file);
      for (const name of testReference.supportingDefinitions) {
        try {
          extractSupportingDefinitionFromSource(source, testReference.file, name);
        } catch (error) {
          failures.push(
            `${featureId} -> ${testReference.file} -> ${name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    assert.deepEqual(failures, []);
  });
});

describe('JUnit result mapping', () => {
  const xml = `<?xml version="1.0"?>
    <testsuites><testsuite name="__tests__/plan.test.ts">
      <testcase classname="__tests__/plan.test.ts" name="planImposition &gt; normalizes A2 portrait physical sheet dimensions" time="0.01" />
      <testcase classname="__tests__/plan.test.ts" name="planImposition &gt; normalizes A3 landscape physical sheet dimensions" time="0.02" />
      <testcase classname="__tests__/plan.test.ts" name="planImposition &gt; rejects &apos;bad grid&apos; with a stable package error"><skipped /></testcase>
      <testcase classname="__tests__/plan.test.ts" name="planImposition &gt; renders broken output"><failure message="pixel mismatch" /></testcase>
    </testsuite></testsuites>`;
  const cases = parseJUnitReport(xml, '/repo/packages/imposition/test-results.xml', '/repo');

  test('matches every expanded printf case and object-property placeholder', () => {
    const paper = mapTestReference(
      {
        file: 'packages/imposition/__tests__/plan.test.ts',
        title: 'normalizes %s %s physical sheet dimensions',
      },
      cases,
    );
    assert.equal(paper.status, 'passed');
    assert.equal(paper.cases.length, 2);

    const rejected = mapTestReference(
      {
        file: 'packages/imposition/__tests__/plan.test.ts',
        title: 'rejects $name with a stable package error',
      },
      cases,
    );
    assert.equal(rejected.status, 'skipped');
  });

  test('reports failed and missing definitions without a global pass fallback', () => {
    const failed = mapTestReference(
      {
        file: 'packages/imposition/__tests__/plan.test.ts',
        title: 'renders broken output',
      },
      cases,
    );
    const missing = mapTestReference(
      { file: 'packages/imposition/__tests__/plan.test.ts', title: 'never collected' },
      cases,
    );
    assert.equal(failed.status, 'failed');
    assert.equal(failed.cases[0].message, 'pixel mismatch');
    assert.equal(missing.status, 'missing');
    assert.equal(deriveFeatureStatus([failed, missing]), 'failed');
    assert.equal(deriveFeatureStatus([missing]), 'missing');
  });
});

describe('qualification HTML', () => {
  test('keeps serialized report data inside the executable script', () => {
    const breakout = '</script><img id=qualification-xss src=x><script>';
    const serialized = serializeInlineScriptData({ breakout, separator: '\u2028' });
    assert.equal(serialized.includes('</script>'), false);
    assert.equal(serialized.includes('\u2028'), false);
    assert.match(serialized, /\\u003c\/script>/);
    assert.match(serialized, /\\u2028/);

    const html = render({
      features: [feature({ scenarios: [breakout] })],
      scenarios: [scenario({ id: breakout })],
    });
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:qualification-safe';
      },
    });

    assert.equal(dom.window.document.querySelector('#qualification-xss'), null);
    assert.equal(dom.window.document.querySelectorAll('script').length, 1);
    assert.equal(
      dom.window.document.querySelector('[data-pdf-id]').href,
      'blob:qualification-safe',
    );
  });

  test('escapes repository data and wires Blob PDF links and filters', () => {
    const first = feature({ name: '<img id="injected"> Alpha' });
    const second = feature({
      id: 'feature-two',
      category: 'Safety',
      name: 'Beta',
      scenarios: ['evidence-two'],
      tests: [testDefinition({ title: 'checks beta' })],
    });
    const html = render({
      features: [first, second],
      scenarios: [scenario(), scenario({ id: 'evidence-two', title: 'Evidence two' })],
    });
    const staticLinks = [
      ...new JSDOM(html).window.document.querySelectorAll('[data-pdf-id="evidence-one"]'),
    ];
    assert.equal(staticLinks.length, 2);
    assert.equal(
      staticLinks.every(
        (link) => link.getAttribute('href') === '#evidence-evidence-one' && link.tabIndex === 0,
      ),
      true,
    );

    let blobIndex = 0;
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.URL.createObjectURL = () => `blob:qualification-${String(++blobIndex)}`;
      },
    });
    const { document, Event } = dom.window;

    assert.equal(document.querySelector('#injected'), null);
    assert.equal(
      document.querySelectorAll('[data-pdf-id="evidence-one"]')[0].href,
      'blob:qualification-1',
    );
    const rows = [...document.querySelectorAll('.feature-row')];
    const search = document.querySelector('#feature-search');
    search.value = 'beta';
    search.dispatchEvent(new Event('input'));
    assert.equal(rows[0].hidden, true);
    assert.equal(rows[1].hidden, false);

    document.querySelector('#clear-filters').click();
    assert.equal(
      rows.every((row) => !row.hidden),
      true,
    );
  });

  test('renders failed tests and unavailable evidence as useful diagnostics', () => {
    const failedTest = testDefinition({
      status: 'failed',
      cases: [
        {
          file: 'packages/example/__tests__/feature.test.ts',
          fullTitle: 'feature > renders the feature',
          status: 'failed',
          message: '<failure details>',
        },
      ],
    });
    const html = render({
      runOutcome: 'failed',
      features: [feature({ status: 'failed', tests: [failedTest] })],
      scenarios: [scenario({ available: false, error: 'PDF was not generated', previews: [] })],
    });
    const document = new JSDOM(html).window.document;

    assert.match(document.querySelector('.status').textContent, /Feature qualification: Failed/);
    assert.match(document.querySelector('.artifact-error').textContent, /PDF was not generated/);
    assert.equal(document.querySelector('[data-pdf-id]'), null);
    assert.match(document.querySelector('.case-results').textContent, /<failure details>/);
  });

  test('requires an authoritative successful run and complete evidence before reporting passed', () => {
    const unknownRun = new JSDOM(render({ runOutcome: 'unknown' })).window.document;
    assert.match(
      unknownRun.querySelector('.status').textContent,
      /Feature qualification: Incomplete/,
    );

    const missingEvidence = new JSDOM(
      render({ scenarios: [scenario({ available: false, error: 'PDF was not generated' })] }),
    ).window.document;
    assert.match(
      missingEvidence.querySelector('.status').textContent,
      /Feature qualification: Incomplete/,
    );

    const failedRun = new JSDOM(render({ runOutcome: 'failed' })).window.document;
    assert.match(failedRun.querySelector('.status').textContent, /Feature qualification: Failed/);
  });
});

describe('qualification execution controls', () => {
  test('gives explicit CLI status precedence over the CI environment', () => {
    assert.equal(
      resolveRunOutcome({
        cliArguments: ['--status=failed'],
        environment: { QUALIFICATION_TEST_STATUS: 'success' },
      }),
      'failed',
    );
    assert.equal(
      resolveRunOutcome({
        cliArguments: [],
        environment: { QUALIFICATION_TEST_STATUS: 'success' },
      }),
      'passed',
    );
  });

  test('fails the qualification gate after a successful but incomplete run', () => {
    assert.throws(
      () =>
        assertQualificationGate({
          runOutcome: 'passed',
          features: [feature({ status: 'missing' })],
          scenarios: [scenario({ available: false })],
        }),
      /1 feature result\(s\) are not passed; 1 PDF evidence artifact\(s\) are unavailable/,
    );
    assert.doesNotThrow(() =>
      assertQualificationGate({
        runOutcome: 'passed',
        features: [feature()],
        scenarios: [scenario()],
      }),
    );
  });
});
