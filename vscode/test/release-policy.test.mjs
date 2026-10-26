import assert from 'node:assert/strict';
import test from 'node:test';
import { previewArguments } from '../tooling/release-policy.cjs';

test('all numeric preview patches package as previews without an odd-patch restriction', () => {
  for (let patch = 0; patch <= 9; patch++) {
    const version = '0.3.' + patch;
    assert.deepEqual(previewArguments({ schemaVersion: 2, version, releaseVersion: version, channel: patch ? 'alpha' : 'stable' }), patch ? ['--pre-release'] : []);
  }
});
test('numeric packaging honors explicit stable maturity and refuses suffixes or identity drift', () => {
  const target = { schemaVersion: 2, version: '0.3.2', releaseVersion: '0.3.2', channel: 'alpha' };
  assert.deepEqual(previewArguments({ ...target, version: '0.3.1', releaseVersion: '0.3.1', channel: 'stable' }), []);
  for (const change of [{ channel: 'invalid' }, { version: '0.3.1' }, { releaseVersion: '0.3.2-alpha.1' }, { releaseVersion: '0.3.10' }]) assert.throws(() => previewArguments({ ...target, ...change }));
  assert.deepEqual(previewArguments({ schemaVersion: 1, version: '0.2.9', releaseVersion: '0.2.2-alpha.9', channel: 'alpha' }), ['--pre-release']);
});
