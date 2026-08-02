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
barcode; test output deliberately redacts both payable identifiers.

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
4. `registrationStatus` is explicit. `test` output omits the barcode and line,
   replaces them with digit-free redaction labels, and carries a visible
   `AMOSTRA - NÃO PAGÁVEL` watermark. `registered` means that the caller
   asserts the data came from its bank/provider registration workflow; it is
   not independently verified by PDFweave.
5. The plugin is output-only. Designer/Form do not expose editors for legal or
   payment subfields; the caller supplies a complete bound object from its own
   validated workflow.

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
- PDF and browser rendering from the same layout model;
- an explicit non-payable test mode.

Phase 1 excludes:

- 48-digit arrecadacao/convenio codes, which use a different layout and check
  digit system;
- Pix hybrid boletos and Pix Copy and Paste/EMV payload generation;
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
};

type VariableAmountBoletoData = BoletoBaseData & {
  amountMode: 'variable';
  documentValueCents?: number;
};

type BoletoBaseData = {
  version: 1;
  kind: 'cobranca';
  registrationStatus: 'registered' | 'test';
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
  discountDeductionCents?: number;
  interestPenaltyCents?: number;
  chargedAmountCents?: number;
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
and formatted line. Explicit shared vector paths give the institution code an
exact 5 mm outer ink height with 1.2 mm strokes. FEBRABAN permits a 3.5-4.5 mm
line character height; PDFweave deterministically uses 4 mm with 0.3 mm
strokes. The line's outer ink begins at the absolute 50 mm ficha coordinate,
1 mm inside its cell. PDFweave also uses 0.3 mm field-grid rules as a stable
rendering choice. Individual field sizes and this uniform grid stroke are not
claimed as separately mandated FEBRABAN dimensions. The 1.2 mm requirement
applies to the institution-code glyph strokes, not to a header border.
The mechanical-authentication caption also uses the shared vector face at the
2 mm maximum character height and 0.3 mm strokes.

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
artifacts only. The renderer omits the barcode and digitable line, adds explicit
redaction labels, and applies a visible watermark. None of those safeguards can
be disabled through a schema option.

Test input still passes the complete identifier and cross-field validation
contract. The validated values are not copied into the test-mode layout, PDF,
browser DOM, or qualification manifest.

## Security and failure behavior

Rendering payment documents is a high-integrity operation:

- malformed or inconsistent data throws a stable prefixed error;
- validation does not silently repair a supplied barcode or line;
- decimal money is not rounded into cents;
- unknown keys are rejected so misspelled payment fields cannot disappear;
- a logo accepts only embedded static PNG/JPEG data, not animated PNGs or
  remote network URLs;
- test output contains no scannable barcode or digitable line and is visibly
  non-payable;
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
- [BCB Pix initiation standards manual](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf).

Institution manuals are evidence that `campo livre` and agreement rules are
bank-specific. They do not replace the generic FEBRABAN source or a current
contract with the institution.

## Roadmap

1. Maintain the implemented shared PDF/browser renderer and redacted
   qualification fixtures for generic ficha geometry, test safeguards, and
   exact-size A4/A3 imposition.
2. Extend the private registered-mode 300 DPI structural verifier to multiple
   print resolutions, independent scanners, and measured hard-copy acceptance
   without publishing scannable payment fixtures.
3. Add versioned bank adapters only with official vectors and institution
   homologation fixtures; never add a generic free-field guesser.
4. Add the payer receipt and a complete A4 composition as a separate layout
   composition over the validated ficha.
5. Add a separate 48-digit arrecadacao component and contract.
6. Add a Pix hybrid contract that validates the EMV payload against payment
   fields and follows current BCB rules.
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
