import assert from 'node:assert/strict';
import test from 'node:test';
import { createPngAssets } from '../src/vitepress-assets.js';

test('asset URLs depend on final bytes, deduplicate output, and resolve only owned URLs', () => {
  const assets = createPngAssets({ base: '/docs/', assetsDir: 'media/diagrams' });
  const first = { png: Buffer.from('first PNG').toString('base64') };
  const url = assets.add(first);
  assert.equal(assets.add(first), url);
  const changed = assets.add({ png: Buffer.from('second PNG').toString('base64') });
  assert.notEqual(changed, url);
  assert.match(url, /^\/docs\/media\/diagrams\/textgraph-[a-f0-9]{20}\.png$/);
  const emitted = [];
  assets.emit({ emitFile(asset) { emitted.push(asset); } });
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].source.toString(), 'first PNG');
  assert.equal(assets.resolveId('/other.png'), undefined);
  assert.equal(assets.load(assets.resolveId(url)), `export default ${JSON.stringify(url)};`);
});

test('development serves immutable PNG bytes and HEAD without claiming missing images', () => {
  const assets = createPngAssets({ base: '/docs/' });
  const url = assets.add({ png: Buffer.from('PNG bytes').toString('base64') });
  for (const method of ['GET', 'HEAD']) {
    const headers = {};
    let body;
    assets.middleware({ url: url + '?cache=1', method }, {
      setHeader(key, value) { headers[key] = value; }, end(value) { body = value; },
    }, () => assert.fail('registered PNG must be served'));
    assert.equal(headers['Content-Type'], 'image/png');
    assert.equal(headers['Content-Length'], 9);
    assert.match(headers['Cache-Control'], /immutable/);
    assert.equal(body?.toString(), method === 'GET' ? 'PNG bytes' : undefined);
  }
  let fallthrough = 0;
  assets.middleware({ url: '/missing.png', method: 'GET' }, {}, () => fallthrough++);
  assets.clear();
  assets.middleware({ url, method: 'GET' }, {}, () => fallthrough++);
  assert.equal(fallthrough, 2);
});

test('browser-encoded asset directories resolve during development', () => {
  const assets = createPngAssets({ base: '/docs/', assetsDir: 'diagram images/图' });
  const url = assets.add({ png: Buffer.from('PNG').toString('base64') });
  const pathname = new URL(url, 'http://localhost').pathname;
  assert.equal(pathname, url, 'generated URLs must already be safe to embed and fetch');
  let body;
  assets.middleware({ url: pathname, method: 'GET' }, { setHeader() {}, end(value) { body = value; } }, () => {});
  assert.equal(body?.toString(), 'PNG');
});
