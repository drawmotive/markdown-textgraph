const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

/** Development uses an explicit source SDK and one complete native generation.
 * This separate authority never relaxes the public release checker. */
function validateDevelopment(componentRoot, env = process.env) {
  const absolute = name => {
    const value = env[name];
    if (!value || !path.isAbsolute(value)) throw new Error(`${name} must select an absolute local path. Run the superproject development command.`);
    return path.normalize(value);
  };
  componentRoot = fs.realpathSync(componentRoot);
  const sdkRoot = fs.realpathSync(absolute('DRAWMOTIVE_TEXTGRAPH_SDK'));
  const generatedRoot = fs.realpathSync(absolute('DRAWMOTIVE_TEXTGRAPH_RUNTIME'));
  const outputRoot = absolute('DRAWMOTIVE_DEV_OUTPUT');
  // Validate the existing ancestor too: an output symlink cannot redirect the
  // webpack clean operation into tracked source or a release directory.
  let ancestor = outputRoot;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const canonicalOutput = path.join(fs.realpathSync(ancestor), path.relative(ancestor, outputRoot));
  if (!canonicalOutput.split(path.sep).includes('.local') || path.basename(canonicalOutput) === '.local') throw new Error('Development output must be a directory inside .local.');
  for (const input of [sdkRoot, generatedRoot, componentRoot]) {
    if (inside(canonicalOutput, input) || (inside(input, canonicalOutput) && input !== componentRoot)) throw new Error('Development output must not overlap the SDK or selected runtime.');
  }
  const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const sdk = readJson(path.join(sdkRoot, 'package.json'));
  if (sdk.name !== '@drawmotive/textgraph') throw new Error('Development SDK must be @drawmotive/textgraph.');
  const installed = fs.realpathSync(path.join(componentRoot, 'node_modules/@drawmotive/textgraph'));
  const entry = fs.realpathSync(createRequire(path.join(componentRoot, 'package.json')).resolve('@drawmotive/textgraph/node'));
  if (installed !== sdkRoot || !inside(sdkRoot, entry)) throw new Error('Node must resolve the selected local SDK; run the superproject development command.');
  const manifest = readJson(path.join(generatedRoot, 'wasm-manifest.json'));
  if (manifest.privateSource?.development !== true) throw new Error('Development runtime must declare privateSource.development true.');
  if (manifest.schemaVersion !== 1 || manifest.packageName !== sdk.name || manifest.packageVersion !== sdk.version || !/^[a-f0-9]{40}$/.test(manifest.privateSource.commit ?? '')) throw new Error('Development native manifest identity or source provenance is invalid.');
  if (fs.readFileSync(path.join(generatedRoot, 'wasm-manifest.js'), 'utf8') !== `export default ${JSON.stringify(manifest, null, 2)};\n`) throw new Error('Development native JS manifest differs from the JSON authority.');
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Development native manifest must list its assets.');
  const seen = new Set();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.path !== 'string' || !/^wasm[/][A-Za-z0-9_.-]+$/.test(asset.path) || ['.', '..'].includes(asset.path.slice(5)) || seen.has(asset.path)) throw new Error('Development native manifest has an unsafe or duplicate asset path.');
    seen.add(asset.path);
    const file = path.join(generatedRoot, asset.path);
    if (fs.realpathSync(file) !== file) throw new Error(`Development asset ${asset.path} must not be a symlink.`);
    const bytes = fs.readFileSync(file);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes !== bytes.length || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Development asset ${asset.path} does not match its byte length/SHA-256.`);
  }
  const disk = fs.readdirSync(path.join(generatedRoot, 'wasm')).map(file => `wasm/${file}`);
  if (disk.length !== seen.size || disk.some(file => !seen.has(file))) throw new Error('Development runtime contains unmanifested native assets.');
  if (!Array.isArray(manifest.rendering?.fonts) || !manifest.rendering.fonts.length) throw new Error('Development runtime must select its rendering fonts.');
  for (const asset of [manifest.runtimeModule, manifest.entryAssembly, manifest.runtimeWasm, manifest.runtimeConfig, manifest.rendering.theme, ...manifest.rendering.fonts.map(font => font.asset)]) {
    if (!seen.has(asset)) throw new Error(`Development runtime requires manifested asset ${asset}.`);
  }
  return { sdkRoot, generatedRoot, outputRoot: canonicalOutput };
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

module.exports = { validateDevelopment };
