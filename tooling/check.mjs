import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const file of await readdir(new URL("../src/", import.meta.url), { recursive: true })) {
  if (file.endsWith(".js")) run(["--check", fileURLToPath(new URL(`../src/${file}`, import.meta.url))]);
}
run([fileURLToPath(import.meta.resolve("typescript/bin/tsc")), "-p", "tsconfig.json"]);
