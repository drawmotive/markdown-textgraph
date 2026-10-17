import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { captureSourceHash, capturePreviewReady } from './host/capture.cjs';

const source = 'Start -> Finish\n';
const markdown = '## Example\n\n```textgraph\n' + source + '```\n';
const sourceHash = createHash('sha256').update(source).digest('hex');

test('capture evidence belongs to the source actually opened in Markdown Preview', () => {
  assert.equal(captureSourceHash(markdown, source), sourceHash);
  assert.throws(() => captureSourceHash(markdown.replace('Finish', 'Old'), source), /canonical source/);
  assert.throws(() => captureSourceHash('# No diagram', source), /one TextGraph fence/);
  assert.throws(() => captureSourceHash(markdown + markdown, source), /one TextGraph fence/);
});

test('capture waits for the canonical source result and its decoded image', () => {
  const image = { complete: true, naturalWidth: 395 };
  const figure = { dataset: { state: 'ready', source: sourceHash }, querySelector: () => image };
  const document = { querySelectorAll: () => [figure] };
  const ready = () => vm.runInNewContext('(' + capturePreviewReady.toString() + ')({ sourceHash })', { document, sourceHash });
  assert.equal(ready(), true);
  figure.dataset.source = 'old-source';
  assert.equal(ready(), false);
  figure.dataset.source = sourceHash;
  figure.dataset.state = 'loading';
  assert.equal(ready(), false);
  figure.dataset.state = 'ready';
  image.complete = false;
  assert.equal(ready(), false);
  image.complete = true;
  image.naturalWidth = 0;
  assert.equal(ready(), false);
  image.naturalWidth = 395;
  document.querySelectorAll = () => [figure, figure];
  assert.equal(ready(), false);
});
