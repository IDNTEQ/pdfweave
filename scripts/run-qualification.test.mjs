import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  createNpmInvocation,
  getQualificationSuites,
  qualificationArtifactPaths,
  qualificationJUnitPaths,
  qualificationSetup,
  resolveNpmCliPath,
  runQualification,
} from './run-qualification.mjs';

const silentLogger = { error: () => undefined };
const virtualNpmCli = '/virtual/npm/bin/npm-cli.js';
const resolveVirtualNpmCli = () => virtualNpmCli;
const qualificationSuites = getQualificationSuites({ resolveNpmCli: resolveVirtualNpmCli });

describe('qualification runner', () => {
  test('runs npm through the Node CLI entry point without a shell-specific launcher', () => {
    const invocation = createNpmInvocation(['test', '-w', 'packages/imposition'], {
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      npmCliPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    });

    assert.deepEqual(invocation, {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
        'test',
        '-w',
        'packages/imposition',
      ],
    });
    assert.equal(invocation.command.endsWith('.cmd'), false);

    let resolutionCalls = 0;
    const suites = getQualificationSuites({
      resolveNpmCli: () => {
        resolutionCalls += 1;
        return virtualNpmCli;
      },
    });
    assert.equal(resolutionCalls, 1);
    assert.equal(
      suites.every(
        ({ command, args }) => command === process.execPath && args[0] === virtualNpmCli,
      ),
      true,
    );
  });

  test('resolves npm CLI candidates through injected filesystem inputs', () => {
    const npmExecPath = '/virtual/bin/npm';
    assert.equal(
      resolveNpmCliPath({
        npmExecPath,
        nodeExecutable: '/runtime/bin/node',
        searchPath: '',
        platform: 'linux',
        pathApi: path.posix,
        fileExists: (candidate) => candidate === npmExecPath,
        resolveRealPath: (candidate) => (candidate === npmExecPath ? virtualNpmCli : candidate),
      }),
      virtualNpmCli,
    );

    const bundledNpmCli = '/runtime/lib/node_modules/npm/bin/npm-cli.js';
    assert.equal(
      resolveNpmCliPath({
        npmExecPath: null,
        nodeExecutable: '/runtime/bin/node',
        searchPath: '',
        platform: 'linux',
        pathApi: path.posix,
        fileExists: (candidate) => candidate === bundledNpmCli,
        resolveRealPath: (candidate) => candidate,
      }),
      bundledNpmCli,
    );

    const launcher = '/tools/bin/npm';
    const pathNpmCli = '/tools/bin/node_modules/npm/bin/npm-cli.js';
    const existingPaths = new Set([launcher, pathNpmCli]);
    assert.equal(
      resolveNpmCliPath({
        npmExecPath: null,
        nodeExecutable: '/runtime/bin/node',
        searchPath: '/tools/bin',
        platform: 'linux',
        pathApi: path.posix,
        fileExists: (candidate) => existingPaths.has(candidate),
        resolveRealPath: (candidate) => candidate,
      }),
      pathNpmCli,
    );
  });

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
      resolveNpmCli: resolveVirtualNpmCli,
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
      '--junit=packages/schemas/test-results.xml',
      '--junit=packages/generator/test-results.xml',
      '--junit=packages/imposition/test-results.xml',
    ]);
    assert.deepEqual(
      qualificationSuites[0].args.filter((argument) => argument.startsWith('__tests__/')),
      [
        '__tests__/boleto.digits.test.ts',
        '__tests__/boleto.pix.test.ts',
        '__tests__/boleto.validation.test.ts',
        '__tests__/boleto.layout.test.ts',
        '__tests__/boleto.plugin.test.ts',
        '__tests__/tables.test.ts',
      ],
    );
    assert.equal(qualificationSuites[1].args.includes('__tests__/generate.test.ts'), true);
    assert.equal(qualificationSuites[1].args.includes('__tests__/complex-documents.test.ts'), true);
    assert.equal(qualificationSuites[1].args.includes('__tests__/boleto.e2e.test.ts'), true);
    assert.equal(qualificationSuites[1].args.includes('__tests__/embed-once.test.ts'), true);
    assert.deepEqual(qualificationArtifactPaths, [
      'packages/generator/test-artifacts/complex-documents',
      'packages/generator/test-artifacts/boleto-book',
      'packages/generator/test-artifacts/resource-reuse',
      'packages/imposition/test-artifacts/n-up',
      'packages/schemas/test-results.xml',
      'packages/generator/test-results.xml',
      'packages/imposition/test-results.xml',
      'test-artifacts/qualification-report.html',
    ]);
    assert.deepEqual(qualificationJUnitPaths, [
      'packages/schemas/test-results.xml',
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
      resolveNpmCli: resolveVirtualNpmCli,
    });

    assert.equal(status, 1);
    assert.deepEqual(
      steps.map(({ label }) => label),
      [
        qualificationSetup.label,
        ...qualificationSuites.map(({ label }) => label),
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
      resolveNpmCli: resolveVirtualNpmCli,
    });

    assert.equal(status, 1);
    assert.deepEqual(
      steps.map(({ label }) => label),
      [
        qualificationSetup.label,
        ...qualificationSuites.map(({ label }) => label),
        'Build qualification dashboard',
      ],
    );
    assert.equal(steps.at(-1).args[1], '--status=failed');
  });

  test('reports npm resolution failure and still builds a failed dashboard', async () => {
    const steps = [];
    const errors = [];
    const status = await runQualification({
      clean: async () => undefined,
      executeCommand: async (step) => {
        steps.push(step);
        return 0;
      },
      logger: { error: (message) => errors.push(message) },
      resolveNpmCli: () => {
        throw new Error('npm unavailable');
      },
    });

    assert.equal(status, 1);
    assert.deepEqual(
      steps.map(({ label }) => label),
      [qualificationSetup.label, 'Build qualification dashboard'],
    );
    assert.equal(steps.at(-1).args[1], '--status=failed');
    assert.match(errors.join('\n'), /Could not resolve npm CLI: npm unavailable/);
  });

  test('publishes qualification diagnostics while enforcing a separate workflow gate', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/deploy-playground.yml', import.meta.url),
      'utf8',
    );

    assert.match(
      workflow,
      /id: qualification\n\s+run: npm run qualification\n\s+continue-on-error: true/,
    );
    assert.match(workflow, /qualification_outcome: \$\{\{ steps\.qualification\.outcome \}\}/);
    assert.match(
      workflow,
      /qualification_report_present: \$\{\{ steps\.qualification_report\.outputs\.present \}\}/,
    );
    assert.match(workflow, /Qualification report unavailable/);
    assert.match(
      workflow,
      /qualification-gate:\n\s+name: Enforce qualification result\n\s+needs: build/,
    );
    assert.match(workflow, /QUALIFICATION_OUTCOME.*needs\.build\.outputs\.qualification_outcome/);
    assert.match(
      workflow,
      /QUALIFICATION_REPORT_PRESENT.*needs\.build\.outputs\.qualification_report_present/,
    );
    assert.doesNotMatch(workflow, /^permissions:/m);
    assert.match(workflow, /build:\n\s+runs-on: ubuntu-latest\n\s+permissions:\n\s+contents: read/);
    assert.match(
      workflow,
      /qualification-gate:\n\s+name: Enforce qualification result\n\s+needs: build\n\s+runs-on: ubuntu-latest\n\s+permissions: \{\}/,
    );
    assert.match(
      workflow,
      /deploy:\n\s+name: Deploy to GitHub Pages\n(?:\s+#.*\n)+\s+needs: build/,
    );
    assert.doesNotMatch(workflow, /deploy:[\s\S]*?needs:.*qualification-gate/);
    assert.match(
      workflow,
      /deploy:\n\s+name: Deploy to GitHub Pages\n(?:\s+#.*\n)+\s+needs: build\n\s+runs-on: ubuntu-latest\n(?:\s+#.*\n)+\s+permissions:\n\s+pages: write\n\s+id-token: write/,
    );
  });
});
