import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import MarkdownIt from "markdown-it";
import { withTextGraph } from "../src/vitepress.js";

test("VitePress adapter preserves user configuration and awaits existing Markdown hooks", async () => {
  const calls = [];
  const config = withTextGraph({
    base: "/docs/",
    vite: { plugins: [{ name: "existing" }] },
    markdown: { async config(md) { await Promise.resolve(); calls.push("markdown"); md.core.ruler.push("metadata", state => { state.env.retained = true; }); } },
    async buildEnd() { calls.push("buildEnd"); },
  });
  const plugin = config.vite.plugins.find(p => p.name === "textgraph-markdown");
  plugin.configResolved({ command: "build" });
  const md = new MarkdownIt();
  let renders = 0;
  md.renderAsync = async (source, env) => { renders++; return md.render(source, env); };
  await config.markdown.config(md);
  const env = {};
  const html = await md.renderAsync("```textgraph\nA -> B\n```", env);
  assert.ok(html.includes("data:image/png;base64,"));
  assert.equal(renders, 1);
  assert.equal(env.retained, true);
  assert.equal(config.base, "/docs/");
  assert.equal(config.vite.plugins[0].name, "existing");
  await config.buildEnd({});
  assert.deepEqual(calls, ["markdown", "buildEnd"]);
});

test("command defaults are resolved after Markdown installation and successful bundles stay open", async () => {
  const config = withTextGraph({});
  const md = new MarkdownIt();
  md.renderAsync = async (source, env) => md.render(source, env);
  await config.markdown.config(md);
  const plugin = config.vite.plugins[0];
  plugin.configResolved({ command: "build" });
  await plugin.buildEnd();
  await plugin.closeBundle();
  await assert.rejects(md.renderAsync("```textgraph\nA ->\n```", {}), { code: "TEXTGRAPH_RENDER_FAILED" });
  await config.buildEnd({});
});

test("server close disposes session and original site hook failures survive cleanup", async () => {
  const config = withTextGraph({ buildEnd() { throw new Error("user hook"); } });
  const md = new MarkdownIt();
  md.renderAsync = async (source, env) => md.render(source, env);
  await config.markdown.config(md);
  const plugin = config.vite.plugins[0];
  plugin.configResolved({ command: "serve" });
  const html = await md.renderAsync("```textgraph\nA ->\n```", {});
  assert.ok(html.includes("A -&gt;"));
  await plugin.closeServer({ reason: "close" });
  await assert.rejects(md.renderAsync("plain", {}), /disposed/);
  await assert.rejects(config.buildEnd({}), /user hook/);
});

async function buildFixture(t, { source, options = {}, base = "/", include } = {}) {
  const root = await mkdtemp(path.join(path.resolve(import.meta.dirname, ".."), ".test-site-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".vitepress"));
  const adapter = new URL("../src/vitepress.js", import.meta.url).href;
  await writeFile(path.join(root, ".vitepress/config.mjs"), `import { withTextGraph } from ${JSON.stringify(adapter)}; export default withTextGraph({base:${JSON.stringify(base)},srcExclude:["included.md"],themeConfig:{search:{provider:"local"}}},${JSON.stringify(options)});`);
  await writeFile(path.join(root, "index.md"), source);
  if (include) await writeFile(path.join(root, "included.md"), include);
  const cli = fileURLToPath(new URL("bin/vitepress.js", import.meta.resolve("vitepress/package.json")));
  const child = spawn(process.execPath, [cli, "build", root], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const timer = setTimeout(() => child.kill(), 45000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  return { root, code, output };
}

for (const base of ["/", "/docs/"]) {
  test(`real VitePress build preserves includes, nested fences and search at ${base}`, async t => {
    const result = await buildFixture(t, { base, source: "---\ntitle: Diagrams\n---\n# Diagrams\n\n```textgraph\nA -> B\n```\n\n> ~~~textgraph\n> C -> D\n> ~~~\n\n```js\nconst original = true\n```\n\n<!-- @include: ./included.md -->", include: "```textgraph\nE -> F\n```" });
    assert.equal(result.code, 0, result.output);
    const html = await readFile(path.join(result.root, ".vitepress/dist/index.html"), "utf8");
    assert.equal(html.split("data:image/png;base64,").length - 1, 3);
    assert.match(html, /const/);
    assert.doesNotMatch(html, /textgraph-placeholder|textgraph-marker/);
  });
}

test("bad DSL fails builds by default and explicit inline mode safely displays it", async t => {
  const source = "# Bad\n\n```textgraph\nA ->\n```";
  const bad = await buildFixture(t, { source });
  assert.notEqual(bad.code, 0, bad.output);
  assert.match(bad.output, /TextGraph|TG_PARSE/);
  const inline = await buildFixture(t, { source: "# Inline\n\n```textgraph\nA: {{missing.call()}} <script>oops</script>\nA ->\n```", options: { errorMode: "inline" } });
  assert.equal(inline.code, 0, inline.output);
  const html = await readFile(path.join(inline.root, ".vitepress/dist/index.html"), "utf8");
  assert.match(html, /missing.call/);
  assert.ok(!html.includes("<script>oops</script>"));
});
