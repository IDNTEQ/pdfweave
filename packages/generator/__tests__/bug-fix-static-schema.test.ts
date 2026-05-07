import generate from '../src/generate.js';
import { Template, BLANK_A4_PDF, BlankPdf, Schema } from '@pdfweave/common';

const textObject = (x: number, y: number, name: string = 'a'): Schema => ({
  name,
  type: 'text',
  content: '',
  position: { x, y },
  width: 100,
  height: 20,
  fontSize: 13,
});

// Issue #22: staticSchema.position was mutated in-place during rendering, so
// a batch run accumulated page offsets — input #100 had every static schema
// shifted by ~99×offset.
describe('issue #22: staticSchema.position mutation', () => {
  test('does not accumulate page offsets across a batch', async () => {
    const staticX = 5;
    const staticY = 5;
    const basePdf: BlankPdf = {
      ...BLANK_A4_PDF,
      staticSchema: [
        {
          ...textObject(staticX, staticY, 'header'),
          content: 'static header',
          readOnly: true,
        },
      ],
    };
    const template: Template = {
      basePdf,
      schemas: [[textObject(20, 20, 'a')]],
    };
    const inputs = [{ a: '1' }, { a: '2' }, { a: '3' }, { a: '4' }, { a: '5' }];

    // Snapshot the staticSchema position before generation.
    const beforeX = basePdf.staticSchema![0].position.x;
    const beforeY = basePdf.staticSchema![0].position.y;

    await generate({ inputs, template });

    // After a 5-input batch, the caller's staticSchema must not have moved.
    // Without the fix this is shifted by ~5×bounding-box offsets.
    expect(basePdf.staticSchema![0].position.x).toBe(beforeX);
    expect(basePdf.staticSchema![0].position.y).toBe(beforeY);
    expect(beforeX).toBe(staticX);
    expect(beforeY).toBe(staticY);
  });

  test('a single generate() call leaves caller-provided basePdf untouched', async () => {
    // Stronger structural check: nothing on the caller's basePdf should be
    // visibly mutated by a generate() run, regardless of input count.
    const basePdf: BlankPdf = {
      ...BLANK_A4_PDF,
      staticSchema: [
        {
          ...textObject(5, 5, 'header'),
          content: 'static header',
          readOnly: true,
        },
        {
          ...textObject(7, 7, 'footer'),
          content: 'static footer',
          readOnly: true,
        },
      ],
    };
    const template: Template = {
      basePdf,
      schemas: [[textObject(20, 20, 'a')]],
    };

    const snapshot = JSON.parse(JSON.stringify(basePdf.staticSchema)) as unknown[];

    await generate({
      inputs: [{ a: 'first' }, { a: 'second' }, { a: 'third' }],
      template,
    });

    expect(basePdf.staticSchema).toEqual(snapshot);
  });
});
