import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'index.js');
const TMP = join(__dirname, '..', '.test-tmp-migrate');

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

const flowDependentTemplate = {
  basePdf: { width: 200, height: 297, padding: [10, 10, 10, 10] },
  schemas: [
    [
      {
        name: 'header',
        content: 'header',
        type: 'text',
        position: { x: 10, y: 20 },
        width: 80,
        height: 10,
      },
      {
        name: 'body',
        content: 'body',
        type: 'text',
        position: { x: 10, y: 40 },
        width: 80,
        height: 10,
      },
    ],
  ],
};

describe('pdfweave migrate', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rewrites a flow-dependent template in place and exits 0', () => {
    const file = join(TMP, 'in-place.json');
    writeFileSync(file, JSON.stringify(flowDependentTemplate));
    const r = runCli(['migrate', file]);
    expect(r.exitCode).toBe(0);
    const after = JSON.parse(readFileSync(file, 'utf-8'));
    // Both schemas should have layout fields after migration.
    expect(after.schemas[0][0].layout).toBeDefined();
    expect(after.schemas[0][1].layout).toBeDefined();
    // Second schema chains belowBottomEdge of the first.
    expect(after.schemas[0][1].layout.y.mode).toBe('belowBottomEdge');
    expect(after.schemas[0][1].layout.y.ref.schemaId).toBe('header');
  });

  it('--check flags pending changes with exit 1 and leaves the file untouched', () => {
    const file = join(TMP, 'check-pending.json');
    const original = JSON.stringify(flowDependentTemplate, null, 2);
    writeFileSync(file, original);
    const r = runCli(['migrate', '--check', file]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/CHANGES NEEDED/);
    // File contents unchanged.
    expect(readFileSync(file, 'utf-8')).toBe(original);
  });

  it('--check on an already-migrated template exits 0', () => {
    const file = join(TMP, 'already-migrated.json');
    writeFileSync(file, JSON.stringify(flowDependentTemplate));
    runCli(['migrate', file]);
    const r = runCli(['migrate', '--check', file]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^OK:/);
  });

  it('-o writes to a different file and leaves the input untouched', () => {
    const inFile = join(TMP, 'src.json');
    const outFile = join(TMP, 'dst.json');
    const original = JSON.stringify(flowDependentTemplate, null, 2);
    writeFileSync(inFile, original);
    const r = runCli(['migrate', inFile, '-o', outFile]);
    expect(r.exitCode).toBe(0);
    expect(readFileSync(inFile, 'utf-8')).toBe(original);
    expect(existsSync(outFile)).toBe(true);
    const out = JSON.parse(readFileSync(outFile, 'utf-8'));
    expect(out.schemas[0][1].layout.y.ref.schemaId).toBe('header');
  });

  it('--json emits a structured result object on stdout', () => {
    const file = join(TMP, 'json-out.json');
    writeFileSync(file, JSON.stringify(flowDependentTemplate));
    const r = runCli(['migrate', '--json', file]);
    expect(r.exitCode).toBe(0);
    // printJson uses JSON.stringify(value, null, 2) so the whole stdout
    // is one pretty-printed object.
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('migrate');
    expect(parsed.changed).toBe(true);
  });
});
