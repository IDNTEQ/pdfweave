import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  buildHtml,
  deriveFeatureStatus,
  mapTestReference,
  parseJUnitReport,
  validateCatalog,
} from './build-qualification-report.mjs';

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
});
