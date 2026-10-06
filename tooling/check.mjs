import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Check exited with status ${result.status ?? 1}`);
}
for (const file of await readdir(new URL("../src/", import.meta.url), { recursive: true })) {
  if (file.endsWith(".js")) run(["--check", fileURLToPath(new URL(`../src/${file}`, import.meta.url))]);
}
// TypeScript 7 exports its package metadata, but keeps the CLI behind npm's bin
// entry rather than a module subpath. Resolve it from the installed package.
const compiler = fileURLToPath(new URL("bin/tsc", import.meta.resolve("typescript/package.json")));
run([compiler, "-p", "tsconfig.json"]);

// The alpha host owns Markdown 14 declarations. Resolve actual package paths
// so standalone and hoisted workspace installs check the same authority.
const declarations = name => fileURLToPath(import.meta.resolve(`@types/${name}/package.json`));
const temporary = await mkdtemp(path.join(tmpdir(), "markdown-textgraph-types-"));
try {
  const project = path.join(temporary, "tsconfig.json");
  await writeFile(project, JSON.stringify({
    extends: fileURLToPath(new URL("../tsconfig.vitepress.json", import.meta.url)),
    compilerOptions: {
      paths: Object.fromEntries(["markdown-it", "linkify-it"].map(name => [name, [path.join(path.dirname(declarations(name)), "index.d.mts")]])),
      typeRoots: [...new Set(["node", "web-bluetooth"].map(name => path.dirname(path.dirname(declarations(name)))))],
    },
  }));
  run([compiler, "-p", project]);
} finally { await rm(temporary, { recursive: true, force: true }); }
