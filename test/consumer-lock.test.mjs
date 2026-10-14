import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { consumerLock } from "./support/consumer-lock.mjs";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
const locked = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url)));
const compatibility = JSON.parse(await readFile(new URL("./fixtures/markdown14/package-lock.json", import.meta.url)));
const pack = { filename: "candidate.tgz", integrity: "sha512-tested-archive" };

test("consumer lock keeps the real registry SDK and excludes optional framework peers from core", () => {
  const core = consumerLock(manifest, locked, pack, ["markdown-it", "typescript"]);
  const sdk = core.lock.packages["node_modules/@drawmotive/textgraph"];
  assert.equal(sdk.version, manifest.dependencies["@drawmotive/textgraph"]);
  assert.equal(sdk.integrity, locked.packages["node_modules/@drawmotive/textgraph"].integrity);
  assert.ok(!core.lock.packages["node_modules/vitepress"]);
  assert.ok(!core.lock.packages["node_modules/react"]);
  assert.equal(core.lock.packages["node_modules/" + manifest.name].integrity, pack.integrity);
});

test("consumer lock preserves nested framework dependencies and platform archives", () => {
  const result = consumerLock(manifest, locked, pack, ["markdown-it", "vitepress"]);
  assert.equal(result.lock.packages["node_modules/@vue/compiler-core/node_modules/entities"].integrity, locked.packages["node_modules/@vue/compiler-core/node_modules/entities"].integrity);
  for (const platform of ["linux-x64-gnu", "win32-x64-msvc", "darwin-arm64"]) {
    const key = "node_modules/@rolldown/binding-" + platform;
    assert.equal(result.lock.packages[key].integrity, locked.packages[key].integrity);
  }
});

test("Markdown 14 compatibility retains its reviewed types and dependency closure", () => {
  const result = consumerLock(manifest, locked, pack, ["markdown-it", "@types/markdown-it", "typescript"], compatibility);
  assert.equal(result.manifest.dependencies["markdown-it"], "14.3.2");
  assert.equal(result.manifest.dependencies["@types/markdown-it"], "14.1.2");
  for (const [key, entry] of Object.entries(compatibility.packages).filter(([key]) => key)) {
    assert.equal(result.lock.packages[key].integrity, entry.integrity);
  }
});

test("consumer lock rejects local SDKs and incomplete or mismatched release graphs", () => {
  const source = structuredClone(locked);
  source.packages["node_modules/@drawmotive/textgraph"].resolved = "file:../../private-sdk";
  assert.throws(() => consumerLock(manifest, source, pack, ["markdown-it"]), /locked public archive/);
  source.packages = structuredClone(locked.packages);
  delete source.packages["node_modules/argparse"];
  assert.throws(() => consumerLock(manifest, source, pack, ["markdown-it"]), /missing dependency/);
  source.packages = structuredClone(locked.packages);
  source.packages["node_modules/@drawmotive/textgraph"].version = "0.0.0";
  assert.throws(() => consumerLock(manifest, source, pack, ["markdown-it"]), /differs from the reviewed lock/);
});
