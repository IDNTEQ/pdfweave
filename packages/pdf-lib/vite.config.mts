import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const builtinModuleSet = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);
const packageDependencies = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
];

const isExternal = (id: string) =>
  builtinModuleSet.has(id) ||
  packageDependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
    minify: false,
    outDir: 'dist',
    rollupOptions: { external: isExternal },
    sourcemap: true,
    // ES2022 is required so top-level `await` (used in `src/core/crypto.ts`
    // to optionally load `node:crypto`) survives the transform pass without
    // being lowered. Every supported Node version (>=14.8) and every modern
    // browser bundler handles TLA cleanly.
    target: 'es2022',
  },
});
