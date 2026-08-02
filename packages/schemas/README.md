## @pdfweave/schemas

`@pdfweave/schemas` contains the built-in PDFweave schema plugins for text, images, SVG, tables, barcodes, validated boleto de cobranca fichas, shapes, dates, links, signatures, and form controls. PDFweave is forked from upstream pdfme, and these plugins continue that model under the PDFweave namespace.

## Install

```bash
npm install @pdfweave/schemas
```

## Usage

```ts
import { generate } from '@pdfweave/generator';
import { text, image, table, barcodes, boleto } from '@pdfweave/schemas';

const plugins = { text, image, table, qrcode: barcodes.qrcode, boleto };

const pdf = await generate({
  template,
  inputs,
  plugins,
});
```

## Notes

The default export surface includes individual plugins plus `builtInPlugins`.

Subpath exports are available for `@pdfweave/schemas/builtins`,
`@pdfweave/schemas/boleto`, `@pdfweave/schemas/tables`, and
`@pdfweave/schemas/utils`. The boleto subpath includes the component, strict
data types and parser, barcode/linha-digitavel helpers, and physical geometry
constants. It requires a complete structured boleto record; a barcode alone
cannot supply the payer, beneficiary, addresses, instructions, or
institution-specific display data.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
