import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Template } from '@pdfweave/common';
import { migrateTemplateToAnchored } from '@pdfweave/common';
import { assertNoUnknownFlags, printJson, runWithContract } from '../contract.js';

interface MigrationResult {
  file: string;
  changed: boolean;
  reason?: string;
}

const migrateArgs = {
  file: {
    type: 'positional' as const,
    description: 'Template JSON file (or "-" for stdin → stdout)',
    required: true,
  },
  out: {
    type: 'string' as const,
    alias: 'o',
    description: 'Output file (default: write back in-place)',
  },
  check: {
    type: 'boolean' as const,
    description: 'Dry run; exit 1 if migration would change the file',
    default: false,
  },
  json: {
    type: 'boolean' as const,
    description: 'Machine-readable JSON output',
    default: false,
  },
};

function templatesEqual(a: Template, b: Template): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function readInput(file: string): Promise<string> {
  if (file === '-') {
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }
  return fs.promises.readFile(file, 'utf-8');
}

function writeOutput(file: string | undefined, content: string): void {
  if (!file || file === '-') {
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  fs.writeFileSync(file, content);
}

export default defineCommand({
  meta: {
    name: 'migrate',
    description: 'Migrate a pre-Phase-4 template to anchored-chain layout (RFC 0001).',
  },
  args: migrateArgs,
  async run({ args, rawArgs }) {
    return runWithContract({ json: Boolean(args.json) }, async () => {
      assertNoUnknownFlags(rawArgs, migrateArgs);

      const file = args.file as string;
      const outRaw = args.out as string | undefined;
      const check = Boolean(args.check);

      const inputText = await readInput(file);
      let template: Template;
      try {
        template = JSON.parse(inputText) as Template;
      } catch (err) {
        throw new Error(
          `[pdfweave migrate] failed to parse JSON from ${file}: ${(err as Error).message}`,
        );
      }

      const migrated = migrateTemplateToAnchored(template);
      const changed = !templatesEqual(template, migrated);
      const result: MigrationResult = {
        file,
        changed,
        reason: changed ? undefined : 'already migrated (no changes needed)',
      };

      if (check) {
        if (args.json) printJson({ ok: !changed, command: 'migrate', ...result });
        else process.stdout.write(`${changed ? 'CHANGES NEEDED' : 'OK'}: ${file}\n`);
        if (changed) process.exitCode = 1;
        return;
      }

      const out = outRaw ?? (file === '-' ? '-' : file);
      const serialised = `${JSON.stringify(migrated, null, 2)}\n`;
      writeOutput(out, serialised);

      if (args.json)
        printJson({
          ok: true,
          command: 'migrate',
          ...result,
          outputPath: out === '-' ? undefined : path.resolve(out),
        });
      else
        process.stdout.write(
          `${changed ? 'migrated' : 'no changes'}: ${file}${
            out !== '-' && out !== file ? ` → ${out}` : ''
          }\n`,
        );
    });
  },
});
