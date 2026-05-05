## @pdfweave/cli

`@pdfweave/cli` is the command-line interface for PDFweave JSON-first PDF workflows. PDFweave is a fork of upstream pdfme, and this package keeps that lineage while using PDFweave package names, binary names, and runtime branding.

## Install

```bash
npm install @pdfweave/cli
```

For global command use:

```bash
npm install -g @pdfweave/cli
```

## Usage

```bash
pdfweave --help
pdfweave validate template.json
pdfweave generate job.json --output output.pdf
pdfweave doctor job.json
```

Programmatic consumers usually use the library packages directly:

```ts
import { generate } from '@pdfweave/generator';
import { text } from '@pdfweave/schemas';
```

## Notes

The CLI expects Node.js 20 or later.

Automatic CJK font downloads are cached under `~/.pdfweave/fonts`.

Existing `~/.pdfme/fonts` caches are migrated on first use.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
