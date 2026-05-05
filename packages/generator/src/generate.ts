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
  preprocessing,
  postProcessing,
  prepareBasePdfResources,
  materializeBasePages,
  getPageContentOffset,
  validateRequiredFields,
} from './helper.js';

const generate = async (props: GenerateProps): Promise<Uint8Array<ArrayBuffer>> => {
  checkGenerateProps(props);
  const { inputs, template: _template, options = {}, plugins: userPlugins = {} } = props;
  const template = cloneDeep(_template);

  const basePdf = template.basePdf;

  if (inputs.length === 0) {
    throw new Error(
      '[@pdfweave/generator] inputs should not be empty, pass at least an empty object in the array',
    );
  }

  validateRequiredFields(template, inputs);

  const { pdfDoc, renderObj, measureObj } = await preprocessing({ template, userPlugins });

  const _cache = new Map<string, unknown>();

  // pdfme#729: parse + embed the basePdf exactly once, then reuse the
  // resulting resources for every input. For a custom-PDF basePdf this
  // eliminates the O(N) re-parse that previously dominated batch runs;
  // for a stationery PDF the single embedded stationery page is shared
  // across the per-input PDFPage instances.
  const baseResources = await prepareBasePdfResources({ basePdf, pdfDoc });

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];

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
    // Create a type-safe array of schema names without using Set spread which requires downlevelIteration
    const schemaNameSet = new Set<string>();
    schemas.forEach((page: Schema[]) => {
      page.forEach((schema: Schema) => {
        if (schema.name) {
          schemaNameSet.add(schema.name);
        }
      });
    });
    const schemaNames = Array.from(schemaNameSet);

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

          staticSchema.position = {
            x: staticSchema.position.x + boundingBoxLeft,
            y: staticSchema.position.y - boundingBoxBottom,
          };

          // Create properly typed render props for static schema
          const staticRenderProps: PDFRenderProps<Schema> = {
            value,
            schema: staticSchema,
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

      for (let l = 0; l < schemaNames.length; l += 1) {
        const name = schemaNames[l];
        const schemaPage = schemas[j] || [];
        const schema = schemaPage.find((s: Schema) => s.name == name);
        if (!schema) {
          continue;
        }

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

  return pdfDoc.save();
};

export default generate;
