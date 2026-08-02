# RFC 0003 - Validated boleto de cobranca schema

- **Status:** Accepted; Phase 1 implemented and qualified
- **Author:** PDFweave maintainers
- **Date:** 2026-08-01
- **Operator guide:** [Boleto de cobranca](../printing/boleto.md)
- **Roadmap:** [Production print platform roadmap](../roadmaps/production-print-platform.md)

## Summary

Add a first-class `boleto` schema for the generic Brazilian boleto de
cobranca `ficha de compensacao`. The schema renders the generic FEBRABAN field
topology and labels from strictly validated structured data. Registered output
also renders the 47-digit `linha digitavel` and 44-digit Interleaved 2 of 5
barcode. Test output deliberately redacts both payable identifiers by default,
or renders them under an explicit qualification policy while retaining its
non-payable watermark. An optional complete Pix BR Code payload can be
validated and rendered in the instructions area when the issuer profile
permits that placement.

The barcode is the canonical payment identifier, but it is not a complete
boleto record. PDFweave derives the `linha digitavel` from it and cross-checks
duplicated values. The caller must still provide the parties, tax IDs,
addresses, instructions, bank display data, dates, and document identifiers.
Those presentation fields cannot be recovered reliably from the barcode.

Phase 1 is deliberately fail-closed. It covers only the generic boleto de
cobranca layout. It does not claim bank registration, payability, bank
homologation, or FEBRABAN certification.

## Decision

The public contract has five parts:

1. A typed `BoletoData` object supplies payment identity and presentation
   data. A JSON string containing the same object is also accepted by the
   renderer.
2. A valid bank-issued 44-digit barcode is the source of truth. The component
   derives the 47-digit line and rejects a supplied line that disagrees.
3. The component enforces the generic physical layout and barcode geometry.
   Rotation and transparency are rejected because they can impair processing.
4. `registrationStatus` is explicit. `registered` always renders its payment
   identifiers. `test` defaults to digit-free redaction labels but may set
   `testPaymentIdentifiers: 'render'` for inspectable evidence; every test
   carries a visible `AMOSTRA - NÃO PAGÁVEL` watermark. `registered` means that
   the caller asserts the data came from its bank/provider registration
   workflow; it is not independently verified by PDFweave.
5. The plugin is output-only. Designer/Form do not expose editors for legal or
   payment subfields; the caller supplies a complete bound object from its own
   validated workflow.
6. Optional Pix support accepts only a complete bank/PSP-issued BR Code payload,
   validates its supported EMV fields and checksum, and renders the exact value
   at an explicit issuer-dependent placement. It does not generate or register
   a Pix charge.

## Why the barcode is not sufficient input

The 44 digits contain only:

| Position | Length | Meaning                                        |
| -------- | -----: | ---------------------------------------------- |
| 1-3      |      3 | Institution/SILOC code                         |
| 4        |      1 | Currency code, `9` for BRL in this contract    |
| 5        |      1 | General modulo-11 check digit                  |
| 6-9      |      4 | Due-date factor                                |
| 10-19    |     10 | Amount in cents, or zero for a variable amount |
| 20-44    |     25 | Institution-specific `campo livre`             |

It does not contain the payer or beneficiary names, CPF/CNPJ values,
addresses, payment instructions, issue date, document description, or a
portable interpretation of `nosso numero`, agency, account, and portfolio.
The last 25 digits are intentionally institution-specific.

The due-date factor is also not an unambiguous date by itself. The factor
reset from `9999` to `1000` on 2025-02-22, reusing values from the earlier
cycle. A barcode-only inspection API can report encoded facts, but it cannot
construct a complete, compliant, payable boleto.

## Scope

Phase 1 includes:

- boleto de cobranca only (`kind: 'cobranca'`);
- the generic `ficha-compensacao` variant;
- fixed and variable amount modes;
- direct and third-party beneficiary presentation;
- validation and conversion of 44-digit barcodes and 47-digit lines;
- the February 2025 due-factor reset and issuer-supplied factor `0000`;
- optional static PNG/JPEG institution logos embedded as data URIs;
- an optional complete Pix Copia e Cola / BR Code payload in the explicit
  `instructions-right` placement;
- fixed independent instruction lanes whose wrapping or shrink-to-fit does not
  move later logical instruction lines;
- PDF and browser rendering from the same layout model;
- an explicit non-payable test mode.

Phase 1 excludes:

- 48-digit arrecadacao/convenio codes, which use a different layout and check
  digit system;
