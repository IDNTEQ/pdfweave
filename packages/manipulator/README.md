## @pdfweave/manipulator

`@pdfweave/manipulator` provides PDF document operations for PDFweave, including merge, split, remove, insert, rotate, move, and organize. PDFweave is forked from upstream pdfme, with package naming and docs updated for the PDFweave fork.

## Install

```bash
npm install @pdfweave/manipulator
```

## Usage

```ts
import { merge, rotate, split } from '@pdfweave/manipulator';

const first = await fetch('/a.pdf').then((res) => res.arrayBuffer());
const second = await fetch('/b.pdf').then((res) => res.arrayBuffer());

const merged = await merge([first, second]);
const rotated = await rotate(merged, 90, [0]);
const parts = await split(rotated, [{ start: 0, end: 0 }]);

console.log(parts[0].byteLength);
```

## Notes

Page indexes are zero-based.

The package builds on `@pdfweave/pdf-lib` and returns PDF bytes as `Uint8Array` values.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
