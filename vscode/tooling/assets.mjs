import { writeFile } from 'node:fs/promises';
import { initializeTextGraph } from '@drawmotive/textgraph/node';

const sdk = await initializeTextGraph();
try {
  const result = await sdk.renderPng('Start -> Review -> Done', { encoding: 'base64', maxWidth: 800 });
  if (!result.success) throw new Error(JSON.stringify(result.diagnostics));
  await writeFile(new URL('../media/example.png', import.meta.url), Buffer.from(result.png, 'base64'));
} finally { await sdk.dispose(); }
