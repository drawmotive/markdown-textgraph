import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkComponent } from "../.release/check.cjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const registry = "https://registry.npmjs.org/";

/** The generated target owns package identity; native dependencies must already be public. */
export async function releaseIdentity() {
  const errors = checkComponent(root, { ready: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  const pkg = await readJson(path.join(root, "package.json"));
  const target = await readJson(path.join(root, ".release/target.json"));
  assert.equal(target.channel, "stable", "This workflow releases the coordinated stable channel.");
  assert.notEqual(pkg.private, true);
  assert.deepEqual(pkg.publishConfig, { access: "public", registry, tag: "latest" });
  return { name: pkg.name, version: pkg.version, tag: "latest", gitTag: `markdown-v${pkg.version}`, filename: `drawmotive-markdown-it-textgraph-${pkg.version}.tgz` };
}

/** Release tags and OIDC must identify the same immutable tested commit. */
export function assertReleaseRef(release, commit, env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "npm publication runs only in GitHub Actions.");
  assert.equal(env.GITHUB_REPOSITORY, "drawmotive/markdown-textgraph");
  assert.equal(env.GITHUB_REF, `refs/tags/${release.gitTag}`);
  assert.equal(env.GITHUB_SHA, commit);
  assert.match(commit, /^[a-f0-9]{40}$/);
}

async function npm(args) {
  return exec("npm", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
}

export async function verifyArtifact(directory, expected, commit) {
  const receipt = await readJson(path.join(directory, "npm-release.json"));
  for (const key of ["name", "version", "tag", "gitTag", "filename"]) assert.equal(receipt[key], expected[key], `Artifact ${key} mismatch`);
  assert.equal(receipt.commit, commit, "Artifact source commit mismatch");
  const bytes = await readFile(path.join(directory, expected.filename));
  assert.equal(receipt.integrity, `sha512-${createHash("sha512").update(bytes).digest("base64")}`, "Artifact integrity mismatch");
  return receipt;
}

/** Pack only the verified checkout, then bind the archive to its source commit. */
async function pack(release, commit) {
  const errors = checkComponent(root, { installed: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  const directory = path.join(root, ".release");
  await mkdir(directory, { recursive: true });
  const { stdout } = await npm(["pack", "--ignore-scripts", "--json", "--workspaces=false", "--pack-destination", directory]);
  const [packed] = JSON.parse(stdout);
  for (const key of ["name", "version", "filename"]) assert.equal(packed[key], release[key]);
  for (const file of packed.files) assert.ok(["package.json", "README.md", "LICENSE", "CHANGELOG.md"].includes(file.path)
    || file.path.startsWith("src/") || file.path.startsWith("examples/"), `Unexpected public file: ${file.path}`);
  const receipt = { ...release, commit, integrity: packed.integrity };
  await writeFile(path.join(directory, "npm-release.json"), JSON.stringify(receipt, null, 2) + "\n");
  return verifyArtifact(directory, release, commit);
}

/** Exact-version reads and dist-tags are independent registry views. A missing
 * new version may lag publication; visible conflicting bytes are never retried. */
export async function registryState(release, fetchRegistry = fetch) {
  const base = registry + encodeURIComponent(release.name);
  const options = { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(30000) };
  const response = await fetchRegistry(`${base}/${release.version}`, options);
  if (response.status === 404) return { published: false };
  assert.ok(response.ok, `npm version lookup returned HTTP ${response.status}`);
  const metadata = await response.json();
  assert.equal(metadata.name, release.name);
  assert.equal(metadata.version, release.version);
  assert.equal(metadata.dist?.integrity, release.integrity, "Published tarball integrity mismatch");
  const tags = await fetchRegistry(`${registry}-/package/${encodeURIComponent(release.name)}/dist-tags`, options);
  assert.ok(tags.ok, `npm dist-tags returned HTTP ${tags.status}`);
  return { published: true, tagged: (await tags.json())[release.tag] === release.version };
}

export async function publishArtifact(release, directory, { run = npm, readState = registryState, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const before = await readState(release);
  if (before.published) {
    assert.ok(before.tagged, "Published version has a different dist-tag; inspect registry state before changing tags.");
    return "already-published";
  }
  await run(["publish", path.join(directory, release.filename), "--ignore-scripts", "--access", "public", "--tag", release.tag, "--registry", registry, "--provenance"]);
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await readState(release);
    if (state.published && state.tagged) return "published";
    if (attempt < 9) await delay(2000);
  }
  throw new Error("Publication is not visible yet; rerun verification with the same retained artifact.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && ["check", "pack", "publish"].includes(action), "Usage: node tooling/npm-release.mjs <check|pack|publish>");
  const release = await releaseIdentity();
  const commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  assertReleaseRef(release, commit);
  if (action === "check") console.log(JSON.stringify({ ...release, commit }));
  else if (action === "pack") console.log(JSON.stringify(await pack(release, commit), null, 2));
  else {
    const directory = path.join(root, ".release");
    const receipt = await verifyArtifact(directory, release, commit);
    console.log(JSON.stringify({ ...receipt, status: await publishArtifact(receipt, directory) }, null, 2));
  }
}
