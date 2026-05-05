import generate from '../src/generate.js';
import { Template, BLANK_PDF, Schema } from '@pdfweave/common';

const textObject = (x: number, y: number, name: string = 'a'): Schema => ({
  name,
  type: 'text',
  content: '',
  position: { x, y },
  width: 100,
  height: 20,
  fontSize: 13,
});

describe('pdfme#391 — pre/postprocessing hooks on generate()', () => {
  const template: Template = {
    basePdf: BLANK_PDF,
    schemas: [[textObject(20, 20, 'a')]],
  };

  test('preprocessing transforms each input before render (sync)', async () => {
    const seen: Record<string, unknown>[] = [];
    const inputs = [{ a: 'foo' }, { a: 'bar' }];

    await generate({
      inputs,
      template,
      preprocessing: (input) => {
        seen.push(input);
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input)) {
          out[k] = typeof v === 'string' ? v.toUpperCase() : v;
        }
        return out;
      },
    });

    expect(seen).toEqual([{ a: 'foo' }, { a: 'bar' }]);
  });

  test('preprocessing supports async transformations', async () => {
    let calls = 0;
    const inputs = [{ a: 'one' }, { a: 'two' }, { a: 'three' }];

    const pdf = await generate({
      inputs,
      template,
      preprocessing: async (input) => {
        calls += 1;
        await Promise.resolve();
        return { ...input, a: String(input.a).toUpperCase() };
      },
    });

    expect(calls).toBe(3);
    expect(pdf).toBeInstanceOf(Uint8Array);
  });

  test('postprocessing transforms the final PDF bytes (sync)', async () => {
    const inputs = [{ a: 'hi' }];
    const sentinel = new Uint8Array([1, 2, 3, 4]) as Uint8Array<ArrayBuffer>;

    const result = await generate({
      inputs,
      template,
      postprocessing: () => sentinel,
    });

    expect(result).toBe(sentinel);
  });

  test('postprocessing supports async transformations and runs exactly once', async () => {
    let postCalls = 0;
    const inputs = [{ a: 'x' }, { a: 'y' }, { a: 'z' }];

    const result = await generate({
      inputs,
      template,
      postprocessing: async (bytes) => {
        postCalls += 1;
        await Promise.resolve();
        // Append a PDF comment to the bytes (PDF readers ignore comments).
        const tag = new TextEncoder().encode('\n%pdfweave-postprocess\n');
        const out = new Uint8Array(bytes.length + tag.length);
        out.set(bytes, 0);
        out.set(tag, bytes.length);
        return out as Uint8Array<ArrayBuffer>;
      },
    });

    expect(postCalls).toBe(1);
    expect(Buffer.from(result).toString('latin1')).toContain('%pdfweave-postprocess');
  });

  test('both hooks compose: preprocessing alters inputs, postprocessing alters bytes', async () => {
    const inputs = [{ a: 'lower' }];

    const result = await generate({
      inputs,
      template,
      preprocessing: (input) => ({ ...input, a: String(input.a).toUpperCase() }),
      postprocessing: (bytes) => {
        const tag = new TextEncoder().encode('\n%composed\n');
        const out = new Uint8Array(bytes.length + tag.length);
        out.set(bytes, 0);
        out.set(tag, bytes.length);
        return out as Uint8Array<ArrayBuffer>;
      },
    });

    expect(Buffer.from(result).toString('latin1')).toContain('%composed');
  });

  test('omitting both hooks preserves backwards-compatible behaviour', async () => {
    const pdf = await generate({ inputs: [{ a: 'plain' }], template });
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
  });
});
