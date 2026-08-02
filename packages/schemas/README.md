## @pdfweave/schemas

`@pdfweave/schemas` contains the built-in PDFweave schema plugins for text, images, SVG, tables, barcodes, validated boleto de cobranca fichas, shapes, dates, links, signatures, and form controls. PDFweave is forked from upstream pdfme, and these plugins continue that model under the PDFweave namespace.

## Install

```bash
npm install @pdfweave/schemas
```

## Usage

```ts
import { generate } from "@pdfweave/generator";
import { text, image, table, barcodes, boleto } from "@pdfweave/schemas";

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
data types and parser, barcode/linha-digitavel helpers, Pix EMV/CRC parsing and
validation, and physical geometry constants. It requires a complete structured
boleto record; a barcode alone cannot supply the payer, beneficiary, addresses,
instructions, or institution-specific display data.

Optional `pix` input accepts only a structurally validated, complete Pix Copia
e Cola / BR Code payload issued by the integrating bank or PSP. The component
does not validate DICT key ownership or syntax, contact a dynamic endpoint,
create a payload from a raw URL/key, register a charge, or infer whether an
issuer permits the `instructions-right` QR placement. The fixed QR includes at
least four quiet modules on each side and rejects an encoded matrix above QR
version 8 so the 20.7 mm box retains four printer dots per module at 300 DPI.
Up to three independent 180-character instruction lanes are supported and
render-tested at the minimum ficha width. Test records redact identifiers by
default; `testPaymentIdentifiers: 'render'` enables inspectable barcode, linha,
and Pix QR evidence without removing the non-payable watermark.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
