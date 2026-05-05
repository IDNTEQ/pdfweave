import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@pdfweave/pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'index.js');
const TMP = join(__dirname, '..', '.test-tmp-pdf2img');

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 30000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('pdf2img command', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('returns structured JSON for missing files', () => {
    const result = runCli(['pdf2img', join(TMP, 'missing.pdf'), '--json']);
    expect(result.exitCode).toBe(3);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('EIO');
    expect(parsed.error.message).toContain('PDF file not found');
  });

  it('rejects invalid page ranges', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    writeFileSync(join(TMP, 'sample.pdf'), await pdfDoc.save());

    const result = runCli(['pdf2img', join(TMP, 'sample.pdf'), '--pages', 'nope', '--json']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('EARG');
    expect(parsed.error.message).toContain('Invalid page range segment');
  });

  it('supports verbose output without polluting JSON stdout', async () => {
    const pdfPath = join(TMP, 'verbose-sample.pdf');
    const outputDir = join(TMP, 'verbose-images');
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    writeFileSync(pdfPath, await pdfDoc.save());

    const result = spawnSync('node', [CLI, 'pdf2img', pdfPath, '-o', outputDir, '--verbose', '--json'], {
      encoding: 'utf8',
      timeout: 30000,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('pdf2img');
    expect(parsed.pageCount).toBe(1);
    expect(parsed.selectedPageCount).toBe(1);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.outputPaths).toHaveLength(1);
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(parsed.pages[0].outputPath).toContain('verbose-sample-1.png');
    expect(result.stderr).toContain(`Input: ${pdfPath}`);
    expect(result.stderr).toContain('Output:');
    expect(result.stderr).toContain('Selected pages: 1');
  });
});
