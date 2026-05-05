import { BLANK_A4_PDF, type Template } from '../src/index.js';

// Type-only regression for upstream pdfme#1021: the Template type
// previously inferred as `unknown` because the zod schema for the
// Uint8Array bytes used `z.ZodSchema<Uint8Array<ArrayBuffer>>`, which
// TypeScript 5.x+ collapses to `unknown`. Once that propagates, this
// literal assignment fails to type-check (the constructed object is no
// longer a Template, it's an object incompatible with `unknown`).
//
// The runtime body intentionally just touches the values so the file
// participates in test runs and the type error is also surfaced under
// `tsc -p tsconfig.build.json`.
describe('Template type inference (pdfme#1021)', () => {
  it('Template literal assignment compiles clean', () => {
    const t: Template = { basePdf: BLANK_A4_PDF, schemas: [] };
    expect(t.schemas).toEqual([]);
    expect(t.basePdf).toBe(BLANK_A4_PDF);
  });
});
