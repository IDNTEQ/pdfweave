import generate from '../src/generate.js';
import { Template, BLANK_A4_PDF, Schema } from '@pdfweave/common';

const textObject = (x: number, y: number, name: string = 'a'): Schema => ({
  name,
  type: 'text',
  content: '',
  position: { x, y },
  width: 100,
  height: 20,
  fontSize: 13,
});

// Issue #23: validateRequiredFields ran before preHook, so a preHook that
// supplies a required field was rejected.
describe('issue #23: validateRequiredFields runs after preHook', () => {
  const template: Template = {
    basePdf: BLANK_A4_PDF,
    schemas: [
      [
        {
          ...textObject(20, 20, 'orderId'),
          required: true,
        },
      ],
    ],
  };

  test('preHook that supplies a required field allows generation to succeed', async () => {
    const inputs = [{ raw: 'value-without-orderId' }];

    // Before the fix: throws "input for 'orderId' is required" because
    // validation runs against the raw inputs before preHook fires.
    await expect(
      generate({
        inputs,
        template,
        preprocessing: (input) => ({ ...input, orderId: 'derived-from-raw' }),
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  test('still throws when a required field is missing after preHook', async () => {
    const inputs = [{ raw: 'no-orderId-here' }];

    await expect(
      generate({
        inputs,
        template,
        // preHook does not provide orderId
        preprocessing: (input) => ({ ...input }),
      }),
    ).rejects.toThrow(/orderId/);
  });

  test('still throws when no preHook is supplied and a required field is missing', async () => {
    await expect(generate({ inputs: [{ name: 'no orderId' }], template })).rejects.toThrow(
      /orderId/,
    );
  });
});
