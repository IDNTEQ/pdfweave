import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.cwd();
const workspacePath = path.relative(repoRoot, workspaceRoot).split(path.sep).join('/');

const workspaceTests: Record<
  string,
  {
    name: string;
    include: string[];
    setupFiles?: string[];
    testTimeout?: number;
    hookTimeout?: number;
    fileParallelism?: boolean;
    environment?: 'jsdom';
  }
> = {
  'packages/common': {
    name: 'common',
    include: ['__tests__/**/*.test.ts'],
  },
  'packages/converter': {
    name: 'converter',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
  'packages/generator': {
    name: 'generator',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: [path.resolve(repoRoot, 'packages/generator/vitest.setup.ts')],
    testTimeout: 60000,
  },
  'packages/manipulator': {
    name: 'manipulator',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: [path.resolve(repoRoot, 'packages/manipulator/vitest.setup.ts')],
    testTimeout: 30000,
  },
  'packages/schemas': {
    name: 'schemas',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
  'packages/pdf-lib': {
    name: 'pdf-lib',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
    testTimeout: 30000,
  },
  'packages/cli': {
    name: 'cli',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 60000,
  },
  'packages/ui': {
    name: 'ui',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    setupFiles: [path.resolve(repoRoot, 'packages/ui/vitest.setup.ts')],
    testTimeout: 30000,
    environment: 'jsdom',
  },
  playground: {
    name: 'playground',
    include: ['e2e/**/*.test.ts'],
    setupFiles: [path.resolve(repoRoot, 'playground/vitest.setup.ts')],
    testTimeout: 200000,
    hookTimeout: 200000,
    fileParallelism: false,
  },
};

const selectedWorkspace = workspaceTests[workspacePath];
const usePublishedPdfmeExports = workspacePath === 'playground';
const coverageReporters = ['text-summary', 'json-summary', 'json', 'lcov', 'html'] as const;
const coverageExcludes = [
  'src/**/*.test.{ts,tsx}',
  'src/**/*.spec.{ts,tsx}',
  'src/**/__tests__/**',
  'src/**/*.d.ts',
  'src/**/index.ts',
];
const coverageThresholds: Record<
  string,
  { lines: number; branches: number; functions: number; statements: number } | undefined
> = {
  'packages/common': { lines: 60, branches: 50, functions: 60, statements: 60 },
  // TODO ratchet schemas: current L57.51 / B44.94 / F55.55 / S56.52, target 60 / 50 / 60 / 60
  'packages/schemas': { lines: 52, branches: 39, functions: 50, statements: 51 },
  'packages/generator': { lines: 55, branches: 45, functions: 55, statements: 55 },
  // TODO ratchet ui: current L46.75 / B23.01 / F34.39 / S44.56, target 40 / 30 / 40 / 40
  'packages/ui': { lines: 41, branches: 18, functions: 29, statements: 39 },
  'packages/converter': { lines: 40, branches: 30, functions: 40, statements: 40 },
  // packages/manipulator only ships re-exports from src/index.ts which is excluded; nothing to gate.
  'packages/manipulator': undefined,
  // TODO ratchet cli: current L14.21 / B13.75 / F23.62 / S14.43, target 40 / 30 / 40 / 40
  'packages/cli': { lines: 9, branches: 8, functions: 18, statements: 9 },
  'packages/pdf-lib': undefined,
};
const selectedCoverageThresholds = coverageThresholds[workspacePath];
const coverageConfig =
  selectedWorkspace && workspacePath.startsWith('packages/')
    ? {
        provider: 'v8' as const,
        reporter: coverageReporters,
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: coverageExcludes,
        ...(selectedCoverageThresholds ? { thresholds: selectedCoverageThresholds } : {}),
      }
    : undefined;
const converterReplacement =
  workspacePath === 'packages/ui'
    ? path.resolve(repoRoot, 'packages/ui/__mocks__/converter.ts')
    : path.resolve(repoRoot, 'packages/converter/src/index.node.ts');
const pdfmeAliases = usePublishedPdfmeExports
  ? []
  : [
      {
        find: '@pdfweave/schemas/builtins',
        replacement: path.resolve(repoRoot, 'packages/schemas/src/builtins.ts'),
      },
      {
        find: '@pdfweave/schemas/tables',
        replacement: path.resolve(repoRoot, 'packages/schemas/src/tables.ts'),
      },
      {
        find: '@pdfweave/schemas/utils',
        replacement: path.resolve(repoRoot, 'packages/schemas/src/utils.ts'),
      },
      {
        find: '@pdfweave/common',
        replacement: path.resolve(repoRoot, 'packages/common/src/index.ts'),
      },
      {
        find: '@pdfweave/converter',
        replacement: converterReplacement,
      },
      {
        find: '@pdfweave/generator',
        replacement: path.resolve(repoRoot, 'packages/generator/src/index.ts'),
      },
      {
        find: '@pdfweave/manipulator',
        replacement: path.resolve(repoRoot, 'packages/manipulator/src/index.ts'),
      },
      {
        find: '@pdfweave/pdf-lib',
        replacement: path.resolve(repoRoot, 'packages/pdf-lib/src/index.ts'),
      },
      {
        find: '@pdfweave/schemas',
        replacement: path.resolve(repoRoot, 'packages/schemas/src/index.ts'),
      },
    ];
const reporters = process.env.CI
  ? (['default', ['junit', { outputFile: './test-results.xml' }]] as const)
  : (['default'] as const);
const testConfig = {
  name: selectedWorkspace?.name ?? 'root',
  root: workspaceRoot,
  globals: true,
  pool: 'forks' as const,
  passWithNoTests: !selectedWorkspace,
  include: selectedWorkspace?.include ?? [],
  setupFiles: selectedWorkspace?.setupFiles,
  testTimeout: selectedWorkspace?.testTimeout,
  hookTimeout: selectedWorkspace?.hookTimeout,
  fileParallelism: selectedWorkspace?.fileParallelism,
  reporters,
  coverage: coverageConfig,
  ...(selectedWorkspace?.environment ? { environment: selectedWorkspace.environment } : {}),
};

export default defineConfig({
  resolve: {
    alias: [
      ...pdfmeAliases,
      {
        find: /^antd\/es\//,
        replacement: 'antd/lib/',
      },
      {
        find: /^form-render$/,
        replacement: path.resolve(repoRoot, 'packages/ui/__mocks__/form-render.ts'),
      },
      {
        find: /^form-render\/es\//,
        replacement: 'form-render/lib/',
      },
      {
        find: /^rc-picker\/es\//,
        replacement: 'rc-picker/lib/',
      },
      {
        find: /^lodash-es$/,
        replacement: 'lodash',
      },
      {
        find: /^lucide-react$/,
        replacement: path.resolve(repoRoot, 'packages/ui/__mocks__/lucide-react.ts'),
      },
    ],
  },
  test: testConfig,
});
