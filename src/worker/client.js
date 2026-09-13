import { Worker } from "node:worker_threads";
import { encodeLanguagePacks, restoreError } from "./protocol.js";

/** One lazy Worker owns one SDK VM; configuration is fixed for the session. */
export function createWorkerRenderer(options = {}) {
  const workerData = { render: { ...options.render }, languagePacks: encodeLanguagePacks(options.languagePacks) };
  return createWorkerClient(() => new Worker(new URL("./render.js", import.meta.url), {
    workerData,
    // This self-contained file Worker needs no host loaders or process-only flags.
    // Explicitly forwarding process.execArgv also forwards flags Node rejects in Workers.
    execArgv: [],
  }));
}

/** Transport boundary keeps accepted RPCs alive, and makes a failed VM terminal. */
export function createWorkerClient(startWorker) {
  let worker, failure, closing, stopped = false, nextId = 0, termination;
  const pending = new Map();
  const terminate = () => termination ??= worker ? Promise.resolve(worker.terminate()) : Promise.resolve();
  function fail(error) {
    failure ??= error;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    worker?.unref();
  }
  function request(kind, source) {
    if (failure) return Promise.reject(failure);
    try {
      if (!worker) {
        worker = startWorker();
        worker.on("message", message => {
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          if (message.error) request.reject(restoreError(message.error));
          else request.resolve(message.result);
          if (!pending.size) worker.unref();
        });
        worker.on("error", error => { fail(error); void terminate().catch(() => {}); });
        worker.on("exit", code => {
          if (!stopped || pending.size) fail(Object.assign(new Error(`TextGraph Worker exited (${code})`), { code: "TG_WORKER_EXITED" }));
        });
        worker.unref();
      }
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        worker.ref();
        try { worker.postMessage({ id, kind, source }); }
        catch (error) { fail(error); void terminate().catch(() => {}); }
      });
    } catch (error) { fail(error); return Promise.reject(error); }
  }
  return {
    renderPng(source) {
      if (stopped) return Promise.reject(Object.assign(new Error("TextGraph session is disposed"), { code: "TG_SESSION_DISPOSED" }));
      return request("render", source);
    },
    dispose() {
      if (closing) return closing;
      stopped = true;
      // The Worker serializes requests, so disposal follows every accepted render.
      closing = (async () => {
        try { if (worker && !failure) await request("dispose"); }
        finally { await terminate(); }
      })();
      return closing;
    },
  };
}
