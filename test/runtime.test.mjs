import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { PNG } from "pngjs";
import { createWorkerRenderer } from "../src/worker/client.js";
import { readFile } from "node:fs/promises";
import { abiManifest, resolveRuntimeAssets } from "@drawmotive/textgraph/node";
import { createTextGraphMarkdown } from "../src/index.js";
import MarkdownIt from "markdown-it";

test("plain documents use the public factory without initializing invalid SDK font options", async () => {
  const session = createTextGraphMarkdown({ languagePacks: [null] });
  const md = new MarkdownIt();
  md.use(session.markdownIt);
  assert.equal(await session.render(md, "plain"), "<p>plain</p>\n");
  await session.dispose();
});

test("public SDK generates decoded nonempty PNGs in a reusable Worker", async () => {
  const renderer = createWorkerRenderer({ render: { maxWidth: 320, ignored() {} } });
  try {
    const results = await Promise.all([renderer.renderPng("A -> B"), renderer.renderPng("A -> C")]);
    for (const result of results) {
      assert.equal(result.success, true, JSON.stringify(result.diagnostics));
      const png = PNG.sync.read(Buffer.from(result.png, "base64"));
      assert.equal(png.width, result.width);
      assert.equal(png.height, result.height);
      assert.ok(png.width > 0 && png.width <= 320);
      assert.ok(new Set(png.data).size > 2);
    }
    assert.notEqual(results[0].png, results[1].png);
  } finally { await renderer.dispose(); }
});

test("public SDK renders inline group targets and recovers after invalid braces", { timeout: 30000 }, async () => {
  const renderer = createWorkerRenderer();
  try {
    for (const source of ["A -> {}", "A -> {{x}}", "A -> { B -> C }"]) {
      const result = await renderer.renderPng(source);
      assert.equal(result.success, true, JSON.stringify(result.diagnostics));
      const png = PNG.sync.read(Buffer.from(result.png, "base64"));
      assert.ok(png.width > 0 && new Set(png.data).size > 2);
    }
    const invalid = await renderer.renderPng("A -> {}}");
    assert.equal(invalid.success, false);
    assert.ok(invalid.diagnostics.some(item => item.code === "TG_PARSE_ERROR"));
    assert.equal((await renderer.renderPng("A -> {}")).success, true);
  } finally { await renderer.dispose(); }
});

test("public SDK returns DSL diagnostics but rejects invalid operational render options", async () => {
  const renderer = createWorkerRenderer();
  try {
    const result = await renderer.renderPng("A ->");
    assert.equal(result.success, false);
    assert.ok(result.diagnostics.length);
  } finally { await renderer.dispose(); }
  const invalid = createWorkerRenderer({ render: { scale: -1 } });
  try { await assert.rejects(invalid.renderPng("A -> B"), error => typeof error.code === "string"); }
  finally { await invalid.dispose(); }
});

test("disposing a real SDK Worker permits natural process exit", async () => {
  const entry = new URL("../src/worker/client.js", import.meta.url).href;
  const script = `import { createWorkerRenderer } from ${JSON.stringify(entry)}; const r=createWorkerRenderer(); await r.renderPng("A -> B"); await r.dispose(); console.log("closed");`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, stderr);
    assert.match(stdout, /closed/);
  } finally { clearTimeout(timer); }
});

test("dispose drains accepted real renders and rejects later submissions", async () => {
  const renderer = createWorkerRenderer();
  const first = renderer.renderPng("A -> B");
  const second = renderer.renderPng("B -> C");
  const closing = renderer.dispose();
  await assert.rejects(renderer.renderPng("C -> D"), { code: "TG_SESSION_DISPOSED" });
  assert.equal((await first).success, true);
  assert.equal((await second).success, true);
  await closing;
});

test("invalid font configuration reaches SDK validation and remains failed", async () => {
  for (const languagePacks of [7, [null], [{ fonts: [null] }]]) {
    const renderer = createWorkerRenderer({ languagePacks });
    try {
      await assert.rejects(renderer.renderPng("A"), { code: "INVALID_ARGUMENT" });
      await assert.rejects(renderer.renderPng("B"), { code: "INVALID_ARGUMENT" });
    } finally { await renderer.dispose(); }
  }
});

test("font data URLs and bytes cross the real Worker boundary without extra fields", async () => {
  const fontAsset = abiManifest.rendering.fonts[0].asset;
  const { url } = resolveRuntimeAssets({ manifest: abiManifest }).find(value => value.asset.path === fontAsset);
  const bytes = new Uint8Array(await readFile(url));
  const source = new URL(`data:font/ttf;base64,${Buffer.from(bytes).toString("base64")}`);
  for (const fontSource of [source, bytes]) {
    const renderer = createWorkerRenderer({ languagePacks: [{ fonts: [{ family: "TestFont", source: fontSource, ignored() {} }], ignored() {} }] });
    try { assert.equal((await renderer.renderPng("A -> B")).success, true); }
    finally { await renderer.dispose(); }
  }
});
