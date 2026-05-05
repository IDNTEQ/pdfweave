import text from './text/index.js';

// The default built-in plugin surface is intentionally limited to text.
// Generator/UI consumers that need image, barcode, table, or other schema types
// must import and pass those plugins explicitly from `@pdfweave/schemas`.
const builtInPlugins = { Text: text };

export { builtInPlugins };
