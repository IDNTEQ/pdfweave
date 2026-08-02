# Boleto de cobranca

PDFweave's `boleto` component renders the generic FEBRABAN boleto de cobranca
`ficha de compensacao` from validated structured data. It is intended for
applications that already receive registered title data from a bank or
billing provider.

It is not a barcode-to-boleto lookup service. A 44-digit barcode does not
contain the payer and beneficiary records, addresses, instructions, or a
portable interpretation of the bank-specific free field. Those fields must be
supplied explicitly.

See [RFC 0003](../rfc/0003-boleto-schema.md) for the design and compliance
decisions.

## Supported document

Phase 1 supports:

- `kind: 'cobranca'`;
- `variant: 'ficha-compensacao'`;
- generic widths from 170 mm through 216 mm;
- generic heights from 95 mm through 108 mm;
- fixed or variable amounts;
- direct or third-party beneficiary display;
- a canonical 44-digit barcode and derived 47-digit line;
- the 2025 due-factor reset and issuer-supplied factor `0000`;
- a bank/provider-supplied static PNG or JPEG logo;
- optional rendering of a complete, bank/PSP-supplied Pix BR Code payload in
  the instructions area when the issuer profile permits that placement;
- test output that redacts payment identifiers by default, or renders them
  explicitly for qualification, while always retaining a visible non-payable
  watermark.

It does not support arrecadacao, boleto-proposta, `988`/ISPB arrangements,
bank-specific free-field generation, Pix payload generation, or the
registration and coordinated lifecycle of a hybrid boleto. The component is
the payment ficha, not the payer receipt or a complete A4 page.

## Install and register

Use the `boleto` plugin with the same explicit plugin registration as other
PDFweave schemas:

```ts
import { generate } from '@pdfweave/generator';
import { boleto } from '@pdfweave/schemas';

const pdf = await generate({
  template,
  inputs: [{ invoiceBoleto: boletoData }],
  plugins: { boleto },
});
```

The template schema names the input property and fixes the physical ficha
geometry:

```ts
const schema = {
  name: 'invoiceBoleto',
  type: 'boleto',
  variant: 'ficha-compensacao',
  position: { x: 5, y: 5 },
  width: 200,
  height: 95,
  rotate: 0,
  opacity: 1,
};
```

The input can be a `BoletoData` object or a JSON string containing that exact
object. Prefer the object form in application code. Validation is strict;
unknown and misspelled properties fail rather than being ignored.

The plugin is an output-only composite. Its Designer property panel does not
offer controls for editing legal or payment subfields, and its child renderers
always run in viewer mode. The outer schema deliberately remains input-bound
so required-field validation and per-record values work. Supply the complete
object through input binding and edit it in an application workflow that
performs the required issuer/provider checks.

## Required input

Every boleto needs these fields:

| Field                | Purpose                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `version`            | Contract version; currently `1`                                                |
| `kind`               | Must be `cobranca`                                                             |
| `registrationStatus` | `registered`, or always-watermarked `test`                                     |
| `institution`        | Display name, three-digit code, display digit, optional logo                   |
| `beneficiaryMode`    | `direct` or `third-party`                                                      |
| `beneficiary`        | Name, checked CPF/CNPJ, and address                                            |
| `finalBeneficiary`   | Name and checked CPF/CNPJ; required for `third-party` and different from payer |
| `payer`              | Name, checked CPF/CNPJ, and address                                            |
| `paymentLocation`    | Bank/provider payment instruction                                              |
| `dueDate`            | Real ISO date, `YYYY-MM-DD`                                                    |
| `barcode`            | Canonical bank/provider-issued 44 digits                                       |
| `amountMode`         | `fixed` or `variable`                                                          |
| `documentValueCents` | Required and positive for `fixed`; optional for `variable`                     |

Each beneficiary and payer address requires `street`, `city`, two-letter
`state`, and `postalCode`. `number`, `complement`, and `district` are optional.
`finalBeneficiary` is identity-only and must not contain an address. In
third-party mode its CPF/CNPJ must differ from the payer after punctuation is
removed; direct mode requires that it be omitted. Postal codes may be eight
digits or `NNNNN-NNN`.

