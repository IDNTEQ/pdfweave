import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

const CANVAS_PACKAGE = '@napi-rs/canvas';
const CANVAS_KEY = `node_modules/${CANVAS_PACKAGE}`;
const EXPECTED_BINDINGS = [
  '@napi-rs/canvas-android-arm64',
  '@napi-rs/canvas-darwin-arm64',
  '@napi-rs/canvas-darwin-x64',
  '@napi-rs/canvas-linux-arm-gnueabihf',
  '@napi-rs/canvas-linux-arm64-gnu',
  '@napi-rs/canvas-linux-arm64-musl',
  '@napi-rs/canvas-linux-riscv64-gnu',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
  '@napi-rs/canvas-win32-arm64-msvc',
  '@napi-rs/canvas-win32-x64-msvc',
];

const hasRegistryMetadata = (record) =>
  typeof record.resolved === 'string' &&
  record.resolved.length > 0 &&
  typeof record.integrity === 'string' &&
  /^sha(?:1|512)-/.test(record.integrity);

describe('cross-platform canvas lockfile metadata', () => {
  test('retains every optional native binding with reproducible registry metadata', async () => {
    const lock = JSON.parse(
      await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
    );
    const canvas = lock.packages[CANVAS_KEY];

    assert.ok(canvas, `${CANVAS_KEY} must exist`);
    assert.ok(hasRegistryMetadata(canvas), `${CANVAS_KEY} must include resolved and integrity`);

    const optionalBindings = Object.keys(canvas.optionalDependencies ?? {}).sort();
    assert.deepEqual(optionalBindings, EXPECTED_BINDINGS);

    const lockedBindings = Object.keys(lock.packages)
      .filter((key) => key.startsWith(`${CANVAS_KEY}-`))
      .map((key) => key.slice('node_modules/'.length))
      .sort();
    assert.deepEqual(lockedBindings, EXPECTED_BINDINGS);

    for (const binding of EXPECTED_BINDINGS) {
      const record = lock.packages[`node_modules/${binding}`];
      assert.equal(record.version, canvas.optionalDependencies[binding], `${binding} version`);
      assert.equal(record.optional, true, `${binding} must remain optional`);
      assert.ok(hasRegistryMetadata(record), `${binding} must include resolved and integrity`);
    }
  });
});
