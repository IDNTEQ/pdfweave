import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveExistingNpmCli = (candidate) => {
  if (!candidate || !existsSync(candidate)) return undefined;
  const resolved = realpathSync(candidate);
  return path.basename(resolved) === 'npm-cli.js' ? resolved : undefined;
};

/** Resolve npm's JavaScript entry point so Windows never needs to spawn npm.cmd. */
export const resolveNpmCliPath = () => {
  const nodeDirectory = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(nodeDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];

  for (const candidate of candidates) {
    const resolved = resolveExistingNpmCli(candidate);
    if (resolved) return resolved;
  }

  const launcherNames = process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const launcherName of launcherNames) {
      const launcher = path.join(directory, launcherName);
      if (!existsSync(launcher)) continue;
      const resolvedLauncher = realpathSync(launcher);
      if (path.basename(resolvedLauncher) === 'npm-cli.js') return resolvedLauncher;
      const resolved = resolveExistingNpmCli(
        path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      );
      if (resolved) return resolved;
    }
  }

  throw new Error('Could not resolve npm/bin/npm-cli.js; run qualification through npm');
};

export const createNpmInvocation = (
  args,
  { nodeExecutable = process.execPath, npmCliPath = resolveNpmCliPath() } = {},
) => ({ command: nodeExecutable, args: [npmCliPath, ...args] });

export const qualificationJUnitPaths = [
  'packages/generator/test-results.xml',
  'packages/imposition/test-results.xml',
];

export const qualificationArtifactPaths = [
  'packages/generator/test-artifacts/complex-documents',
  'packages/generator/test-artifacts/resource-reuse',
  'packages/imposition/test-artifacts/n-up',
  ...qualificationJUnitPaths,
  'test-artifacts/qualification-report.html',
];

export const qualificationSetup = {
  label: 'Prepare generated version metadata',
  command: process.execPath,
  args: ['packages/common/set-version.js'],
};

export const qualificationSuites = [
  {
    label: 'Generator qualification tests',
    ...createNpmInvocation([
      'test',
      '-w',
      'packages/generator',
      '--',
      '__tests__/complex-documents.test.ts',
      '__tests__/embed-once.test.ts',
      '--reporter=default',
      '--reporter=junit',
      '--outputFile=test-results.xml',
    ]),
  },
  {
    label: 'Imposition qualification tests',
    ...createNpmInvocation([
      'test',
      '-w',
      'packages/imposition',
      '--',
      '--reporter=default',
      '--reporter=junit',
      '--outputFile=test-results.xml',
    ]),
  },
];

const cleanArtifacts = async () => {
  const results = await Promise.allSettled(
    qualificationArtifactPaths.map((artifactPath) =>
      rm(path.join(repoRoot, artifactPath), { recursive: true, force: true }),
    ),
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'One or more stale qualification artifacts could not be removed',
    );
  }
};

const runCommand = ({ command, args }) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const reportFailure = (label, error, logger) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`[@pdfweave/qualification] ${label}: ${message}`);
};

const execute = async (step, executeCommand, logger) => {
  try {
    const status = await executeCommand(step);
    if (status !== 0) {
      logger.error(`[@pdfweave/qualification] ${step.label} exited with status ${String(status)}`);
      return false;
    }
    return true;
  } catch (error) {
    reportFailure(step.label, error, logger);
    return false;
  }
};

export const runQualification = async ({
  clean = cleanArtifacts,
  executeCommand = runCommand,
  logger = console,
} = {}) => {
  let testsPassed = true;

  try {
    await clean();
  } catch (error) {
    reportFailure('Could not clean stale qualification artifacts', error, logger);
    testsPassed = false;
  }

  if (!(await execute(qualificationSetup, executeCommand, logger))) testsPassed = false;
  for (const suite of qualificationSuites) {
    if (!(await execute(suite, executeCommand, logger))) testsPassed = false;
  }

  const dashboard = {
    label: 'Build qualification dashboard',
    command: process.execPath,
    args: [
      'scripts/build-qualification-report.mjs',
      `--status=${testsPassed ? 'passed' : 'failed'}`,
      ...qualificationJUnitPaths.map((junitPath) => `--junit=${junitPath}`),
    ],
  };
  const dashboardPassed = await execute(dashboard, executeCommand, logger);

  return testsPassed && dashboardPassed ? 0 : 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runQualification();
}
