## @pdfweave/pdf-lib

`@pdfweave/pdf-lib` is the PDF engine package used by PDFweave. It carries the fork lineage from upstream pdfme and Hopding/pdf-lib while publishing under the `@pdfweave/*` namespace for the PDFweave fork.

## Install

```bash
npm install @pdfweave/pdf-lib
```

## Usage

```ts
import { PDFDocument, StandardFonts, rgb } from '@pdfweave/pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([595.28, 841.89]);
const font = await doc.embedFont(StandardFonts.Helvetica);

page.drawText('Hello PDFweave', {
  x: 50,
  y: 760,
  size: 18,
  font,
  color: rgb(0.1, 0.1, 0.1),
});

const pdf = await doc.save();
```

## Notes

Most applications should use `@pdfweave/generator` rather than this package directly.

Use this package when you need low-level PDF creation, inspection, page copying, or custom rendering primitives.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme and Hopding/pdf-lib.
