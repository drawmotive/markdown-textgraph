import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { Renderer } from '../src/renderer.cjs';

const source = await readFile(new URL('../examples/online-order.textgraph', import.meta.url), 'utf8');
const markdown = await readFile(new URL('../examples/online-order.md', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
for (const text of [markdown, readme]) {
  assert.equal(text.match(/```textgraph\n([\s\S]*?)```/)?.[1], source, 'Copyable source must match the example');
}
// Validate the Playground's versioned query protocol at the link producer.
const playgroundLinks = [...readme.matchAll(/https:\/\/textgraph\.dev\/playground[^)\s]*/g)];
assert.ok(playgroundLinks.length > 0, 'README must link to the playable example');
for (const [link] of playgroundLinks) {
  const encoded = new URL(link).searchParams.get('d');
  assert.match(encoded ?? '', /^[01]\./, 'Examples must use versioned source links');
  const bytes = Buffer.from(encoded.slice(2), 'base64url');
  assert.equal((encoded[0] === '1' ? inflateSync(bytes) : bytes).toString('utf8'), source, 'Playground links must open the same example');
}

// Use the extension's worker and deadline so the advertised example is subject
// to the same rendering boundary as a real Markdown preview.
const renderer = new Renderer();
try {
  const result = await renderer.render(source);
  assert.ok(result.success, JSON.stringify(result.diagnostics));
  const bytes = Buffer.from(result.png, 'base64');
  const png = PNG.sync.read(bytes);
  await writeFile(new URL('../media/online-order.png', import.meta.url), bytes);
  // Capture application context separately in the actual VS Code host.
  console.log(`Rendered online-order Markdown example through the extension worker (${png.width} × ${png.height}).`);
} finally {
  await renderer.dispose();
}
