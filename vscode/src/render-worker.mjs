import { parentPort } from 'node:worker_threads';
import { initializeTextGraph } from '@drawmotive/textgraph/node';

// The host sends one request at a time. Only this thread owns the native VM.
let sdk;
parentPort.on('message', async ({ source }) => {
  try {
    sdk ??= initializeTextGraph();
    const result = await (await sdk).renderPng(source, { maxWidth: 2048 });
    if (!result.success) {
      parentPort.postMessage({ result });
      return;
    }
    // The preview embeds a data URL. Encode the SDK's PNG bytes at this boundary.
    const { buffer, byteOffset, byteLength } = result.png;
    const png = Buffer.from(buffer, byteOffset, byteLength).toString('base64');
    parentPort.postMessage({ result: { ...result, png } });
  } catch (error) {
    parentPort.postMessage({ error: { message: error?.message ?? String(error), code: error?.code } });
  }
});
