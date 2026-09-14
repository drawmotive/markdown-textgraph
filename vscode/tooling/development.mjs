import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { validateDevelopment } from './development.cjs';
import { createWebpackConfig } from './webpack.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command, ...extra] = process.argv.slice(2);
if (!['build', 'package'].includes(command) || extra.length) throw new Error('Usage: node tooling/development.mjs build|package');
const selected = validateDevelopment(root);
const stage = path.join(selected.outputRoot, 'extension');
// Recreate the staging tree so deleted source assets cannot survive in a VSIX.
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await new Promise((resolve, reject) => {
  const compiler = webpack({ ...createWebpackConfig(root, { ...selected, outputRoot: path.join(stage, 'dist') }), mode: 'production' });
  compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError) return reject(error || closeError);
    if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
    resolve();
  }));
});
// The staging manifest has no publish lifecycle. Public source manifests and
// their mandatory release checks are never rewritten or bypassed.
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const { scripts, dependencies, devDependencies, ...stagedPackage } = pkg;
stagedPackage.private = true;
stagedPackage.displayName += ' (Development)';
await writeFile(path.join(stage, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);
for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', '.vscodeignore', 'media']) await cp(path.join(root, file), path.join(stage, file), { recursive: true });
if (command === 'package') {
  const vsix = path.join(selected.outputRoot, `${pkg.name}-${pkg.version}-development.vsix`);
  const cli = fileURLToPath(import.meta.resolve('@vscode/vsce/vsce'));
  const result = spawnSync(process.execPath, [cli, 'package', '--no-dependencies', '--out', vsix], { cwd: stage, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Development VSIX packaging failed (${result.status}).`);
  console.log(`Development VSIX: ${vsix}`);
} else console.log(`Development extension: ${stage}`);
