import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import yauzl from 'yauzl';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'textgraph-development-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const component = path.join(directory, 'component');
  const sdk = path.join(directory, 'sdk');
  const runtime = path.join(directory, '.local/native/generation/generated');
  const output = path.join(directory, '.local/vscode');
  await mkdir(path.join(component, 'node_modules/@drawmotive'), { recursive: true });
  await mkdir(path.join(sdk, 'src'), { recursive: true });
  await mkdir(path.join(runtime, 'wasm'), { recursive: true });
  await writeFile(path.join(component, 'package.json'), '{}');
  await writeFile(path.join(sdk, 'package.json'), JSON.stringify({ name: '@drawmotive/textgraph', version: '0.2.0', type: 'module', exports: { './node': './src/node.js' } }));
  await writeFile(path.join(sdk, 'src/node.js'), 'export async function initializeTextGraph() { return { renderPng: async () => ({ localSource: true }) }; }');
  await symlink(sdk, path.join(component, 'node_modules/@drawmotive/textgraph'), 'dir');
  const manifest = { schemaVersion: 1, packageName: '@drawmotive/textgraph', packageVersion: '0.2.0', privateSource: { commit: 'a'.repeat(40), development: true }, runtimeModule: 'wasm/dotnet.js', entryAssembly: 'wasm/bridge.wasm', runtimeWasm: 'wasm/dotnet.native.wasm', runtimeConfig: 'wasm/bridge.runtimeconfig.json', rendering: { theme: 'wasm/themes.css', fonts: [{ family: 'Test', asset: 'wasm/test.ttf' }] }, assets: [] };
  for (const asset of ['dotnet.js', 'bridge.wasm', 'dotnet.native.wasm', 'bridge.runtimeconfig.json', 'themes.css', 'test.ttf']) {
    const bytes = Buffer.from(`local ${asset}`);
    await writeFile(path.join(runtime, 'wasm', asset), bytes);
    manifest.assets.push({ path: `wasm/${asset}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const saveManifest = async () => {
    await writeFile(path.join(runtime, 'wasm-manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(runtime, 'wasm-manifest.js'), `export default ${JSON.stringify(manifest, null, 2)};\n`);
  };
  await saveManifest();
  return { component, sdk, runtime, output, manifest, saveManifest, env: { DRAWMOTIVE_TEXTGRAPH_RUNTIME: runtime, DRAWMOTIVE_TEXTGRAPH_SDK: sdk, DRAWMOTIVE_DEV_OUTPUT: output } };
}

function validate(component, env) {
  const file = path.join(root, 'tooling/development.cjs');
  assert.ok(require('node:fs').existsSync(file), 'dedicated development validator is available');
  return require(file).validateDevelopment(component, env);
}

test('development selection validates native hashes and the exact local SDK Node resolution', async t => {
  const f = await fixture(t);
  const selected = validate(f.component, f.env);
  assert.equal(selected.sdkRoot, f.sdk);
  assert.equal(selected.generatedRoot, f.runtime);
  assert.equal(selected.outputRoot, f.output);
});

test('development selection refuses release bytes, corrupted assets, unlisted files, missing fonts, and wrong SDK', async t => {
  const f = await fixture(t);
  f.manifest.privateSource.development = false;
  await f.saveManifest();
  assert.throws(() => validate(f.component, f.env), /development.*true/i);
  f.manifest.privateSource.development = true;
  await f.saveManifest();
  await writeFile(path.join(f.runtime, 'wasm/test.ttf'), 'corrupt');
  assert.throws(() => validate(f.component, f.env), /test.ttf.*SHA-256/);
  await writeFile(path.join(f.runtime, 'wasm/test.ttf'), 'local test.ttf');
  await writeFile(path.join(f.runtime, 'wasm/extra.wasm'), 'unlisted');
  assert.throws(() => validate(f.component, f.env), /unmanifested/);
  await rm(path.join(f.runtime, 'wasm/extra.wasm'));
  f.manifest.rendering.fonts[0].asset = 'wasm/missing.ttf';
  await f.saveManifest();
  assert.throws(() => validate(f.component, f.env), /missing.ttf/);
  f.manifest.rendering.fonts[0].asset = 'wasm/test.ttf';
  await f.saveManifest();
  assert.throws(() => validate(f.component, { ...f.env, DRAWMOTIVE_TEXTGRAPH_SDK: f.component }), /SDK/);
});

test('development selection confines output to .local and rejects runtime traversal', async t => {
  const f = await fixture(t);
  assert.throws(() => validate(f.component, { ...f.env, DRAWMOTIVE_DEV_OUTPUT: f.component }), /.local/);
  f.manifest.assets[0].path = '../../package.json';
  await f.saveManifest();
  assert.throws(() => validate(f.component, f.env), /unsafe/);
});

test('development VSIX contains selected local SDK, runtime and fonts and worker needs no selection environment', async t => {
  const f = await fixture(t);
  validate(f.component, f.env);
  for (const file of ['src', 'tooling', 'package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'LICENSE', '.vscodeignore', 'media']) {
    await cp(path.join(root, file), path.join(f.component, file), { recursive: true });
  }
  for (const name of await readdir(path.join(root, 'node_modules'))) {
    if (name !== '@drawmotive') await symlink(path.join(root, 'node_modules', name), path.join(f.component, 'node_modules', name));
  }
  const beforeManifest = await readFile(path.join(f.component, 'package.json'));
  const beforeLock = await readFile(path.join(f.component, 'package-lock.json'));
  await mkdir(path.join(f.output, 'extension/media'), { recursive: true });
  await writeFile(path.join(f.output, 'extension/media/removed.png'), 'stale image from previous build');
  const result = spawnSync(process.execPath, [path.join(f.component, 'tooling/development.mjs'), 'package'], { cwd: f.component, env: { ...process.env, ...f.env }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const pkg = JSON.parse(beforeManifest);
  const entries = await readZip(path.join(f.output, `${pkg.name}-${pkg.version}-development.vsix`));
  const prefix = 'extension/dist/node_modules/@drawmotive/textgraph/';
  assert.deepEqual(entries.get(`${prefix}generated/wasm/test.ttf`), Buffer.from('local test.ttf'));
  assert.equal(JSON.parse(entries.get(`${prefix}generated/wasm-manifest.json`)).privateSource.development, true);
  assert.match(entries.get(`${prefix}src/node.js`).toString(), /localSource/);
  assert.equal(JSON.parse(entries.get('extension/package.json')).private, true);
  assert.equal(entries.has('extension/media/removed.png'), false);
  assert.deepEqual(await readFile(path.join(f.component, 'package.json')), beforeManifest);
  assert.deepEqual(await readFile(path.join(f.component, 'package-lock.json')), beforeLock);
  const worker = new Worker(path.join(f.output, 'extension/dist/render-worker.mjs'), { env: {} });
  t.after(() => worker.terminate());
  const rendered = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  worker.postMessage({ source: 'A -> B' });
  assert.deepEqual(await rendered, { result: { localSource: true } });
});

async function readZip(file) {
  const zip = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (error, archive) => error ? reject(error) : resolve(archive)));
  const entries = new Map();
  await new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      stream.on('error', reject);
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
    }));
    zip.readEntry();
  });
  return entries;
}
