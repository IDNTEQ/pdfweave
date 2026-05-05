import { defineCommand } from 'citty';
import { pdf2size } from '@pdfweave/converter';
import { assertNoUnknownFlags, fail, printJson, runWithContract } from '../contract.js';
import { detectPaperSize, readPdfFile } from '../utils.js';

const pdf2sizeArgs = {
  file: { type: 'positional' as const, description: 'Input PDF file', required: false },
  verbose: { type: 'boolean' as const, alias: 'v', description: 'Verbose output', default: false },
  json: { type: 'boolean' as const, description: 'Machine-readable JSON output', default: false },
};

export default defineCommand({
  meta: {
    name: 'pdf2size',
    description: 'Get page dimensions of a PDF file',
  },
  args: pdf2sizeArgs,
  async run({ args, rawArgs }) {
    return runWithContract({ json: Boolean(args.json) }, async () => {
      assertNoUnknownFlags(rawArgs, pdf2sizeArgs);

      if (!args.file) {
        fail('No input PDF provided.', { code: 'EARG', exitCode: 1 });
      }

      const pdfData = readPdfFile(args.file);
      const sizes = await pdf2size(pdfData);

      if (args.verbose) {
        console.error(`Input: ${args.file}`);
        console.error(`Pages: ${sizes.length}`);
      }

      const result = sizes.map((size, index) => ({
        pageNumber: index + 1,
        width: Math.round(size.width * 100) / 100,
        height: Math.round(size.height * 100) / 100,
      }));

      if (args.json) {
        printJson({ ok: true, command: 'pdf2size', pageCount: result.length, pages: result });
      } else {
        for (let i = 0; i < sizes.length; i++) {
          const size = sizes[i];
          const paperSize = detectPaperSize(size.width, size.height);
          const sizeLabel = paperSize ? ` (${paperSize})` : '';
          console.log(
            `Page ${i + 1}: ${size.width.toFixed(0)} \u00d7 ${size.height.toFixed(0)} mm${sizeLabel}`,
          );
        }
      }
    });
  },
});
