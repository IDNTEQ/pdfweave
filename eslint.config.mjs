import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import security from 'eslint-plugin-security';
import jsdoc from 'eslint-plugin-jsdoc';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const typeAwareProject = [
  './tsconfig.base.json',
  './packages/*/tsconfig.json',
  './playground/tsconfig.json',
];

const packageNames = [
  'cli',
  'common',
  'converter',
  'generator',
  'manipulator',
  'pdf-lib',
  'schemas',
  'ui',
];

const sourceFiles = [
  'packages/*/src/**/*.{ts,tsx}',
  'packages/*/__tests__/**/*.{ts,tsx}',
  'playground/src/**/*.{ts,tsx}',
  'playground/e2e/**/*.{ts,tsx}',
  'playground/vite.config.ts',
  'playground/vitest.setup.ts',
  'vite.config.mts',
];

const packageIndexFiles = packageNames.map((name) => `packages/${name}/src/index.ts`);

const errorRuleNames = new Set([
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/await-thenable',
  '@typescript-eslint/no-misused-promises',
  'no-unsafe-finally',
  'import/no-unresolved',
  'import/no-cycle',
  'react/jsx-key',
  'react-hooks/rules-of-hooks',
  'security/detect-eval-with-expression',
  'security/detect-non-literal-require',
]);

const isOff = (severity) => severity === 'off' || severity === 0;

const warnRule = (ruleName, ruleValue) => {
  if (Array.isArray(ruleValue)) {
    const [severity, ...options] = ruleValue;
    if (isOff(severity)) return ruleValue;
    return [errorRuleNames.has(ruleName) ? 'error' : 'warn', ...options];
  }

  if (isOff(ruleValue)) return ruleValue;
  return errorRuleNames.has(ruleName) ? 'error' : 'warn';
};

const warnRules = (rules = {}) =>
  Object.fromEntries(Object.entries(rules).map(([ruleName, ruleValue]) => [ruleName, warnRule(ruleName, ruleValue)]));

const configWithWarnRules = (config, files = sourceFiles) => ({
  ...config,
  files,
  rules: warnRules(config.rules),
});

const disableRulesFromPlugin = (prefix, plugin) =>
  Object.fromEntries(Object.keys(plugin.rules).map((ruleName) => [`${prefix}/${ruleName}`, 'off']));

const packageBoundaryZones = packageNames.map((targetPackage) => ({
  target: `./packages/${targetPackage}/src`,
  from: packageNames
    .filter((sourcePackage) => sourcePackage !== targetPackage)
    .map((sourcePackage) => `./packages/${sourcePackage}/src`),
  message: 'Import other packages through their @pdfweave/* entry point instead of packages/*/src.',
}));

const typedStrictConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => configWithWarnRules(config));

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/__image_actual__/**',
      '**/__image_diffs__/**',
      '**/__image_diff_report__/**',
      'website/**',
      'playground/dist/**',
      'packages/*/dist/**',
      'packages/*/coverage/**',
    ],
  },
  ...typedStrictConfigs,
  {
    name: 'pdfweave/type-aware-language',
    files: sourceFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: typeAwareProject,
        tsconfigRootDir: import.meta.dirname,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.vitest,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: typeAwareProject,
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
  },
  {
    name: 'pdfweave/import',
    files: sourceFiles,
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...warnRules(importPlugin.configs.recommended.rules),
      ...warnRules(importPlugin.configs.typescript.rules),
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/no-restricted-paths': [
        'warn',
        {
          basePath: import.meta.dirname,
          zones: packageBoundaryZones,
        },
      ],
      'import/no-unresolved': ['error', { commonjs: true, caseSensitive: true }],
    },
  },
  {
    name: 'pdfweave/sonarjs',
    files: sourceFiles,
    plugins: {
      sonarjs,
    },
    rules: {
      ...warnRules(sonarjs.configs.recommended.rules),
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/no-identical-functions': 'warn',
    },
  },
  {
    name: 'pdfweave/unicorn',
    files: sourceFiles,
    plugins: {
      unicorn,
    },
    rules: {
      ...warnRules(unicorn.configs['flat/recommended'].rules),
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/filename-case': 'off',
    },
  },
  {
    name: 'pdfweave/security',
    files: sourceFiles,
    plugins: {
      security,
    },
    rules: {
      ...warnRules(security.configs.recommended.rules),
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-require': 'error',
    },
  },
  {
    name: 'pdfweave/jsdoc-public-api',
    files: packageIndexFiles,
    plugins: {
      jsdoc,
    },
    rules: {
      ...warnRules(jsdoc.configs['flat/recommended-typescript'].rules),
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
    },
  },
  {
    name: 'pdfweave/react-ui',
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...warnRules(react.configs.flat.recommended.rules),
      ...warnRules(reactHooks.configs.flat.recommended.rules),
      'react/jsx-key': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
