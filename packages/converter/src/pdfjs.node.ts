import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pdfJsDistRoot = dirname(require.resolve('pdfjs-dist/package.json'));

export const getPdfJsWasmUrl = (): string => join(pdfJsDistRoot, 'wasm/');

export const getPdfJsStandardFontDataUrl = (): string => join(pdfJsDistRoot, 'standard_fonts/');