CPF values are numeric. CNPJ accepts either the historical 14-digit form or
the Receita Federal uppercase alphanumeric form: 12 uppercase ASCII letters
or digits followed by two numeric check digits. Both may be unformatted or use
the conventional `NN.NNN.NNN/NNNN-NN` punctuation positions. Check digits are
validated with the Receita Federal ASCII-minus-48 modulo-11 rule; lowercase
letters are rejected rather than normalized silently.

## Optional display data

The generic field grid accepts:

- `digitableLine`;
- `agencyBeneficiaryCode`;
- `documentDate`;
- `documentNumber`;
- `documentSpecies`;
- `acceptance` (`A` or `N`);
- `processingDate`;
- `ourNumber`;
- `bankUse`;
- `portfolio`;
- `currencyQuantity`;
- `currencyUnitValueCents`;
- `instructions`;
- `pix`;
- `testPaymentIdentifiers` (test records only);
- `discountDeductionCents`;
- `interestPenaltyCents`;
- `chargedAmountCents`.

All money values are integer cents. Do not pass decimal real values and expect
rounding. When `digitableLine` is omitted, PDFweave derives it. When supplied,
it is validation input and must represent exactly the same barcode.

The three optional adjustment values are accepted only when
`amountMode: 'fixed'`. They map to the Annex III printed boxes:
`discountDeductionCents` to `(-) Desconto/Abatimento`,
`interestPenaltyCents` to `(+) Juros/Multa`, and `chargedAmountCents` to the
printed `(=) Valor Pago` box. Annex III's explanatory prose calls the last
semantic field `VALOR COBRADO`; the public property follows that semantic name
while the rendered label follows the model exactly.

Supplying a discount or interest value also requires `chargedAmountCents`, and
the values must reconcile exactly:

```text
chargedAmountCents = documentValueCents - discountDeductionCents + interestPenaltyCents
```

Omitted discount and interest values count as zero. A charged amount supplied
without either adjustment must equal the document value. Negative results and
results above the ten-digit barcode amount ceiling are rejected. Variable
amount records reject all three adjustment properties rather than displaying
an amount that is not encoded in the barcode.

Each `instructions` array entry owns an independent vertical lane. Text wraps
and, when necessary, shrinks within that lane; a long first entry does not
push the second or later entries down. Up to three entries of 180 characters
each are accepted. This boundary is render-tested at the minimum 170 mm ficha
width, both with and without Pix. When a Pix QR is present, the same lanes use
the remaining width to the left of the fixed QR region.

## Complete test input

This fixture uses a published checksum vector with synthetic presentation
data. It is intentionally `test`; because it does not opt into identifier
rendering, the renderer omits its barcode and digitable line, replaces both
with redaction labels, and marks the output `AMOSTRA - NÃO PAGÁVEL`. Do not
turn fixture data into production data by changing only the status.

```ts
const boletoData = {
  version: 1,
  kind: 'cobranca',
  registrationStatus: 'test',
  institution: {
    name: 'Banco de teste',
    code: '341',
    codeDigit: '7',
  },
  beneficiaryMode: 'direct',
  beneficiary: {
    name: 'Empresa de teste Ltda.',
    taxId: { type: 'cnpj', number: '11.222.333/0001-81' },
    address: {
      street: 'Avenida de Teste',
      number: '100',
      district: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      postalCode: '01001-000',
    },
  },
  payer: {
    name: 'Pagador de teste',
    taxId: { type: 'cpf', number: '529.982.247-25' },
    address: {
      street: 'Rua de Teste',
      number: '20',
      city: 'Sao Paulo',
      state: 'SP',
      postalCode: '01310-100',
    },
  },
  paymentLocation: 'Pagavel na rede bancaria ate o vencimento',
  dueDate: '2002-05-01',
  barcode: '34196166700000123451101234567880057123457000',
  digitableLine: '34191.10121 34567.880058 71234.570001 6 16670000012345',
  amountMode: 'fixed',
  documentValueCents: 12345,
  agencyBeneficiaryCode: '0001 / 12345-6',
  documentDate: '2002-04-20',
  documentNumber: 'TESTE-0001',
  documentSpecies: 'DM',
  acceptance: 'N',
  processingDate: '2002-04-20',
  ourNumber: '12345678-0',
  currencyQuantity: '1',
  instructions: ['DOCUMENTO DE TESTE - NAO RECEBER', 'Sem valor financeiro'],
} as const;
```

