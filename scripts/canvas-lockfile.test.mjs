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

const hasRegistryMetadata = (record) => {
  if (typeof record.resolved !== 'string' || record.resolved.length === 0) return false;
  if (typeof record.integrity !== 'string') return false;

  const match = /^(sha1|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(record.integrity);
  if (!match) return false;
  const digest = Buffer.from(match[2], 'base64');
  const expectedBytes = match[1] === 'sha1' ? 20 : 64;
  return digest.length === expectedBytes && digest.toString('base64') === match[2];
};

describe('cross-platform canvas lockfile metadata', () => {
  test('rejects incomplete, malformed, and incorrectly sized integrity digests', () => {
    const record = (integrity) => ({
      resolved: 'https://registry.npmjs.org/package.tgz',
      integrity,
    });
    assert.equal(hasRegistryMetadata(record('sha512-')), false);
    assert.equal(hasRegistryMetadata(record('sha512-not-base64!!!')), false);
    assert.equal(hasRegistryMetadata(record('sha512-YQ==')), false);
    assert.equal(hasRegistryMetadata(record(`sha1-${Buffer.alloc(20).toString('base64')}`)), true);
    assert.equal(
      hasRegistryMetadata(record(`sha512-${Buffer.alloc(64).toString('base64')}`)),
      true,
    );
  });

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
