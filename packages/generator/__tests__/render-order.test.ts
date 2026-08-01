import { BLANK_A4_PDF, type Plugin, type Schema, type Template } from '@pdfweave/common';
import generate from '../src/generate.js';

const probeSchema = (id: string, name: string): Schema => ({
  id,
  name,
  type: 'probe',
  content: '',
  position: { x: 10, y: 10 },
  width: 20,
  height: 10,
});

describe('generator schema render order', () => {
  test('renders every schema in page-local array order, including duplicate names', async () => {
    const calls: string[] = [];
    const probe: Plugin = {
      pdf: ({ schema }) => {
        calls.push(schema.id || 'missing-id');
      },
      ui: () => undefined,
      propPanel: {
        schema: {},
        defaultSchema: probeSchema('default', 'probe'),
      },
    };
    const template: Template = {
      basePdf: BLANK_A4_PDF,
      schemas: [
        [probeSchema('page-1-a', 'a'), probeSchema('page-1-b', 'b')],
        [probeSchema('page-2-b', 'b'), probeSchema('page-2-a', 'a')],
        [probeSchema('duplicate-1', 'same'), probeSchema('duplicate-2', 'same')],
      ],
    };

    await generate({
      inputs: [{ a: 'A', b: 'B', same: 'shared value' }],
      template,
      plugins: { probe },
    });

    expect(calls).toEqual([
      'page-1-a',
      'page-1-b',
      'page-2-b',
      'page-2-a',
      'duplicate-1',
      'duplicate-2',
    ]);
  });
});
