## @pdfweave/generator

`@pdfweave/generator` creates PDF files from PDFweave templates, inputs, and schema plugins. PDFweave is forked from upstream pdfme, and this package keeps the same core generation model under the `@pdfweave/*` package namespace.

## Install

```bash
npm install @pdfweave/generator
```

## Usage

```ts
import { generate } from '@pdfweave/generator';
import { text } from '@pdfweave/schemas';

const template = {
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [[{ name: 'title', type: 'text', position: { x: 20, y: 20 }, width: 80, height: 10 }]],
};

const pdf = await generate({
  template,
  inputs: [{ title: 'Hello PDFweave' }],
  plugins: { text },
});
```

## Notes

Generation works in Node.js and browser environments.

Install `@pdfweave/schemas` for the built-in text, image, table, shape, barcode, date, and form plugins.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