- Pix payload construction from a key or URL, charge registration, dynamic-URL
  liveness checks, coordinated boleto/Pix lifecycle, and issuer-independent QR
  placement;
- boleto-proposta and its consent and disclosure requirements;
- institution code `988`/ISPB-based arrangements;
- inference of any bank-specific `campo livre`;
- bank-specific carteira, `nosso numero`, convenio, agency, or account rules;
- the payer receipt and complete A4 stationery composition;
- bank registration APIs, status lookup, settlement, protest, and cancellation;
- bank homologation or certification of generated output.

Those capabilities require separate discriminated data contracts and bank or
provider adapters. They must not be introduced as permissive options on the
generic schema.

## Data contract

The discriminated contract is summarized below. The source types remain the
normative machine-readable definition.

```ts
type BoletoData = FixedAmountBoletoData | VariableAmountBoletoData;

type FixedAmountBoletoData = BoletoBaseData & {
  amountMode: 'fixed';
  documentValueCents: number;
  discountDeductionCents?: number;
  interestPenaltyCents?: number;
  chargedAmountCents?: number;
};

type VariableAmountBoletoData = BoletoBaseData & {
  amountMode: 'variable';
  documentValueCents?: number;
};

type BoletoBaseData = {
  version: 1;
  kind: 'cobranca';
  registrationStatus: 'registered' | 'test';
  testPaymentIdentifiers?: 'redact' | 'render';
  institution: {
    name: string;
    code: string;
    codeDigit: string;
    logo?: string;
  };
  beneficiaryMode: 'direct' | 'third-party';
  beneficiary: BoletoParty;
  finalBeneficiary?: BoletoPartyIdentity;
  payer: BoletoParty;
  paymentLocation: string;
  dueDate: string;
  barcode: string;
  digitableLine?: string;
  agencyBeneficiaryCode?: string;
  documentDate?: string;
  documentNumber?: string;
  documentSpecies?: string;
  acceptance?: 'A' | 'N';
  processingDate?: string;
  ourNumber?: string;
  bankUse?: string;
  portfolio?: string;
  currencyQuantity?: string;
  currencyUnitValueCents?: number;
  instructions?: string[];
  pix?: {
    emvPayload: string;
    placement: 'instructions-right';
  };
};
```

The beneficiary and payer each have a name, a checked CPF or CNPJ, and a
Brazilian address with a checked CEP and state code. `finalBeneficiary` is an
identity-only `{ name, taxId }` object: it is required in third-party mode and
its normalized CPF/CNPJ must differ from the payer's. It must be omitted in
direct mode. Monetary values are integer cents; floating point currency values
are not accepted.

## Barcode ownership

Production callers should receive the canonical barcode from a bank or
registered billing provider. PDFweave may expose `buildBoletoBarcode()` for
testing and adapter implementations, but that helper requires the caller to
supply the complete 25-digit bank-specific `freeField`. PDFweave does not
invent, normalize, or interpret that value.

A bank adapter may build the field only from that institution's current,
versioned manual and agreement data. The resulting barcode is still subject
to registration and homologation with that institution.

## Pix payload ownership

`pix.emvPayload` is the complete Pix Copia e Cola / BR Code returned by the
issuing bank or PSP. PDFweave re-encodes that exact string as a QR Code after
structural validation. It does not validate DICT key ownership or syntax, the
dynamic URL contract or liveness, or provider authorization. A raw URL, Pix
key, or partial merchant-account value is not valid input: PDFweave does not
invent the remaining EMV fields or register a charge. A static amount tag `54`,
when present, must equal the boleto's `documentValueCents` exactly. A dynamic
payload's root amount is ignored because the Pix manual makes the URL response
authoritative.

The only current placement literal, `instructions-right`, is deliberately
explicit because issuer manuals disagree. Its presence in the generic schema
means that PDFweave can render that profile, not that every institution permits
it. The integrating application must select it only after issuer documentation
and homologation establish that placement.

## Validation contract

Data validation is strict and rejects unknown properties. Before rendering it
checks:

- `version`, `kind`, amount mode, registration status, and beneficiary mode;
- real `YYYY-MM-DD` calendar dates using UTC calculations;
- numeric CPF plus numeric or uppercase alphanumeric CNPJ format and check
  digits, CEP format, and Brazilian state codes;
- the 44-digit barcode length and general modulo-11 check digit;
- institution prefix and BRL currency digit;
- factors `1000`-`9999` against the explicit `dueDate`, or the factor `0000`
  no-encoded-date boundary;
