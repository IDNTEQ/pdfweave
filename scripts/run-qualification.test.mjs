import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  qualificationArtifactPaths,
  qualificationJUnitPaths,
  qualificationSetup,
  qualificationSuites,
  runQualification,
} from './run-qualification.mjs';

const silentLogger = { error: () => undefined };

describe('qualification runner', () => {
  test('cleans stale artifacts, runs every suite, and builds a passed dashboard', async () => {
    let cleanCalls = 0;
    const steps = [];
    const status = await runQualification({
      clean: async () => {
        cleanCalls += 1;
      },
      executeCommand: async (step) => {
        steps.push(step);
        return 0;
      },
      logger: silentLogger,
    });

    assert.equal(status, 0);
    assert.equal(cleanCalls, 1);
    assert.deepEqual(
      steps.slice(0, -1).map(({ label }) => label),
      [qualificationSetup, ...qualificationSuites].map(({ label }) => label),
    );
    assert.deepEqual(steps.at(-1).args, [
      'scripts/build-qualification-report.mjs',
      '--status=passed',
      '--junit=packages/generator/test-results.xml',
      '--junit=packages/imposition/test-results.xml',
    ]);
    assert.equal(qualificationSuites[0].args.includes('__tests__/complex-documents.test.ts'), true);
    assert.equal(qualificationSuites[0].args.includes('__tests__/embed-once.test.ts'), true);
    assert.deepEqual(qualificationArtifactPaths, [
      'packages/generator/test-artifacts/complex-documents',
      'packages/generator/test-artifacts/resource-reuse',
      'packages/imposition/test-artifacts/n-up',
      'packages/generator/test-results.xml',
      'packages/imposition/test-results.xml',
      'test-artifacts/qualification-report.html',
    ]);
    assert.deepEqual(qualificationJUnitPaths, [
      'packages/generator/test-results.xml',
      'packages/imposition/test-results.xml',
    ]);
  });

  test('continues after a suite failure and always builds a failed dashboard', async () => {
    const steps = [];
    const status = await runQualification({
      clean: async () => undefined,
      executeCommand: async (step) => {
        steps.push(step);
        return step.label === qualificationSuites[0].label ? 1 : 0;
      },
      logger: silentLogger,
    });

    assert.equal(status, 1);
    assert.deepEqual(
      steps.map(({ label }) => label),
      [
        qualificationSetup.label,
        qualificationSuites[0].label,
        qualificationSuites[1].label,
        'Build qualification dashboard',
      ],
    );
    assert.equal(steps.at(-1).args[1], '--status=failed');
  });

  test('reports cleanup, command, and dashboard failures without skipping later work', async () => {
    const steps = [];
    const status = await runQualification({
      clean: async () => {
        throw new Error('cleanup failed');
      },
      executeCommand: async (step) => {
        steps.push(step);
        if (step.label === qualificationSetup.label) throw new Error('setup failed');
        return step.label === 'Build qualification dashboard' ? 2 : 0;
      },
      logger: silentLogger,
    });

    assert.equal(status, 1);
    assert.deepEqual(
      steps.map(({ label }) => label),
      [
        qualificationSetup.label,
        qualificationSuites[0].label,
        qualificationSuites[1].label,
        'Build qualification dashboard',
      ],
    );
    assert.equal(steps.at(-1).args[1], '--status=failed');
  });
});
