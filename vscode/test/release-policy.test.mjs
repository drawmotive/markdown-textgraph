import assert from 'node:assert/strict';
import test from 'node:test';
import { previewArguments } from '../tooling/release-policy.cjs';

test('all numeric patches package as stable including multi-digit patches', () => {
  for (let patch = 0; patch <= 12; patch++) {
    const version = '0.3.' + patch;
    assert.deepEqual(previewArguments({ schemaVersion: 2, version, releaseVersion: version, channel: 'stable' }), []);
  }
});
test('numeric packaging honors explicit stable maturity and refuses suffixes or identity drift', () => {
  const target = { schemaVersion: 2, version: '0.3.2', releaseVersion: '0.3.2', channel: 'stable' };
  assert.deepEqual(previewArguments({ ...target, version: '0.3.1', releaseVersion: '0.3.1', channel: 'stable' }), []);
  for (const change of [{ channel: 'alpha' }, { channel: 'invalid' }, { version: '0.3.1' }, { releaseVersion: '0.3.2-alpha.1' }, { releaseVersion: '0.3.10' }]) assert.throws(() => previewArguments({ ...target, ...change }));
  assert.deepEqual(previewArguments({ schemaVersion: 1, version: '0.2.9', releaseVersion: '0.2.2-alpha.9', channel: 'alpha' }), ['--pre-release']);
});