For an inspectable test specimen that exercises the barcode, line, and Pix QR,
set the explicit test policy and pass the complete payload issued by the test
bank or PSP:

```ts
const visibleTestSpecimen = {
  ...boletoData,
  testPaymentIdentifiers: 'render',
  pix: {
    emvPayload: completePixCopiaEColaFromBankOrPsp,
    placement: 'instructions-right',
  },
} as const;
```

The `AMOSTRA - NÃO PAGÁVEL` watermark remains. This option exists for
qualification evidence; it is not a registration or payability assertion.

## Barcode and line behavior

The 44-digit barcode is canonical. Its fields are:

```text
1-3   institution code
4     currency (9 for BRL)
5     general check digit
6-9   due-date factor
10-19 amount in cents, or zero for variable amount
20-44 bank-specific campo livre
```

PDFweave validates the general modulo-11 digit and derives the three
modulo-10 line digits. The public digit helpers support explicit validation,
conversion, and formatting:

```ts
import {
  deriveDigitableLine,
  digitableLineToBarcode,
  formatDigitableLine,
  validateBoletoBarcode,
} from '@pdfweave/schemas';

const canonical = validateBoletoBarcode(boletoData.barcode);
const line = deriveDigitableLine(canonical);
const display = formatDigitableLine(line);
const roundTrip = digitableLineToBarcode(display);
```

`buildBoletoBarcode()` is not a generic issuer. It is available only for code
that already has the bank-specific 25-digit free field:

```ts
const barcode = buildBoletoBarcode({
  institutionCode: '341',
  dueDate: '2026-08-31',
  amountMode: 'fixed',
  documentValueCents: 125_00,
  freeField: freeFieldIssuedByBankAdapter,
});
```

Never make up `freeField` or derive it from a third-party example. Its
semantics vary by institution, agreement, wallet, and product version.

## Pix payload and placement

`pix.emvPayload` is the complete Pix Copia e Cola / BR Code text returned by
the issuing bank or PSP. PDFweave parses the UTF-8 EMV TLV structure and
requires:

- a final CRC16 tag `63` with length `04` and a correct checksum;
- payload format indicator `00` equal to `01`;
- exactly one Pix merchant-account-information tag from `26` through `51`,
  whose GUI `00` is `br.gov.bcb.pix` (ASCII case-insensitive);
- a static Pix key in merchant tag `01` or a dynamic URL in merchant tag `25`,
  but not both, with an optional compatible root initiation method (`11` for
  static or `12` for dynamic);
- a four-digit merchant category code in tag `52`;
- transaction currency `53` equal to `986` (BRL);
- country code `58` equal to `BR`;
- non-empty merchant name `59` and merchant city `60`;
- additional data tag `62` with non-empty reference label `05`;
- at most 499 Unicode characters as a defensive parser ceiling; and
- for a static payload, exact equality between tag `54`, when present, and
  `documentValueCents`. Per the Pix manual, a dynamic payload obtains its
  authoritative amount from the URL response, so a root tag `54` is ignored.

TLV lengths count Unicode characters as required by BR Code; CRC16 is still
calculated over the UTF-8 bytes of the exact payload through the `6304` header.
The 499-character boundary is only a defensive parser ceiling, not a BR Code
maximum or a promise that every shorter payload fits the print box. QR density
depends on the encoder's numeric, alphanumeric, and byte segmentation.

