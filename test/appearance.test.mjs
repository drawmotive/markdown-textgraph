import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemedRenderer, appearanceStyles } from '../src/vitepress-appearance.js';
import { renderPngFigure } from '../src/html.js';
import { createPngAssets } from '../src/vitepress-assets.js';

test('VitePress renders and publishes independent light and dark bytes', async () => {
  const calls = [];
  let disposed = false;
  const renderer = createThemedRenderer({
    async renderPng(source, options) {
      calls.push({ source, ...options });
      return { success: true, png: Buffer.from(options.dark ? 'dark' : 'light').toString('base64'), width: 20, height: 10, diagnostics: [] };
    },
    async dispose() { disposed = true; },
  });
  const result = await renderer.renderPng('A -> B');
  assert.deepEqual(calls, [{ source: 'A -> B', dark: false }, { source: 'A -> B', dark: true }]);
  const assets = createPngAssets({ base: '/docs/' });
  const light = assets.add(result);
  const dark = assets.add(result.darkResult);
  assert.notEqual(light, dark);
  const html = renderPngFigure(result, { src: light, darkSrc: dark, darkResult: result.darkResult });
  assert.ok(html.includes('src="' + light + '"'));
  assert.ok(html.includes('src="' + dark + '"'));
  assert.match(html, /class="textgraph-light"/);
  assert.match(html, /class="textgraph-dark"/);
  assert.match(appearanceStyles, /.dark/);
  assert.doesNotMatch(appearanceStyles, /invert|filter/);
  await renderer.dispose();
  assert.equal(disposed, true);
});

test('an unsuccessful appearance fails the paired render instead of publishing mismatched output', async () => {
  const failure = { success: false, diagnostics: [{ code: 'DARK_FAILED' }] };
  const renderer = createThemedRenderer({ renderPng: async (_, { dark }) => dark ? failure : { success: true } });
  assert.equal(await renderer.renderPng('A'), failure);
});
