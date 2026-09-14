import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import test from "node:test";
import MarkdownIt from "markdown-it";
import { withTextGraph } from "../src/vitepress.js";
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress";

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
  assert.match(html, /src="\/docs\/assets\/textgraph-[a-f0-9]{20}\.png"/);
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

test("actual Vite middleware server shutdown disposes the Markdown session", async () => {
  const config = withTextGraph({});
  const md = new MarkdownIt();
  md.renderAsync = async (source, env) => md.render(source, env);
  await config.markdown.config(md);
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, plugins: config.vite.plugins });
  try {
    await md.renderAsync("```textgraph\nA -> B\n```", {});
    await server.close();
    await assert.rejects(md.renderAsync("plain", {}), /disposed/);
  } finally { await server.close(); }
});

test("development can recover after host frontmatter errors", async () => {
  const config = withTextGraph({});
  const md = await createMarkdownRenderer(process.cwd(), config.markdown);
  try {
    await assert.rejects(md.renderAsync("---\ntitle: [broken\n---\nhello", {}), /YAML|flow collection|unexpected end/i);
    assert.ok((await md.renderAsync("corrected plain Markdown", {})).includes("corrected plain Markdown"));
  } finally { await config.buildEnd({}); await disposeMdItInstance(); }
});

async function buildFixture(t, { source, options = {}, base = "/", include, assetsDir = "assets" } = {}) {
  const root = await mkdtemp(path.join(path.resolve(import.meta.dirname, ".."), ".test-site-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".vitepress"));
  const adapter = new URL("../src/vitepress.js", import.meta.url).href;
  await writeFile(path.join(root, ".vitepress/config.mjs"), `import { withTextGraph } from ${JSON.stringify(adapter)}; export default withTextGraph({base:${JSON.stringify(base)},assetsDir:${JSON.stringify(assetsDir)},srcExclude:["included.md"],themeConfig:{search:{provider:"local"}}},${JSON.stringify(options)});`);
  await writeFile(path.join(root, "index.md"), source);
  await writeFile(path.join(root, "duplicate.md"), "# Duplicate\n\n~~~textgraph\nA -> B\n~~~\n");
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
    assert.ok(!html.includes("data:image/png;base64,"));
    const images = [...html.matchAll(/<img[^>]*src="([^"]*textgraph-[a-f0-9]{20}\.png)"[^>]*>/g)];
    assert.equal(images.length, 3);
    for (const [, url] of images) {
      assert.ok(url.startsWith(base + "assets/"), url);
      const bytes = await readFile(path.join(result.root, ".vitepress/dist", url.slice(base.length)));
      const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
      assert.ok(url.endsWith(`textgraph-${digest}.png`));
      assert.ok(PNG.sync.read(bytes).width > 0);
    }
    const duplicate = await readFile(path.join(result.root, ".vitepress/dist/duplicate.html"), "utf8");
    assert.ok(duplicate.includes(images[0][1]));
    assert.equal((await readdir(path.join(result.root, ".vitepress/dist/assets"))).filter(name => name.startsWith("textgraph-")).length, 3);
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

test("VitePress writes images into the configured assets directory", async t => {
  const result = await buildFixture(t, { source: "# Diagram\n\n~~~textgraph\nA -> B\n~~~", base: "/docs/", assetsDir: "media/diagrams" });
  assert.equal(result.code, 0, result.output);
  const html = await readFile(path.join(result.root, ".vitepress/dist/index.html"), "utf8");
  const url = html.match(/src="(\/docs\/media\/diagrams\/textgraph-[a-f0-9]{20}\.png)"/)?.[1];
  assert.ok(url);
  assert.ok((await readFile(path.join(result.root, ".vitepress/dist", url.slice(6)))).length > 0);
});