- the encoded amount against `documentValueCents`, or ten zeroes for variable
  amount mode;
- all three modulo-10 field digits and the general digit when a 47-digit line
  is supplied;
- exact equivalence between a supplied line and the canonical barcode;
- the final beneficiary requirement for third-party beneficiary mode and its
  normalized CPF/CNPJ inequality with the payer;
- positive fixed amounts and bounded, non-negative integer-cent adjustments;
- exact fixed-amount reconciliation using `charged = document - discount +
interest`, with a charged amount required whenever an adjustment is present;
- rejection of adjustment properties for variable-amount records;
- test identifier policy, including rejection on registered records and an
  explicit `render` requirement when a test record carries a Pix payload;
- a complete UTF-8 Pix EMV TLV payload of at most 499 Unicode characters as a
  defensive parser ceiling, unique
  root/nested tags, final CRC16 tag `63`, PFI `01`, one Pix merchant account,
  MCC, BRL currency `986`, country `BR`, merchant name/city, additional-data
  reference label, and merchant-account GUI `br.gov.bcb.pix`;
- a mutually exclusive static Pix key or dynamic URL and, when supplied, a
  compatible point-of-initiation method;
- character-counted TLV lengths with the CRC calculated over the exact UTF-8
  payload bytes;
- exact equality between static Pix transaction amount tag `54`, when present,
  and `documentValueCents`; dynamic root amounts are ignored;
- the known institution display suffixes `001-9`, `104-0`, `341-7`, and
  `748-X`, while leaving other syntactically valid COMPE suffixes to the
  provider;
- static PNG/JPEG data-URI syntax for an optional institution logo.

The schema geometry validator additionally requires:

- variant `ficha-compensacao`;
- width from 170 mm through 216 mm;
- height from 95 mm through 108 mm;
- zero effective rotation;
- opacity exactly 1;
- finite, non-negative author-facing placement coordinates.

Before drawing, render preflight also proves that every text primitive fits at
the configured minimum font size, the ficha lies wholly inside the visible PDF
page, and any embedded logo fully decodes. Animated PNGs are rejected from
their `acTL` chunk before UPNG or `PngEmbedder` decoding. Logos are limited to
2,048 pixels per edge, 4 megapixels, and an 8,000,000-character data URI; JPEG
decoding has a 64 MiB tracked-allocation cap. Repeated logos use a bounded
recent-source fingerprint fast path and compact collision-safe keys; each
distinct logo is embedded once per output PDF.

PDF preflight rejection is draw-free. A later embedding, barcode, or drawing
failure is not transactional and may have already mutated the `PDFDocument`,
so callers must discard the whole document after any render rejection. The
browser renderer stages its primitives and atomically replaces the component
with either complete output or one stable error marker.

The current full-image decoders are synchronous. The per-logo limits bound a
single decode, but a cumulative unique-logo budget and worker-based browser
preflight remain follow-up work for hostile or unusually large batches.

Custom base PDFs are positioned relative to their visible CropBox. Generator
translation may produce negative internal schema coordinates for nonzero page
box origins; those values are not accepted in authored schemas and are checked
against the MediaBox/CropBox intersection before drawing. The PDF renderer
paints an opaque white ficha backing so underlying stationery cannot interfere
with the barcode or field grid.

Validation proves internal consistency and supported geometry. It does not
query a bank, prove that `campo livre` follows that bank's agreement, or prove
that a registered title exists.

## Due-date factor rollover

The implementation uses calendar dates rather than local timestamps. Its
supported, unambiguous factor ranges are:

| Date       | Factor |
| ---------- | -----: |
| 2000-07-03 |   1000 |
| 2025-02-21 |   9999 |
| 2025-02-22 |   1000 |
| 2025-02-23 |   1001 |
| 2025-02-24 |   1002 |
| 2049-10-13 |   9999 |

Dates outside those ranges fail validation. The explicit `dueDate` selects
the intended cycle; PDFweave never guesses a date from the four digits alone.

A checksum-valid issuer barcode may instead carry factor `0000`, meaning no
due date is encoded. The real ISO `dueDate` remains mandatory for printing but
cannot be compared with the factor in that case. `calculateDueDateFactor()`
and `buildBoletoBarcode()` generate only the `1000`-`9999` cycles; they do not
generate factor `0000`.

## Physical layout contract

The generic ficha is 170-216 mm wide and 95-108 mm high. Phase 1 uses these
fixed barcode measurements:

