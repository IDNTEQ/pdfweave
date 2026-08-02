import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getNpmDistTag } from './npm-dist-tag.mjs';

describe('npm release dist-tag selection', () => {
  test('uses latest for stable versions, including build metadata with hyphens', () => {
    assert.equal(getNpmDistTag('0.4.0'), 'latest');
    assert.equal(getNpmDistTag('1.0.0+build-with-hyphens'), 'latest');
  });

  test('uses next for prerelease versions', () => {
    assert.equal(getNpmDistTag('0.4.0-rc.0'), 'next');
    assert.equal(getNpmDistTag('2.1.3-beta.2+build.7'), 'next');
  });

  test('rejects malformed release versions', () => {
    assert.throws(() => getNpmDistTag('0.4'), /Invalid release version/);
    assert.throws(() => getNpmDistTag('v0.4.0'), /Invalid release version/);
  });
});
