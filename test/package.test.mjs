import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath ?? path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
async function command(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { errors += data; });
  const timer = setTimeout(() => child.kill(), 60000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  assert.equal(code, 0, errors + output);
  return output;
}

test("packed public entries install with registry SDK, core types and a VitePress build", { timeout: 90000 }, async t => {
  const temp = await mkdtemp(path.join(tmpdir(), "markdown-textgraph-consumer-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const output = await command([npmCli, "pack", "--ignore-scripts", "--workspaces=false", "--json", "--pack-destination", temp], root);
  const [pack] = JSON.parse(output);
  const files = pack.files.map(file => file.path);
  assert.ok(files.includes("src/worker/render.js"));
  assert.ok(files.includes("src/index.d.ts"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(!files.some(file => new RegExp("[.]local|generated/wasm|node_modules|test/|tooling/").test(file)));
  await writeFile(path.join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await command([npmCli, "install", "--ignore-scripts", "--omit=optional", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund", path.join(temp, pack.filename), "markdown-it@14.1.0", "@types/markdown-it@14", "@types/node@22", "typescript@5.9.3"], temp);
  const require = createRequire(path.join(temp, "package.json"));
  assert.throws(() => require.resolve("vitepress"), { code: "MODULE_NOT_FOUND" });
  const sdkPath = require.resolve("@drawmotive/textgraph/node");
  assert.ok(sdkPath.startsWith(temp));
  const lock = JSON.parse(await readFile(path.join(temp, "package-lock.json"), "utf8"));
  assert.match(lock.packages["node_modules/@drawmotive/textgraph"].resolved, /^https:/);
  await writeFile(path.join(temp, "consumer.ts"), `import MarkdownIt from "markdown-it"; import { createTextGraphMarkdown } from "@drawmotive/markdown-it-textgraph"; const md = new MarkdownIt(); const session = createTextGraphMarkdown({onDiagnostic(value) { const line: number | undefined = value.documentLocation?.line; }}); md.use(session.markdownIt); await session.render(md, "plain"); await session.dispose();`);
  await command([require.resolve("typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], temp);
  await writeFile(path.join(temp, "render.mjs"), String.raw`import MarkdownIt from "markdown-it"; import { createTextGraphMarkdown } from "@drawmotive/markdown-it-textgraph"; const md=new MarkdownIt(); const s=createTextGraphMarkdown(); md.use(s.markdownIt); try { const html=await s.render(md, "~~~textgraph\nA -> B\n~~~"); if(!html.includes("data:image/png;base64,")) throw new Error(html); console.log("registry PNG rendered"); } finally { await s.dispose(); }`);
  assert.match(await command([path.join(temp, "render.mjs")], temp), /registry PNG rendered/);
  await command([npmCli, "install", "--ignore-scripts", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund", "vitepress@2.0.0-alpha.19"], temp);
  await mkdir(path.join(temp, ".vitepress"));
  await writeFile(path.join(temp, ".vitepress/config.mjs"), `import {withTextGraph} from "@drawmotive/markdown-it-textgraph/vitepress"; export default withTextGraph({});`);
  await writeFile(path.join(temp, "index.md"), "# Packed plugin\n\n~~~textgraph\nA -> B\n~~~");
  await command([path.join(path.dirname(require.resolve("vitepress/package.json")), "bin/vitepress.js"), "build", temp], temp);
  const html = await readFile(path.join(temp, ".vitepress/dist/index.html"), "utf8");
  assert.ok(html.includes("data:image/png;base64,"));
});
