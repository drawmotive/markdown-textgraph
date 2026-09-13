import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { PNG } from "pngjs";
import { createWorkerRenderer } from "../src/worker/client.js";

test("public SDK generates decoded nonempty PNGs in a reusable Worker", async () => {
  const renderer = createWorkerRenderer({ render: { maxWidth: 320 } });
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
