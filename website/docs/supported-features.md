# Supported Features

In PDFweave, the following elements can be rendered.  
For elements that are not supported, you can add your own rendering process using the [plugin mechanism](/custom-schemas).

## Currently Supported

:::info

For using schemas other than the Text schema, please refer to the following documentation.  
[Using Schemas from @pdfweave/schemas]/custom-schemas#using-schemas-from-pdfweaveschemas)

:::

### Text (text)

- Style-related
  - Font Size
  - Letter Spacing
  - Text Align
  - Vertical Align
  - Line Height
  - Text Color
  - Background Color
  - Underline
  - Strikethrough
- Font-related
  - TrueType fonts (TTF & TTC)
  - OpenType fonts with PostScript or TrueType outlines (TTF, OTF, & OTC)
  - Support for CJK (Chinese, Japanese, Korean) fonts
  - Embedding and subsetting of fonts
  - Support for multiple fonts and fallback fonts
  - Dynamic Font Sizing
    - Detailed options for Min, Max, Fit

### Multivariable Text (multiVariableText){#multivariable-text}

- As per text, but supporting 0 to n variables in a single text field

### Shape

- **Line (line)**
  - Style-related
    - Color
- **Rectangle (rectangle)**
  - Style-related
    - Border Width
    - Border Color
    - Color
    - Radius
- **Ellipse (ellipse)**
  - Style-related
    - Border Width
    - Border Color
    - Color

### Graphics

- **Image (image)**
  - Formats
    - JPEG
    - PNG
    - PDF (embed pdf inside pdf)
- **SVG (svg)**

### Barcodes

- Various types
  - qrcode
  - japanpost
  - ean13
  - ean8
  - code39
  - code128
  - nw7
  - itf14
  - upca
  - upce
  - gs1datamatrix
  - pdf417
- Style-related
  - Bar Color
  - Background Color
  - Text Color
  - [Include text option (planned support)](https://github.com/IDNTEQ/pdfweave/issues/23)

### Boleto de cobranca (boleto)

- Generic FEBRABAN `ficha de compensacao` rendered from strict structured data
- Canonical 44-digit barcode validation and derived 47-digit linha digitavel
- Numeric and uppercase alphanumeric CNPJ validation
- Fixed and variable amounts, direct and third-party beneficiary display
- Reconciled fixed-amount discount, interest, and charged-value fields
- Test mode omits the barcode and digitable line, adds explicit redaction
  labels and a non-payable watermark
- Fail-closed geometry/text/static-logo preflight, including animated-PNG
  rejection before raster decode
- Conventional vector header digits with physical stroke and ink dimensions
- Vector mechanical-authentication caption at the 2 mm height ceiling and 0.3
  mm stroke width
- Exact-size A4 two-up and landscape A3 four-up qualification artifacts

The component does not derive a complete boleto from a barcode, invent a
bank-specific free field, register a title, or replace bank/provider
homologation. See the repository's
[boleto operator guide](https://github.com/IDNTEQ/pdfweave/blob/main/docs/printing/boleto.md)
for the complete contract and supported boundaries.

### Table (table){#table}

Details: [Tables with Dynamic Data](/tables)

- Style-related
  - Table
    - Border Width
    - Border Color
  - Header / Body
    - Font Name
    - Font Size
    - Letter Spacing
    - Text Align
    - Vertical Align
    - Line Height
    - Text Color
    - Border Color
    - Background Color
    - Border Width
    - Padding
  - Column
    - Text Align
- Explicit percentage column widths
- Cell word wrapping with automatic row-height growth
- Multi-page reflow with optional repeated headings

### Existing PDF backgrounds

- Render variable schemas over an existing PDF base
- Preserve MediaBox and CropBox geometry
- Position authored top-left coordinates relative to the visible CropBox
- Reuse a single-page stationery PDF across dynamically generated pages

The qualification dashboard includes a boleto over a dark patterned base PDF
with an asymmetric CropBox. The test checks unchanged surrounding artwork,
opaque component backing, preserved page boxes, and non-decodable test-mode
payment-identifier regions.

### Select (select)

- Options
- Style-related
  - Font Name
  - Font Size
  - Letter Spacing
  - Text Align
  - Vertical Align
  - Line Height
  - Text Color
  - Background Color

### Date (date) / Time (time) / DateTime (dateTime)

- Date Format
- Style-related
  - Font Name
  - Font Size
  - Letter Spacing
  - Text Align
  - Text Color
  - Background Color

### Radio Button (radioGroup) / Check Box (checkbox)

- Style-related
  - Color

## Print Imposition

The independent, release-pending [`@pdfweave/imposition`](/imposition)
workspace package currently supports simplex n-up output with:

- A2, A3, A4, A5, A6, Letter, Legal, and custom physical sheet sizes;
- configurable rows, columns, margins, gutters, fill order, alignment,
  contain/cover/no scaling, clipping, and automatic 90-degree rotation;
- source page selection, repeated selections, copies, and collated or
  uncollated sequencing;
- MediaBox, CropBox, TrimBox, BleedBox, or ArtBox selection with explicit
  fallback warnings;
- inspectable placement plans and configurable workload limits.

Duplex imposition, booklet signatures, crop and registration marks, creep,
and color/preflight controls are planned, not currently supported.

## Planned Support

- [HyperLink](https://github.com/IDNTEQ/pdfweave/issues/319)

## Custom Feature Requests

While PDFweave is an open-source project released under the MIT License, we are open to considering custom feature additions for a fee.  
**If you are willing to pay, we can evaluate and implement your requested features.**  
Please note that any additional functionality will always be released as open source. If this approach works for you, please [contact us](https://github.com/IDNTEQ/pdfweave/issues).
