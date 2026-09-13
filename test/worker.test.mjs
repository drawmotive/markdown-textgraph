import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createWorkerClient } from "../src/worker/client.js";
import { encodeLanguagePacks, decodeLanguagePacks } from "../src/worker/protocol.js";

class WorkerTransport extends EventEmitter {
  sent = [];
  referenced = false;
  terminated = 0;
  postMessage(message) { this.sent.push(message); }
  ref() { this.referenced = true; }
  unref() { this.referenced = false; }
  async terminate() { this.terminated++; this.emit("exit", 1); }
  respond(index, result) { this.emit("message", { id: this.sent[index].id, result }); }
}

test("worker RPC starts lazily, matches responses by id, and drains before termination", async () => {
  const worker = new WorkerTransport();
  let starts = 0;
  const renderer = createWorkerClient(() => { starts++; return worker; });
  assert.equal(starts, 0);
  const first = renderer.renderPng("A -> B");
  const second = renderer.renderPng("B -> C");
  assert.equal(starts, 1);
  assert.equal(worker.referenced, true);
  worker.respond(1, "second");
  assert.equal(await second, "second");
  assert.equal(worker.referenced, true);
  worker.respond(0, "first");
  assert.equal(await first, "first");
  assert.equal(worker.referenced, false);
  const closing = renderer.dispose();
  assert.equal(renderer.dispose(), closing);
  await assert.rejects(renderer.renderPng("C"), { code: "TG_SESSION_DISPOSED" });
  assert.equal(worker.sent[2].kind, "dispose");
  assert.equal(worker.terminated, 0);
  worker.respond(2, undefined);
  await closing;
  assert.equal(worker.terminated, 1);
});

test("unused renderer disposal does not create a Worker", async () => {
  const renderer = createWorkerClient(() => { assert.fail("unexpected Worker"); });
  await renderer.dispose();
  await assert.rejects(renderer.renderPng("A"), { code: "TG_SESSION_DISPOSED" });
});

test("worker exit rejects all accepted work and never silently restarts", async () => {
  const worker = new WorkerTransport();
  let starts = 0;
  const renderer = createWorkerClient(() => { starts++; return worker; });
  const first = renderer.renderPng("A");
  const second = renderer.renderPng("B");
  const checks = [first, second].map(p => assert.rejects(p, { code: "TG_WORKER_EXITED" }));
  worker.emit("exit", 0);
  await Promise.all(checks);
  await assert.rejects(renderer.renderPng("C"), { code: "TG_WORKER_EXITED" });
  assert.equal(starts, 1);
  await renderer.dispose();
});

test("runtime errors retain code and details across Worker messages", async () => {
  const worker = new WorkerTransport();
  const renderer = createWorkerClient(() => worker);
  const request = renderer.renderPng("A");
  worker.emit("message", { id: worker.sent[0].id, error: { name: "DrawMotiveError", message: "font missing", code: "TG_FONT_MISSING", details: { family: "Example" } } });
  await assert.rejects(request, { code: "TG_FONT_MISSING", details: { family: "Example" } });
  worker.emit("error", Object.assign(new Error("transport"), { code: "TRANSPORT" }));
  await renderer.dispose();
});

test("language pack URLs survive transport and bytes belong to the session snapshot", () => {
  const source = new Uint8Array([1, 2, 3]);
  const packs = [{ fonts: [{ family: "A", source: new URL("file:///tmp/font.ttf") }, { family: "B", source }], fallbackFamilies: ["B"] }];
  const encoded = encodeLanguagePacks(packs);
  source[0] = 9;
  packs[0].fallbackFamilies.push("changed");
  const decoded = decodeLanguagePacks(structuredClone(encoded));
  assert.equal(decoded[0].fonts[0].source.href, "file:///tmp/font.ttf");
  assert.deepEqual(decoded[0].fonts[1].source, new Uint8Array([1, 2, 3]));
  assert.deepEqual(decoded[0].fallbackFamilies, ["B"]);
  assert.equal(source.byteLength, 3);
});
