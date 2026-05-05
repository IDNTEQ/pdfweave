## @pdfweave/ui

`@pdfweave/ui` provides the browser UI classes for PDFweave: `Designer`, `Form`, and `Viewer`. PDFweave is forked from upstream pdfme, preserving the template-driven UI model while publishing under the `@pdfweave/*` namespace.

## Install

```bash
npm install @pdfweave/ui
```

## Usage

```ts
import { Designer } from '@pdfweave/ui';
import { text, image } from '@pdfweave/schemas';

const designer = new Designer({
  domContainer: document.getElementById('app')!,
  template,
  plugins: { text, image },
});

designer.onChangeTemplate((nextTemplate) => {
  console.log(nextTemplate);
});
```

## Notes

The published bundle includes React and React DOM, so consumers do not install them separately just to use the classes.

Use `@pdfweave/schemas` for built-in plugins, or provide custom plugins that match the `@pdfweave/common` contracts.

## Links

- [PDFweave repository](https://github.com/IDNTEQ/pdfweave)
- [Migration guide](../../MIGRATION.md)
- [Changelog](../../CHANGELOG.md)

## License

MIT, same as upstream pdfme.
