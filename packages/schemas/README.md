## @pdfweave/schemas

`@pdfweave/schemas` contains the built-in PDFweave schema plugins for text, images, SVG, tables, barcodes, shapes, dates, links, signatures, and form controls. PDFweave is forked from upstream pdfme, and these plugins continue that model under the PDFweave namespace.

## Install

```bash
npm install @pdfweave/schemas
```

## Usage

```ts
import { generate } from '@pdfweave/generator';
import { text, image, table, barcodes } from '@pdfweave/schemas';

const plugins = { text, image, table, qrcode: barcodes.qrcode };

const pdf = await generate({
  template,
  inputs,
  plugins,
});
```

## Notes

The default export surface includes individual plugins plus `builtInPlugins`.

Subpath exports are available for `@pdfweave/schemas/builtins`, `@pdfweave/schemas/tables`, and `@pdfweave/schemas/utils`.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