PDFweave then encodes that exact payload as an EC-M QR in a fixed 20.7 mm box,
including at least four quiet modules on every side. Render preflight measures
the actual bwip-js matrix and permits at most 49 x 49 modules (QR version 8),
which retains at least four printer dots per module at 300 DPI. Denser payloads
fail before PDF drawing. The exact BCB-published static and dynamic examples
encode as 45 x 45 and 49 x 49 modules and are included in this boundary test.
PDF and browser tests measure the emitted SVG path rather than trusting an
encoder option, and the integration test decodes the exact payload after PDF
rasterization at 300 DPI.

This is structural validation of a complete bank/PSP-supplied payload, not
validation of DICT key ownership or syntax, a dynamic endpoint's URL contract
or liveness, or provider authorization. PDFweave does not accept a raw URL or
Pix key as a substitute, invent the remaining BR Code fields, register a
charge, or coordinate settlement between the boleto and Pix arrangements.
Supply only a complete payload from the contracted bank/PSP workflow.

`placement: 'instructions-right'` reserves the right side of the
`Informações de responsabilidade do Beneficiário` block. That placement is
not universal. Santander's February 2026 CNAB 353/400 manual permits its
Boleto SX QR in this area, while CAIXA's SIGCB specification requires its
hybrid QR only in the payer receipt and expressly forbids it in the
`ficha de compensação`. Use this option only for an issuer profile whose
current manual and homologation approve it. PDFweave's validation proves the
supported BR Code structure and layout fit, not issuer authorization.

## Why barcode-only rendering is rejected

A valid barcode lets PDFweave recover or verify the institution code,
currency, check digit, due factor, encoded amount, and opaque free field. It
cannot supply:

- payer and beneficiary names, tax IDs, or addresses;
- payment location and instructions;
- issue and processing dates;
- document species, acceptance, and document number;
- the institution's display name, logo, agency, account, or portfolio;
- a universal `nosso numero` interpretation;
- proof that the title is registered and payable.

The due factor is not sufficient to infer a date after the 2025 reset because
the factors repeat. PDFweave therefore always requires an explicit printed due
date. Factors `1000` through `9999` are cross-checked against it. An
issuer-supplied factor `0000` means that no due date is encoded, so the printed
date remains mandatory but cannot be cross-checked against those four digits.

An application may expose a barcode inspection screen, but that is a
different feature from generating a payment document.

## Due-date factors

The generated cycles intentionally cover factors `1000` through `9999`:

| Date       | Encoded factor |
| ---------- | -------------: |
| 2000-07-03 |           1000 |
| 2025-02-21 |           9999 |
| 2025-02-22 |           1000 |
| 2025-02-23 |           1001 |
| 2025-02-24 |           1002 |
| 2049-10-13 |           9999 |

Date calculations use UTC calendar values. Dates outside these ranges are
rejected instead of wrapping or guessing. The explicit due date selects the
cycle.

Validation also accepts an already issued, checksum-valid barcode whose
factor is `0000`. In that case the supplied `dueDate` is still validated as a
real ISO date and printed, but it is not encoded in the barcode.
`calculateDueDateFactor()` and `buildBoletoBarcode()` generate only the
documented `1000`-`9999` cycles; they do not generate factor `0000`.

## Physical print geometry

The supported ficha is 170-216 mm wide and 95-108 mm high. The default
200 x 95 mm size fits the generic range.

| Element                   | Geometry                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Barcode symbology         | Numeric Interleaved 2 of 5                                                                                |
| Barcode payload           | Exactly 44 digits                                                                                         |
| Barcode box               | Exactly 103 x 13 mm                                                                                       |
| Barcode left edge         | 5 mm from the ficha left edge                                                                             |
| Barcode vertical center   | 12 mm above the ficha bottom edge                                                                         |
| Pix QR box, when enabled  | Exactly 20.7 x 20.7 mm, EC-M, at most 49 modules per side, including at least four quiet modules per side |
| PDFweave field grid rules | Deterministic 0.3 mm project choice                                                                       |

