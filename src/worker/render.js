import { parentPort, workerData } from "node:worker_threads";
import { initializeTextGraph } from "@drawmotive/textgraph/node";
import { decodeLanguagePacks, serializeError } from "./protocol.js";

let sdk;
let queue = Promise.resolve();

// SDK/native work is serialized here, including initialization and disposal.
// A rejected initialization is retained; the same session never silently retries.
parentPort.on("message", message => {
  queue = queue.then(async () => {
    try {
      let result;
      if (message.kind === "dispose") {
        if (sdk) {
          const instance = await sdk.catch(() => undefined);
          await instance?.dispose();
        }
      } else {
        sdk ??= initializeTextGraph({ languagePacks: decodeLanguagePacks(workerData.languagePacks) });
        result = await (await sdk).renderPng(message.source, { ...workerData.render, encoding: "base64" });
      }
      parentPort.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort.postMessage({ id: message.id, error: serializeError(error) });
    }
  });
});
