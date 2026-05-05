## @pdfweave/converter

`@pdfweave/converter` provides PDF conversion helpers for PDFweave, including PDF-to-image, PDF page-size inspection, and image-to-PDF conversion. PDFweave is forked from upstream pdfme, with package names and docs updated for the `@pdfweave/*` namespace.

## Install

```bash
npm install @pdfweave/converter
```

## Usage

```ts
import { pdf2img, pdf2size, img2pdf } from '@pdfweave/converter';

const pdfBytes = await fetch('/invoice.pdf').then((res) => res.arrayBuffer());

const pageImages = await pdf2img(pdfBytes, {
  imageType: 'png',
  scale: 2,
});

const pageSizes = await pdf2size(pdfBytes);
const rebuiltPdf = await img2pdf(pageImages, {
  size: pageSizes[0],
});
```

## Notes

Browser builds use a bundled PDF.js worker asset.

Node.js builds use `@napi-rs/canvas` for rendering.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