FEBRABAN Annex V sections 2.2.1(a), 2.2.1(g), and 2.3.5 state these
printed-character targets; Annex III supplies the boleto model referenced by
that print specification:

| Text                            | Printed target                            |
| ------------------------------- | ----------------------------------------- |
| Institution code and digit      | 5 mm characters with 1.2 mm strokes       |
| Linha digitável                 | 3.5-4.5 mm characters with 0.3 mm strokes |
| Mechanical-authentication label | At most 2 mm with 0.3 mm strokes          |

The institution code (for example, `001-9`), linha digitável, and
`Autenticação Mecânica - Ficha de Compensação` caption are ordinary text
primitives rendered through the same shared text plugin and font resources as
other boleto text. They are text in the browser renderer as well. They are not
bitmap images and do not use PDFweave's former custom single-stroke alphabet.

Those are final printed-output targets, not a required drawing technique. The
specification does not require a custom stroke alphabet or converting the text
to an image. PDFweave uses bold 20 pt institution text (bounded to 18 pt), bold
14 pt line text, and 6.5 pt caption text as nominal settings. At narrower
supported ficha widths, the line receives a horizontal text scale without
reducing its 14 pt vertical size; it remains selectable font text and uses the
same configured font in PDF and browser output. The 300 DPI
qualification raster currently measures the institution-code ink envelope at
about 5.17 mm; production must still measure the complete hard-copy output and
pass issuer homologation.
The uniform 0.3 mm grid and individual cell sizes are stable PDFweave rendering
choices, not claims that every one is separately mandated by FEBRABAN.

The schema rejects any nonzero effective rotation, any opacity other than 1,
negative author-facing positions, and placements outside the visible PDF page.
For an existing PDF base, the generator translates authored top-left
coordinates into its CropBox and may pass negative internal coordinates when
the MediaBox has a nonzero origin. The renderer accepts those internal values
only after checking the complete ficha against the intersection of CropBox and
MediaBox. It paints an opaque white ficha background before the validated
content, leaving surrounding stationery untouched.

When packing boleto pages onto A4 or A3 sheets, use
`@pdfweave/imposition` with `scale: 'none'`, no auto-rotation, and cells large
enough to avoid clipping. The qualification suite uses physical-scale boleto
arrangements rather than shrinking the barcode to make more items fit.

Preview at 100 percent, but also print and measure a sample. Verify the final
printer/RIP path has not introduced Fit-to-Page scaling. Scanner qualification
should use the same printers, paper, resolution, and finishing path as the
production job.

## Registered and test output

Use `registrationStatus: 'test'` for examples, previews, CI fixtures, and
qualification artifacts. By default, or with
`testPaymentIdentifiers: 'redact'`, the renderer does not draw the barcode or
digitable line, places digit-free redaction labels in those regions, and adds a
visible `AMOSTRA - NÃO PAGÁVEL` watermark. A test record may set
`testPaymentIdentifiers: 'render'` to make its validated barcode, line, and
optional Pix QR inspectable. The watermark cannot be disabled.

Test records must still supply checksum-valid, internally consistent payment
identifiers so the same validation path is exercised. A redacted test never
copies them into the layout or browser DOM. Qualification manifests omit the
identifier and Pix payload values even when the visible synthetic specimen
renders them.

Use `registrationStatus: 'registered'` only after the application has obtained
the title through its contracted bank/provider workflow. PDFweave does not
call that provider or check registration status. The value is a caller
assertion used to prevent accidental production of unmarked fixtures.

Do not expose `testPaymentIdentifiers: 'render'` as an end-user production
control. It is a deliberate test-evidence policy, not a substitute for
provider-issued registered data.

## Validation errors

The renderer fails before drawing when data or geometry is inconsistent. It
checks:

