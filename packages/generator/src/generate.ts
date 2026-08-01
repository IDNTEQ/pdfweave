import * as pdfLib from '@pdfweave/pdf-lib';
import type { GenerateProps, Schema, PDFRenderProps, Template } from '@pdfweave/common';
import {
  checkGenerateProps,
  getDynamicTemplate,
  treatsLikeBlank,
  replacePlaceholders,
  resolveSchemaValue,
  pt2mm,
  cloneDeep,
} from '@pdfweave/common';
import {
  insertPage,
  preprocessing as preparePdfDoc,
  postProcessing,
  prepareBasePdfResources,
  materializeBasePages,
  getPageContentOffset,
  validateRequiredFields,
} from './helper.js';

/**
 * Optional caller hook that transforms an input row before it's rendered.
 * Runs once per input, sync or async. The return value replaces the input
 * for that iteration. Default: identity.
 *
 * Original feature request: https://github.com/pdfme/pdfme/issues/391
 */
export type PreprocessingHook = (
  input: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Optional caller hook that transforms the final saved PDF bytes. Runs once
 * after all inputs have rendered, sync or async. The return value replaces
 * the bytes returned from generate(). Useful for encryption, signing,
 * compression, metadata stamping, etc. Default: identity.
 *
 * Original feature request: https://github.com/pdfme/pdfme/issues/391
 */
export type PostprocessingHook = (
  pdfBytes: Uint8Array<ArrayBuffer>,
) => Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>>;

export type GenerateHooks = {
  preprocessing?: PreprocessingHook;
  postprocessing?: PostprocessingHook;
};

const generate = async (props: GenerateProps & GenerateHooks): Promise<Uint8Array<ArrayBuffer>> => {
  // The runtime check is over the zod-validated subset; pull the hooks out
  // first so the .strict() schema doesn't reject them as unknown keys.
  const { preprocessing: preHook, postprocessing: postHook, ...validatableProps } = props;
  checkGenerateProps(validatableProps);
  const { inputs, template: _template, options = {}, plugins: userPlugins = {} } = validatableProps;
  const template = cloneDeep(_template);

  const basePdf = template.basePdf;

  if (inputs.length === 0) {
    throw new Error(
      '[@pdfweave/generator] inputs should not be empty, pass at least an empty object in the array',
    );
  }

  const { pdfDoc, renderObj, measureObj } = await preparePdfDoc({ template, userPlugins });

  const _cache = new Map<string, unknown>();

  // pdfme#729: parse + embed the basePdf exactly once, then reuse the
  // resulting resources for every input. For a custom-PDF basePdf this
  // eliminates the O(N) re-parse that previously dominated batch runs;
  // for a stationery PDF the single embedded stationery page is shared
  // across the per-input PDFPage instances.
  const baseResources = await prepareBasePdfResources({ basePdf, pdfDoc });

  for (let i = 0; i < inputs.length; i += 1) {
    const rawInput = inputs[i];
    const input = preHook ? await preHook(rawInput) : rawInput;

    // Validate required fields against the *processed* input so a preHook
    // that maps or derives required fields is honoured. Running this before
    // preHook (the previous behaviour) rejected valid inputs whose required
    // values were only present after preprocessing.
    validateRequiredFields(template, [input]);

    // Get the dynamic template with proper typing
    const dynamicTemplate: Template = await getDynamicTemplate({
      template,
      input,
      options,
      _cache,
      getDynamicLayout: async (value, args) => {
        const measure = measureObj[args.schema.type];

        if (measure) {
          return measure({ value, ...args });
        }

        return Promise.resolve({
          width: args.schema.width,
          height: args.schema.height,
          dynamicHeights: [args.schema.height],
        });
      },
    });
    const { basePages, embedPdfBoxes } = materializeBasePages({
      template: dynamicTemplate,
      pdfDoc,
      resources: baseResources,
    });

    const schemas = dynamicTemplate.schemas;

    for (let j = 0; j < basePages.length; j += 1) {
      const basePage = basePages[j];
      const embedPdfBox = embedPdfBoxes[j];

      // Use the visible-region origin (CropBox when present, else MediaBox)
      // so schemas authored against the CropBox land in the visible area
      // rather than at the MediaBox origin. For basePdfs without an explicit
      // CropBox this resolves to MediaBox.x/y — identical to the previous
      // behavior — keeping the change a no-op for the common case.
      // See pdfme/pdfme#623.
      const contentOffset =
        basePage instanceof pdfLib.PDFEmbeddedPage
          ? getPageContentOffset(embedPdfBox)
          : { x: 0, y: 0 };
      const boundingBoxLeft = pt2mm(contentOffset.x);
      const boundingBoxBottom = pt2mm(contentOffset.y);

      const page = insertPage({ basePage, embedPdfBox, pdfDoc });

      if (treatsLikeBlank(basePdf) && basePdf.staticSchema) {
        for (let k = 0; k < basePdf.staticSchema.length; k += 1) {
          const staticSchema = basePdf.staticSchema[k];
          const render = renderObj[staticSchema.type];
          if (!render) {
            continue;
          }
          const value = staticSchema.readOnly
            ? replacePlaceholders({
                content: staticSchema.content || '',
                variables: { ...input, totalPages: basePages.length, currentPage: j + 1 },
                schemas: schemas, // Use the properly typed schemas variable
              })
            : staticSchema.content || '';

          // Render against a per-iteration clone so the basePdf staticSchema
          // (shared across every input in the batch) doesn't accumulate page
          // offsets from previous iterations. Without the clone, input #100
          // would see ~99×offset added to every static schema.
          const staticSchemaForRender: Schema = {
            ...staticSchema,
            position: {
              x: staticSchema.position.x + boundingBoxLeft,
              y: staticSchema.position.y - boundingBoxBottom,
            },
          };

          // Create properly typed render props for static schema
          const staticRenderProps: PDFRenderProps<Schema> = {
            value,
            schema: staticSchemaForRender,
            basePdf,
            pdfLib,
            pdfDoc,
            page,
            options,
            _cache,
          };
          await render(staticRenderProps);
        }
      }

      const schemaPage = schemas[j] || [];
      for (const schema of schemaPage) {
        const render = renderObj[schema.type];
        if (!render) {
          continue;
        }
        const value = resolveSchemaValue({
          schema,
          input,
          schemas,
          totalPages: basePages.length,
          currentPage: j + 1,
        });

        schema.position = {
          x: schema.position.x + boundingBoxLeft,
          y: schema.position.y - boundingBoxBottom,
        };

        // Create properly typed render props
        const renderProps: PDFRenderProps<Schema> = {
          value,
          schema,
          basePdf,
          pdfLib,
          pdfDoc,
          page,
          options,
          _cache,
        };
        await render(renderProps);
      }
    }
  }

  postProcessing({ pdfDoc, options });

  const pdfBytes = await pdfDoc.save();
  return postHook ? await postHook(pdfBytes) : pdfBytes;
};

export default generate;
