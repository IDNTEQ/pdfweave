import { defineCommand } from 'citty';
import { checkGenerateProps } from '@pdfweave/common';
import { assertNoUnknownFlags, printJson, runWithContract } from '../contract.js';
import {
  collectInputHints,
  getInputContractIssues,
  inspectTemplate,
  KNOWN_TEMPLATE_KEYS,
  loadValidationSource,
  validateTemplate,
} from '../diagnostics.js';
import { resolveBasePdf } from '../utils.js';

const validateArgs = {
  file: {
    type: 'positional' as const,
    description: 'Template JSON file, unified job file, or "-" for stdin',
    required: false,
  },
  verbose: { type: 'boolean' as const, alias: 'v', description: 'Verbose output', default: false },
  json: { type: 'boolean' as const, description: 'Machine-readable JSON output', default: false },
  strict: { type: 'boolean' as const, description: 'Treat warnings as errors', default: false },
};

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate a PDFweave template JSON file',
  },
  args: validateArgs,
  async run({ args, rawArgs }) {
    return runWithContract({ json: Boolean(args.json) }, async () => {
      assertNoUnknownFlags(rawArgs, validateArgs);

      const source = await loadValidationSource(args.file, {
        noInputMessage: 'No validation input provided. Pass a file path or pipe JSON via stdin.',
      });
      const templateUnknownKeys = Object.keys(source.template)
        .filter((key) => !KNOWN_TEMPLATE_KEYS.has(key))
        .sort();
      const inspection = inspectTemplate(source.template, source.templateDir);

      const resolvedTemplate = resolveBasePdf(
        source.template,
        undefined,
        source.templateDir,
      ) as Record<string, unknown>;

      const result = validateTemplate(resolvedTemplate);
      result.warnings.push(...source.jobWarnings);

      if (templateUnknownKeys.length > 0) {
        result.warnings.push(
          `Unknown template top-level field(s): ${templateUnknownKeys.join(', ')}`,
        );
      }

      if (source.mode === 'job') {
        try {
          checkGenerateProps({
            template: resolvedTemplate as any,
            inputs: source.inputs as any,
            options: source.options as any,
          });
        } catch (error) {
          result.errors.unshift(error instanceof Error ? error.message : String(error));
        }

        result.errors.push(...getInputContractIssues(resolvedTemplate, source.inputs ?? []));
      }

      const valid = result.errors.length === 0 && (!args.strict || result.warnings.length === 0);
      const inputCount = source.mode === 'job' ? (source.inputs?.length ?? 0) : undefined;

      if (args.verbose) {
        console.error(`Input: ${describeValidationInput(args.file)}`);
        console.error(`Mode: ${source.mode}`);
        console.error(`Template pages: ${result.pages}`);
        console.error(`Fields: ${result.fields}`);
        if (inputCount !== undefined) {
          console.error(`Inputs: ${inputCount} set(s)`);
        }
        console.error(`Valid: ${valid ? 'yes' : 'no'}`);
        console.error(`Strict: ${args.strict ? 'enabled' : 'disabled'}`);
        console.error(`Errors: ${result.errors.length}`);
        console.error(`Warnings: ${result.warnings.length}`);
      }

      if (args.json) {
        printJson({
          ok: true,
          command: 'validate',
          valid,
          mode: source.mode,
          templatePageCount: result.pages,
          fieldCount: result.fields,
          ...(inputCount !== undefined ? { inputCount } : {}),
          errors: result.errors,
          warnings: result.warnings,
          inspection,
          inputHints: collectInputHints(source.template),
        });
      } else {
        if (result.errors.length === 0 && result.warnings.length === 0) {
          console.log(
            `\u2713 Template is valid (${result.pages} page(s), ${result.fields} field(s))`,
          );
        }
        for (const err of result.errors) {
          console.log(`\u2717 Error: ${err}`);
        }
        for (const warn of result.warnings) {
          console.log(`\u26a0 Warning: ${warn}`);
        }
      }

      if (!valid) {
        process.exit(1);
      }
    });
  },
});

function describeValidationInput(file: string | undefined): string {
  if (!file || file === '-') {
    return 'stdin';
  }

  return file;
}