- real ISO dates;
- CPF/CNPJ and CEP syntax and check digits;
- barcode length and general check digit;
- institution prefix and BRL currency digit;
- known institution display suffixes (`001-9`, `104-0`, `341-7`, and `748-X`);
- factors `1000`-`9999` against the explicit date, or factor `0000` semantics;
- encoded amount and integer-cent input;
- fixed-amount adjustment reconciliation and variable-amount adjustment
  exclusion;
- optional line field digits and barcode round trip;
- test identifier policy, including rejection on registered data and the
  explicit render requirement for a Pix-bearing test record;
- Pix UTF-8 EMV TLV shape, final CRC16, PFI, BRL currency, country, Pix GUI,
  payload length, and optional amount consistency;
- required final beneficiary data and a normalized CPF/CNPJ different from the
  payer in third-party mode;
- static logo media type, header, complete PNG/JPEG decode, early animated-PNG
  rejection, and limits of 2,048 pixels per edge, 4 megapixels, and 8,000,000
  data-URI characters, with a 64 MiB tracked-allocation cap for JPEG decoding;
- repeated-logo memoization without embedding the source more than once per
  output PDF;
- conservative text limits and minimum-font-size fit;
- ficha size, position, page bounds, rotation, and opacity.

The institution suffix is the printed digit in a display such as `001-9`; it
is not the general check digit at position 5 of the 44-digit barcode. The
pinned internal registry cross-checks only the four combinations above. Other
three-digit COMPE codes accept a syntactically valid digit or uppercase `X`,
but their suffix remains the provider's responsibility.

Errors use the stable prefix `[@pdfweave/schemas/boleto]`. Treat them as job
failures; do not catch them and print a partially populated fallback boleto.
Only validation and preflight rejection are guaranteed to occur before PDF
page drawing. Later embedding, barcode, or drawing failures are not
transactional; discard the entire `PDFDocument` after any render rejection.
Browser rendering is staged and replaces the component atomically.

Image decoding is currently synchronous. These per-logo caps limit individual
work, but deployments accepting many distinct logos should impose a
job-specific cumulative byte/pixel budget. Worker-based browser preflight and
a library-level cumulative unique-logo budget remain follow-up work.

## Compliance and homologation

PDFweave validates its supported specification and makes its output
inspectable. That is not the same as certifying a payable title.

Before production, the integrating organization must:

1. Contract with a bank or registered billing provider.
2. Obtain the canonical barcode and related display fields from that provider,
   or use a versioned adapter approved for that exact agreement.
3. Complete the institution's homologation process and approved test vectors.
4. Print physical samples through the real production path.
5. Check barcode dimensions, contrast, quiet zones, and scanner acceptance.
6. Execute controlled payment tests and reconcile the returned title data.
7. Protect payer personal data in logs, qualification artifacts, archives, and
   support bundles.

Describe output as "specification-validated by PDFweave". Do not describe it
as "FEBRABAN certified" or "bank certified" unless the institution has
separately provided that certification for the exact integration.

## Excluded formats

### Arrecadacao and convenio

Codes beginning with product identifier `8` use a 48-digit arrecadacao scheme,
different value/reference rules, and different check-digit placement. They
need a separate component and must never be passed to `boleto`.

### Pix integration boundary

The component can validate and render a complete issuer-supplied Pix BR Code
in the one explicit `instructions-right` placement. It does not generate a BR
Code from a URL/key, register a Pix charge, synchronize boleto/Pix lifecycle
events, or claim a universal issuer layout. Those operations belong in a
versioned bank/PSP adapter and its homologated workflow.

### Boleto-proposta

Boleto-proposta has distinct consent, offer, and disclosure requirements. It
is outside the generic cobranca renderer.

### Code 988 and ISPB arrangements

Phase 1 does not model arrangements identified through code `988` or an ISPB.
They will be added only with a dedicated standard and test vectors.

### Bank-specific free fields

PDFweave does not currently ship bank adapters. Banco do Brasil, CAIXA, Itau,
Santander, and other institutions define different free-field and agreement
rules. Each future adapter will be versioned, cite its official current
manual, and carry official check-digit vectors and homologation fixtures.

