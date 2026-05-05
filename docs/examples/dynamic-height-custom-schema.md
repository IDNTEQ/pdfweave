# Dynamic-height custom schemas

PDFweave's plugin `measure` hook lets any custom schema declare its rendered
height — the layout engine then reflows anchored siblings around it the same
way it does for the built-in `table` plugin.

This is the architectural answer to upstream
[pdfme/pdfme#1418](https://github.com/pdfme/pdfme/issues/1418): there is no
hard-coded `type === 'table'` switch. Any plugin with a `measure` function
participates in dynamic-height layout.

## Example: an auto-fit text block

```ts
import type { Plugin, LayoutMeasureProps, LayoutMeasureResult } from '@pdfweave/common';

interface AutoFitTextSchema {
  name: string;
  type: 'autoFitText';
  content: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  fontSize?: number;
  lineHeight?: number;
}

const LINES_PER_MM = 0.25;

const autoFitText: Plugin<AutoFitTextSchema> = {
  pdf: async ({ value, schema, page, pdfLib, pdfDoc }) => {
    const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
    const fontSize = schema.fontSize ?? 11;
    page.drawText(value, {
      x: schema.position.x,
      y: page.getHeight() - schema.position.y - fontSize,
      size: fontSize,
      font,
    });
  },
  ui: ({ rootElement, value }) => {
    rootElement.textContent = value;
  },
  propPanel: {
    schema: {},
    defaultSchema: {
      name: '',
      type: 'autoFitText',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 12,
    },
  },
  measure: ({ value, schema }: LayoutMeasureProps<AutoFitTextSchema>): LayoutMeasureResult => {
    const lines = value.split('\n').length;
    const lineHeightMm = (schema.fontSize ?? 11) * (schema.lineHeight ?? 1.3) * LINES_PER_MM;
    return { width: schema.width, height: Math.max(schema.height, lines * lineHeightMm) };
  },
};

export default autoFitText;
```

## Anchoring siblings to the measured edge

```ts
const template = {
  basePdf: { width: 210, height: 297, padding: [20, 20, 20, 20] },
  schemas: [[
    {
      name: 'description', type: 'autoFitText', content: '',
      position: { x: 20, y: 20 }, width: 170, height: 12,
    },
    {
      name: 'signature', type: 'text', content: 'Signed: ____________________',
      position: { x: 20, y: 60 }, width: 170, height: 10,
      layout: {
        mode: 'anchored',
        x: { mode: 'pageLeft', offsetMm: 20 },
        y: { mode: 'belowBottomEdge', ref: { schemaId: 'description' }, offsetMm: 6 },
      },
    },
  ]],
};
```

When `description` measures taller, `signature` is pushed down to sit 6 mm
below it — no special-casing required for the new schema type.
