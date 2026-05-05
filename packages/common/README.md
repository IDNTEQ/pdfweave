## @pdfweave/common

`@pdfweave/common` contains the shared TypeScript types, validators, constants, layout helpers, data-binding utilities, and plugin contracts used across PDFweave. PDFweave is forked from upstream pdfme, and this package preserves that foundation under the `@pdfweave/*` namespace.

## Install

```bash
npm install @pdfweave/common
```

## Usage

```ts
import { BLANK_A4_PDF, checkTemplate, mm2pt } from '@pdfweave/common';
import type { Template } from '@pdfweave/common';

const template: Template = {
  basePdf: BLANK_A4_PDF,
  schemas: [[]],
};

checkTemplate(template);

const marginPt = mm2pt(12);
console.log(marginPt);
```

## Notes

Use this package for template types, schema contracts, runtime validation, unit conversion, expression helpers, and plugin authoring types.

Most applications install this indirectly through `@pdfweave/generator`, `@pdfweave/schemas`, or `@pdfweave/ui`.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
