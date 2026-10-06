import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
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

async function compileConsumer(temp) {
  const require = createRequire(path.join(temp, "package.json"));
  await writeFile(path.join(temp, "consumer.ts"), `import MarkdownIt from "markdown-it"; import { createTextGraphMarkdown } from "@drawmotive/markdown-it-textgraph"; const md = new MarkdownIt(); const session = createTextGraphMarkdown({onDiagnostic(value) { const line: number | undefined = value.documentLocation?.line; }}); md.use(session.markdownIt); await session.render(md, "plain"); await session.dispose();`);
  await command([path.join(path.dirname(require.resolve("typescript/package.json")), "bin/tsc"), "--noEmit", "--strict", "--types", "node", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], temp);
}

test("packed public entries install with registry SDK, core types and a VitePress build", { timeout: 90000 }, async t => {
  const temp = await realpath(await mkdtemp(path.join(tmpdir(), "markdown-textgraph-consumer-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const output = await command([npmCli, "pack", "--ignore-scripts", "--workspaces=false", "--json", "--pack-destination", temp], root);
  const [pack] = JSON.parse(output);
  const files = pack.files.map(file => file.path);
  assert.ok(files.includes("src/worker/render.js"));
  assert.ok(files.includes("src/index.d.ts"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(!files.some(file => new RegExp("[.]local|generated/wasm|node_modules|test/|tooling/").test(file)));
  await writeFile(path.join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await command([npmCli, "install", "--ignore-scripts", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund", path.join(temp, pack.filename), ...["markdown-it", "@types/markdown-it", "@types/node", "typescript"].map(name => `${name}@${manifest.devDependencies[name]}`)], temp);
  const require = createRequire(path.join(temp, "package.json"));
  assert.throws(() => require.resolve("vitepress"), { code: "MODULE_NOT_FOUND" });
  const sdkPath = require.resolve("@drawmotive/textgraph/node");
  assert.ok(sdkPath.startsWith(temp));
  const lock = JSON.parse(await readFile(path.join(temp, "package-lock.json"), "utf8"));
  assert.match(lock.packages["node_modules/@drawmotive/textgraph"].resolved, /^https:/);
  await compileConsumer(temp);
  await writeFile(path.join(temp, "render.mjs"), String.raw`import MarkdownIt from "markdown-it"; import { createTextGraphMarkdown } from "@drawmotive/markdown-it-textgraph"; const md=new MarkdownIt(); const s=createTextGraphMarkdown(); md.use(s.markdownIt); try { const html=await s.render(md, "~~~textgraph\nA -> B\n~~~"); if(!html.includes("data:image/png;base64,")) throw new Error(html); console.log("registry PNG rendered"); } finally { await s.dispose(); }`);
  assert.match(await command([path.join(temp, "render.mjs")], temp), /registry PNG rendered/);
  await command([npmCli, "install", "--ignore-scripts", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund", `vitepress@${manifest.devDependencies.vitepress}`], temp);
  await mkdir(path.join(temp, ".vitepress"));
  await writeFile(path.join(temp, ".vitepress/config.mjs"), `import {withTextGraph} from "@drawmotive/markdown-it-textgraph/vitepress"; export default withTextGraph({});`);
  await writeFile(path.join(temp, "index.md"), "# Packed plugin\n\n~~~textgraph\nA -> B\n~~~");
  await command([path.join(path.dirname(require.resolve("vitepress/package.json")), "bin/vitepress.js"), "build", temp], temp);
  const html = await readFile(path.join(temp, ".vitepress/dist/index.html"), "utf8");
  assert.match(html, /src="\/assets\/textgraph-[a-f0-9]{20}\.png"/);
});

test("packed public types support Markdown 14 consumers with existing 14.1 typings", { timeout: 90000 }, async t => {
  const temp = await realpath(await mkdtemp(path.join(tmpdir(), "markdown-textgraph-consumer-14-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const [pack] = JSON.parse(await command([npmCli, "pack", "--ignore-scripts", "--workspaces=false", "--json", "--pack-destination", temp], root));
  await writeFile(path.join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await command([npmCli, "install", "--ignore-scripts", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund", path.join(temp, pack.filename), "markdown-it@14.3.2", "@types/markdown-it@14.1.2", ...["@types/node", "typescript"].map(name => `${name}@${manifest.devDependencies[name]}`)], temp);
  const lock = JSON.parse(await readFile(path.join(temp, "package-lock.json"), "utf8"));
  assert.equal(lock.packages["node_modules/markdown-it"].version, "14.3.2");
  assert.equal(lock.packages["node_modules/@types/markdown-it"].version, "14.1.2");
  await compileConsumer(temp);
});
