import { parentPort } from 'node:worker_threads';
import { initializeTextGraph } from '@drawmotive/textgraph/node';

// The host sends one request at a time. Only this thread owns the native VM.
let sdk;
parentPort.on('message', async ({ source }) => {
  try {
    sdk ??= initializeTextGraph();
    const result = await (await sdk).renderPng(source, { encoding: 'base64', maxWidth: 2048 });
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: { message: error?.message ?? String(error), code: error?.code } });
  }
});
