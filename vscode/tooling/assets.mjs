import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { initializeTextGraph } from '@drawmotive/textgraph/node';

// Original geometric icon; keep the reproducible source with the extension.
const icon = new PNG({ width: 256, height: 256 });
function rect(x, y, width, height, color) {
  for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) {
    const p = (j * 256 + i) * 4;
    icon.data.set([...color, 255], p);
  }
}
rect(0, 0, 256, 256, [16, 28, 48]);
rect(118, 73, 20, 109, [61, 215, 198]);
rect(60, 118, 136, 18, [61, 215, 198]);
rect(60, 118, 18, 64, [61, 215, 198]);
rect(178, 118, 18, 64, [61, 215, 198]);
rect(80, 30, 96, 58, [240, 248, 255]);
rect(30, 167, 80, 58, [61, 215, 198]);
rect(146, 167, 80, 58, [94, 164, 255]);
await writeFile(new URL('../media/icon.png', import.meta.url), PNG.sync.write(icon));
const sdk = await initializeTextGraph();
try {
  const result = await sdk.renderPng('Start -> Review -> Done', { encoding: 'base64', maxWidth: 800 });
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));
  await writeFile(new URL('../media/example.png', import.meta.url), Buffer.from(result.png, 'base64'));
} finally { await sdk.dispose(); }