## Official sources

- [FEBRABAN Convencao da Cobranca, Annexes III-V, 2021-02-05](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Conven%C3%A7%C3%A3o%20da%20Cobran%C3%A7a%20-%2005_02_2021_f.pdf) - generic ficha, receipt, barcode, and printing rules. The reviewed file's SHA-256 is `da66c4e37ed636276549bcee8db0d50f10ecf334affb83bf88dd61d955def1c3`.
- [BCB Resolution 443/2024](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=443&tipo=Resolu%C3%A7%C3%A3o+BCB) - current regulatory source for boleto arrangements.
- [FEBRABAN boleto platform](https://portal.febraban.org.br/pagina/3150/1094/pt-br/servicos-novo-plataforma-boletos) - public registration-platform context.
- [Banco do Brasil boleto specification](https://www.bb.com.br/docs/pub/emp/empl/dwn/Doc5175Bloqueto.pdf) - example of institution-specific agreement and free-field rules.
- [CAIXA SIGCB specification](https://www.caixa.gov.br/Downloads/cobranca-caixa/ESP_COD_BARRAS_SIGCB_COBRANCA_CAIXA.pdf) - example of a different institution-specific barcode contract.
- [Itau CNAB/SISPAG manual](https://download.itau.com.br/bankline/SISPAG_CNAB.pdf) - institution vectors and integration rules.
- [Receita Federal alphanumeric CNPJ manual](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf) - accepted characters and the ASCII-minus-48 check-digit algorithm.
- [Sicredi CNAB 240 manual](https://www.sicredi.com.br/media/produtos/filer_public/2025/10/10/manual_cnab_240_28_1.pdf) - official `748-X` institution display evidence.
- [BCB FAQ: paying a boleto using Pix](https://www.bcb.gov.br/meubc/faqs/p/pagamento-de-boleto-utilizando-o-pix) - a boleto can be paid by Pix only when it presents the QR Code.
- [BCB BR Code Manual v2.0.1](https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/ManualBRCode.pdf) - character-counted TLV structure, common mandatory fields, sizes, amount grammar, and published payload vectors.
- [BCB Pix initiation standards manual](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf) - BR Code/EMV payload and QR initiation rules.
- [DENSO WAVE QR module-size guidance](https://www.qrcode.com/en/howto/cell.html) - four printer dots per module for stable operation.
- [DENSO WAVE QR symbol-area guidance](https://www.qrcode.com/en/howto/code.html) - four-module quiet zone.
- [Santander CNAB 353/400 v2.37, February 2026](https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob400ptbr/26-02-25_131730_h7800_layout_de_cobran%C3%A7a_353_400_posi%C3%A7%C3%B5es_v._2.37_fev_2026_%28portugu%C3%AAs%29.pdf) - issuer example permitting its dynamic QR in the boleto instructions area.
- [CAIXA SIGCB specification, section 3.5](https://www.caixa.gov.br/Downloads/cobranca-caixa/ESP_COD_BARRAS_SIGCB_COBRANCA_CAIXA.pdf) - issuer counterexample requiring the hybrid QR in the payer receipt and forbidding it in the ficha.

Always re-check the provider's current documentation during integration.
Pinned documents make tests reproducible; they do not freeze the external
rules.

## Roadmap

- Maintain PDF/UI parity and the executable minimum/maximum geometry tests.
- Maintain published qualification PDFs for source fichas, no-scale A4
  two-up, and landscape A3 four-up jobs with deterministic manifests.
- Extend the 300 DPI barcode and Pix QR raster verification to multiple
  resolutions and independent scanner/hard-copy acceptance.
- Add the payer receipt and full A4 document composition.
- Add versioned, independently reviewed bank adapters with official vectors.
- Add separate arrecadacao and boleto-proposta contracts, plus versioned
  issuer profiles for Pix placement and lifecycle behavior.
- Add provider registration/status interfaces and audit-safe provenance
  metadata without coupling rendering to one provider.