- numeric Interleaved 2 of 5;
- 44 encoded digits;
- 103 mm wide by 13 mm high;
- left edge at 5 mm from the ficha left edge;
- vertical center 12 mm above the ficha bottom edge.

The header separates the institution identity, institution code plus digit,
and formatted line. The institution code, line, and mechanical-authentication
caption are ordinary PDF/browser text primitives rendered through the shared
text plugin and font resources. No bitmap image or custom single-stroke
alphabet is used.

The generic source constrains these fields' presence, placement, legibility,
and physical character envelope. Annex V sections 2.2.1(a), 2.2.1(g), and
2.3.5 state 5 mm characters with 1.2 mm strokes for the institution code and
digit, 3.5-4.5 mm characters with 0.3 mm strokes for the linha digitável, and
at most 2 mm characters with 0.3 mm strokes for the authentication label.
Annex III supplies the referenced boleto model. These are final printed-output
targets; they do not require a bespoke stroke font or conversion of normal text
to outlines. PDFweave uses nominal bold 20 pt text, bounded to 18 pt, for the
institution code, bold 14 pt text for the formatted line, and 6.5 pt text for
the authentication caption. Narrow fichas horizontally scale the formatted-line
text without reducing its vertical font size. Automated 300 DPI qualification currently measures
the institution-code raster ink envelope at about 5.17 mm; complete physical
measurement remains an issuer-homologation responsibility. Its 0.3 mm
field-grid rules and individual
cell sizes are deterministic implementation choices, not claims of separately
mandated FEBRABAN dimensions.

When `pix` is present, a fixed 20.7 x 20.7 mm EC-M QR region is reserved on the
right of the instructions block. The QR includes at least four quiet modules
per side. Render preflight measures the actual encoder matrix and rejects more
than 49 modules per side (QR version 8), retaining at least four printer dots
per module at 300 DPI. The exact BCB-published static and dynamic vectors are
45 and 49 modules respectively and define the public boundary artifacts. The
499-character parser ceiling is separate from this module-based render limit.

Each of at most three `instructions` entries, up to 180 characters each,
receives its own fixed-height lane in the remaining width. Wrapping and
shrink-to-fit occur inside that lane, so overflow in line 1 never changes line
2's vertical position. The maximum is render-tested at the minimum 170 mm
ficha width with and without Pix. The placement is issuer-dependent: Santander
v2.37 (February 2026) permits this arrangement for Boleto SX, while CAIXA
SIGCB section 3.5 forbids its hybrid QR in the ficha and requires it in the
payer receipt.

These dimensions are physical print requirements. Production imposition must
use scale 1, no rotation, and no clipping for boleto placements. A PDF viewer
preview and a successfully parsed barcode are not substitutes for measuring a
printed sample.

## Registration and homologation boundary

`registrationStatus: 'registered'` is a provenance assertion made by the
caller. Before using it, the application must have obtained the title and
canonical payment identifiers through its contracted institution/provider.
PDFweave cannot validate that external state.

Each production integration must also complete the institution's homologation
process. At minimum this normally covers agreement identifiers, free-field
construction, check digits, display fields, physical print samples, barcode
reading, and payment processing. The generated PDF should be described as
"specification-validated by PDFweave", not "FEBRABAN certified" or "bank
certified".

`registrationStatus: 'test'` is for fixtures, previews, and qualification
artifacts only. It defaults to omitting the barcode and digitable line and
adding explicit redaction labels. `testPaymentIdentifiers: 'render'` may expose
the validated barcode, line, and optional Pix QR for inspectable qualification
evidence. The visible watermark cannot be disabled through a schema option.

Test input still passes the complete identifier and cross-field validation
contract. Redacted values are not copied into the test-mode layout or browser
DOM. Qualification manifests omit payment-identifier and Pix payload values
even when the visible standards-aligned synthetic specimen renders and
decode-validates them. The specimen is neither bank-issued nor homologated.

## Security and failure behavior

Rendering payment documents is a high-integrity operation:

- malformed or inconsistent data throws a stable prefixed error;
- validation does not silently repair a supplied barcode or line;
- decimal money is not rounded into cents;
- unknown keys are rejected so misspelled payment fields cannot disappear;
- a logo accepts only embedded static PNG/JPEG data, not animated PNGs or
  remote network URLs;
- test output is always visibly non-payable; its default mode contains no
  scannable identifiers, while explicit render mode exists only for evidence;
- presentation data never overrides digits encoded in the canonical barcode.

Applications remain responsible for protecting payer personal data in logs,
artifacts, storage, and transport.

