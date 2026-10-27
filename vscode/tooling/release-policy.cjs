const assert = require('node:assert/strict');
const { releaseChannel } = require('../.release/release-version.cjs');

/** Numeric identities package as stable. Historical suffixed targets alone
 * may request preview metadata while retaining their original identities. */
function previewArguments(target) {
  assert.ok([1, 2].includes(target.schemaVersion), 'Unknown release target schema');
  const legacy = target.schemaVersion === 1;
  assert.equal(releaseChannel(target.releaseVersion, { legacy, channel: target.channel }), target.channel, 'Release channel/version mismatch');
  if (!legacy) assert.equal(target.version, target.releaseVersion, 'Numeric products share one release identity');
  return target.channel === 'alpha' ? ['--pre-release'] : [];
}
module.exports = { previewArguments };
