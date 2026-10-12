import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Renderer } from '../src/renderer.cjs';

const source = await readFile(new URL('../examples/online-order.textgraph', import.meta.url), 'utf8');
const markdown = await readFile(new URL('../examples/online-order.md', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
for (const text of [markdown, readme]) {
  assert.equal(text.match(/```textgraph\n([\s\S]*?)```/)?.[1], source, 'Copyable source must match the example');
}
for (const [, encoded] of readme.matchAll(/https:\/\/textgraph\.dev\/playground#source=([^)]*)/g)) {
  assert.equal(decodeURIComponent(encoded), source, 'Playground link must open the same example');
}

// Use the extension's worker and deadline so the advertised example is subject
// to the same rendering boundary as a real Markdown preview.
const renderer = new Renderer();
let browser;
try {
  const result = await renderer.render(source);
  assert.ok(result.success, JSON.stringify(result.diagnostics));
  const bytes = Buffer.from(result.png, 'base64');
  const png = PNG.sync.read(bytes);
  await writeFile(new URL('../media/online-order.png', import.meta.url), bytes);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1260 } });
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const code = markdown.trimEnd().split('\n').map(line => {
    const kind = line.includes('{') ? 'group' : line.includes('->') ? 'edge' : 'label';
    return `<span class="${kind}">${escape(line)}</span>`;
  }).join('\n');
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 40px; background: #f3f6fb; color: #17263c; font-family: Arial, sans-serif; }
      header { margin-bottom: 26px; }
      h1 { margin: 0 0 10px; font-size: 38px; letter-spacing: -1px; }
      header p { margin: 0; font-size: 21px; color: #53657d; }
      main { display: grid; grid-template-columns: 1fr 460px; gap: 24px; align-items: start; }
      section { overflow: hidden; border-radius: 16px; background: white; border: 1px solid #dfe5ee; }
      h2 { margin: 0; padding: 20px 24px; font-size: 16px; letter-spacing: 1.5px; }
      .source { background: #142239; border-color: #142239; color: #e6edf7; }
      .source h2 { color: #a4b6cf; border-bottom: 1px solid #2a3a52; }
      pre { margin: 0; padding: 24px; font: 16px/1.75 'DejaVu Sans Mono', monospace; white-space: pre; }
      .group { color: #95c8ff; }
      .edge { color: #7de2c2; }
      .label { color: #dfe7f3; }
      .output h2 { color: #53657d; border-bottom: 1px solid #e8edf4; }
      img { display: block; width: ${png.width}px; max-width: calc(100% - 24px); height: auto; margin: 16px auto; }
      footer { margin-top: 18px; font-size: 16px; color: #53657d; }
    </style>
    <header><h1>Write the flow. See the diagram.</h1><p>What happens when you place an online order?</p></header>
    <main><section class="source"><h2>YOUR MARKDOWN</h2><pre><code>${code}</code></pre></section>
    <section class="output"><h2>YOUR DIAGRAM</h2><img alt="Rendered online order workflow" src="data:image/png;base64,${result.png}"></section></main>
    <footer>Change the text. The preview follows.</footer>
  </html>`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: fileURLToPath(new URL('../media/online-order-demo.png', import.meta.url)), fullPage: true });
  console.log(`Rendered online-order Markdown example through the extension worker (${png.width} × ${png.height}).`);
} finally {
  await renderer.dispose();
  await browser?.close();
}
