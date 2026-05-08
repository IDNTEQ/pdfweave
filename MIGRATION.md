# Migrating from pdfme to PDFweave

> tl;dr — for templates that don't use binding / anchors / smart tables /
> stationery PDFs, migration is a global find-and-replace plus a fresh
> install. About five minutes.

PDFweave is a fork of pdfme. The template JSON format, the generator API,
and the Designer React component are all source-compatible. The npm
package names changed, and a few additive APIs landed.

---

## 1. Swap the package names

Find-and-replace in your codebase:

| pdfme | PDFweave |
| --- | --- |
| `@pdfme/common` | `@pdfweave/common` |
| `@pdfme/generator` | `@pdfweave/generator` |
| `@pdfme/schemas` | `@pdfweave/schemas` |
| `@pdfme/ui` | `@pdfweave/ui` |
| `@pdfme/converter` | `@pdfweave/converter` |
| `@pdfme/manipulator` | `@pdfweave/manipulator` |
| `@pdfme/pdf-lib` | `@pdfweave/pdf-lib` |
| `@pdfme/cli` | `@pdfweave/cli` |

In `package.json`:

```diff
 {
   "dependencies": {
-    "@pdfme/generator": "^5.x.x",
-    "@pdfme/schemas": "^5.x.x"
+    "@pdfweave/generator": "^0.1.0",
+    "@pdfweave/schemas": "^0.1.0"
   }
 }
```

In your source:

```diff
-import { generate } from '@pdfme/generator';
-import { text, image, table } from '@pdfme/schemas';
+import { generate } from '@pdfweave/generator';
+import { text, image, table } from '@pdfweave/schemas';
```

Then:

```bash
rm -rf node_modules package-lock.json   # or pnpm-lock.yaml / yarn.lock
pnpm install
```

That's it for the no-features-changed path. Your existing templates will
render identically.

---

## 2. Things to know about PDFweave that aren't in pdfme

You don't have to use any of these — but if your template hits a wall
that pdfme couldn't get past, this is probably why.

### 2a. Data bindings

Schemas can reference a path into your input JSON instead of carrying a
copy of the data:

```ts
{
  name: 'invoiceTotal',
  type: 'text',
  position: { x: 150, y: 250 },
  width: 40,
  height: 8,
  binding: { path: 'invoice.total', format: { kind: 'currency', currency: 'USD' } },
}
```

The Designer's right sidebar shows a "Binding" panel that lets you
drag-and-drop fields from your sample JSON (passed as
`options.designData` to `new Designer(...)`).

### 2b. Anchor layouts

A schema can be positioned relative to another schema instead of using
absolute coordinates:

```ts
{
  name: 'subtotal',
  type: 'text',
  // ...
  layout: {
    horizontal: { mode: 'alignRightEdge', anchor: { id: 'lineItems' } },
    vertical: { mode: 'belowBottomEdge', anchor: { id: 'lineItems' }, gap: 4 },
  },
}
```

When `lineItems` reflows, `subtotal` follows. Five rules total — see
[`packages/common/src/types.ts`](./packages/common/src/types.ts) for
the full grammar.

### 2c. Smart tables

`table` schemas can have:

- `binding.columns` — bind each column to a data path with format hints
- `repeatHead: true` — header row repeats on overflow pages
- Reflow across pages — anchored siblings update accordingly

```ts
{
  name: 'lineItems',
  type: 'table',
  // ...
  repeatHead: true,
  binding: {
    path: 'invoice.lineItems',
    columns: [
      { path: 'description', format: { kind: 'text' } },
      { path: 'qty', format: { kind: 'number' } },
      { path: 'amount', format: { kind: 'currency', currency: 'USD' } },
    ],
  },
}
```

### 2d. Stationery PDFs

A new `BasePdf` shape — single-page PDF stamped on every output page,
with reflow still working:

```ts
{
  basePdf: {
    stationeryPdf: 'data:application/pdf;base64,...',  // or ArrayBuffer / Uint8Array
    width: 210,
    height: 297,
    padding: [40, 20, 30, 20],
    staticSchema: [ /* optional — composes ON TOP of the stationery */ ],
  },
  schemas: [ /* dynamic content here */ ],
}
```

Use this for invoices/statements/letters that need a recurring header,
footer, watermark, or branded background, where the body content reflows
across pages.

Compared to pdfme's CustomPdf basePdf: PDFweave's StationeryPdf does NOT
disable table reflow. The stationery is re-stamped on each page, including
pages added by table overflow.

---

## 3. Things that work differently

A short list of edge cases where PDFweave doesn't match pdfme byte-for-byte:

- **`Object.hasOwn` requires ES2022** — PDFweave's TypeScript output
  targets ES2022. If you're on an old `target: "es2020"` config, bump
  it. Most modern Node / Vite / esbuild setups are already there.
- **Designer layout** — the right sidebar has new "Binding" and
  "Anchor" panels. The position/size editors above them are unchanged.
- **`@pdfweave/common` is bigger than `@pdfme/common`** — by ~30 KB
  gzipped due to the binding + anchor type definitions and helpers.

---

## 4. Going back

If PDFweave isn't the right fit for you, swapping back to pdfme is the
same find-and-replace in reverse. Templates that DON'T use binding,
anchors, smart-table column bindings, or stationery basePdf will work
in pdfme unchanged.

If you ARE using those features and need to migrate to pure pdfme, the
changes are:

- Strip `binding` from each schema; put real values in `inputs[]` instead.
- Strip `layout` from each schema; convert to absolute `position`.
- Strip column `binding.columns` from tables; pass row data via inputs.
- Convert `StationeryPdf` basePdf back to `BlankPdf` + a giant
  `staticSchema`, or accept that table reflow will be disabled with a
  CustomPdf basePdf.

We'd love to hear why you migrated back — open an issue at
[github.com/IDNTEQ/pdfweave/issues](https://github.com/IDNTEQ/pdfweave/issues).
That feedback shapes what we work on next.

---

## 5. Getting help

- Open an issue: [github.com/IDNTEQ/pdfweave/issues](https://github.com/IDNTEQ/pdfweave/issues)
- Discussion / questions: [github.com/IDNTEQ/pdfweave/discussions](https://github.com/IDNTEQ/pdfweave/discussions)
