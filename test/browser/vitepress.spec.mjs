import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "node:net";

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return String(port);
}

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("bin/vitepress.js", import.meta.resolve("vitepress/package.json")));

async function fixture(base) {
  const root = await mkdtemp(path.join(packageRoot, ".browser-site-"));
  await mkdir(path.join(root, ".vitepress"));
  const adapter = new URL("../../src/vitepress.js", import.meta.url).href;
  await writeFile(path.join(root, ".vitepress/config.mjs"), `import { withTextGraph } from ${JSON.stringify(adapter)}; export default withTextGraph({base:${JSON.stringify(base)},themeConfig:{search:{provider:"local"}}});`);
  await writeFile(path.join(root, "index.md"), "# Diagram\n\n```textgraph\nA -> B\n```\n");
  return root;
}
function launch(args) {
  const child = spawn(process.execPath, [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let url;
  const ready = new Promise((resolve, reject) => {
    const append = data => {
      output += data;
      const match = output.match(new RegExp("http://(?:127[.]0[.]0[.]1|localhost):[0-9]+"));
      if (match && !url) { url = match[0]; resolve(url); }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("exit", code => { if (!url) reject(new Error(`VitePress exited ${code}: ${output}`)); });
  });
  // Builds do not expose an HTTP URL; do not let that expected rejection escape.
  ready.catch(() => {});
  return { child, ready, output: () => output };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

test("development updates PNGs and leaves errors inert without browser SDK requests", async ({ page }) => {
  const root = await fixture("/");
  const server = launch(["dev", root, "--host", "127.0.0.1", "--port", await availablePort()]);
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  try {
    const url = await server.ready;
    await page.goto(url);
    const image = page.locator('.vp-doc img[alt="TextGraph diagram"]');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
    const original = await image.getAttribute("src");
    await writeFile(path.join(root, "index.md"), "# Changed\n\n```textgraph\nA -> C -> D\n```\n");
    await expect.poll(() => image.getAttribute("src")).not.toBe(original);
    await writeFile(path.join(root, "index.md"), "# Invalid\n\n```textgraph\nA: {{globalThis.__textgraphExecuted = true}} <script>oops</script>\nA ->\n```\n");
    await expect(page.locator(".vp-doc")).toContainText("__textgraphExecuted");
    expect(await page.evaluate(() => globalThis.__textgraphExecuted)).toBeUndefined();
    expect(requests.filter(url => new RegExp("[.]wasm(?:$|[?])|dotnet[.]|src/worker/render").test(url))).toEqual([]);
  } finally { await stop(server.child); await rm(root, { recursive: true, force: true }); }
});

for (const base of ["/", "/docs/"]) {
  test(`static preview at ${base} displays diagrams with JavaScript disabled`, async ({ browser }) => {
    const root = await fixture(base);
    let server;
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const build = launch(["build", root]);
      const [code] = await once(build.child, "exit");
      expect(code, build.output()).toBe(0);
      server = launch(["preview", root, "--port", await availablePort()]);
      const url = await server.ready;
      const page = await context.newPage();
      await page.goto(url + base);
      const image = page.locator('.vp-doc img[alt="TextGraph diagram"]');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    } finally {
      await context.close();
      if (server) await stop(server.child);
      await rm(root, { recursive: true, force: true });
    }
  });
}