## Official references

The generic layout and barcode rules are based on FEBRABAN's
[Convencao da Cobranca, including Annexes III-V (2021-02-05)](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Conven%C3%A7%C3%A3o%20da%20Cobran%C3%A7a%20-%2005_02_2021_f.pdf).
The file used for this RFC has SHA-256
`da66c4e37ed636276549bcee8db0d50f10ecf334affb83bf88dd61d955def1c3`.

The regulatory and integration boundary is informed by:

- [BCB Resolution 443/2024](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=443&tipo=Resolu%C3%A7%C3%A3o+BCB);
- [FEBRABAN's public boleto platform guidance](https://portal.febraban.org.br/pagina/3150/1094/pt-br/servicos-novo-plataforma-boletos);
- [Banco do Brasil boleto technical specification](https://www.bb.com.br/docs/pub/emp/empl/dwn/Doc5175Bloqueto.pdf);
- [CAIXA SIGCB barcode specification](https://www.caixa.gov.br/Downloads/cobranca-caixa/ESP_COD_BARRAS_SIGCB_COBRANCA_CAIXA.pdf);
- [Itau CNAB/SISPAG technical manual](https://download.itau.com.br/bankline/SISPAG_CNAB.pdf);
- [Receita Federal alphanumeric CNPJ check-digit manual](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf);
- [Sicredi CNAB 240 manual](https://www.sicredi.com.br/media/produtos/filer_public/2025/10/10/manual_cnab_240_28_1.pdf), including the `748-X` display suffix;
- [BCB FAQ: paying a boleto using Pix](https://www.bcb.gov.br/meubc/faqs/p/pagamento-de-boleto-utilizando-o-pix);
- [BCB BR Code Manual v2.0.1](https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/ManualBRCode.pdf), for character-counted TLV structure, common mandatory fields, amount grammar, and published static/dynamic vectors;
- [BCB Pix initiation standards manual](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf);
- [DENSO WAVE QR module-size guidance](https://www.qrcode.com/en/howto/cell.html), for the four-printer-dots-per-module stable-operation target;
- [DENSO WAVE QR symbol-area guidance](https://www.qrcode.com/en/howto/code.html), for the four-module quiet zone;
- [Santander CNAB 353/400 v2.37, February 2026](https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob400ptbr/26-02-25_131730_h7800_layout_de_cobran%C3%A7a_353_400_posi%C3%A7%C3%B5es_v._2.37_fev_2026_%28portugu%C3%AAs%29.pdf), pages 4-5, as an issuer profile that permits the instructions-area QR;
- [CAIXA SIGCB specification, section 3.5](https://www.caixa.gov.br/Downloads/cobranca-caixa/ESP_COD_BARRAS_SIGCB_COBRANCA_CAIXA.pdf), as an issuer profile that forbids the QR in the ficha.

Institution manuals are evidence that `campo livre` and agreement rules are
bank-specific. They do not replace the generic FEBRABAN source or a current
contract with the institution.

## Roadmap

1. Maintain the shared PDF/browser renderer and standards-aligned synthetic
   qualification specimens for generic ficha geometry, test safeguards,
   barcode/Pix decoding, and exact-size A4/A3 imposition.
2. Extend the 300 DPI structural verifier to multiple print resolutions,
   independent scanners, and measured hard-copy acceptance.
3. Add versioned bank adapters only with official vectors and institution
   homologation fixtures; never add a generic free-field guesser.
4. Add the payer receipt and a complete A4 composition as a separate layout
   composition over the validated ficha.
5. Add a separate 48-digit arrecadacao component and contract.
6. Add versioned issuer profiles for Pix placement, charge registration, and
   coordinated boleto/Pix lifecycle behavior.
7. Add boleto-proposta only after its distinct regulatory and consent model is
   specified.
8. Add registration/status provider interfaces without coupling the renderer
   to a single bank or network API.

## Rejected alternatives

### Accept only the barcode

Rejected because most mandatory presentation data is absent and the
institution-specific free field is not portable. It would encourage plausible
looking but incomplete documents.

### Generate a free field generically

Rejected because its meaning is defined by each institution and agreement.
There is no safe universal algorithm.

### Infer and overwrite inconsistent fields

Rejected because silent correction can conceal upstream payment-data defects.
The renderer cross-checks and fails instead.

### Treat barcode decoding as certification

Rejected because a checksum-valid barcode can still be unregistered, use an
invalid agreement-specific free field, or fail physical and bank homologation.
