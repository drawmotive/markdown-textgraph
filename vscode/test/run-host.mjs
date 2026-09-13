import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.env.VSCODE_VERSION || '1.101.0';
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const vsix = process.env.TEXTGRAPH_VSIX || path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const artifactRoot = process.env.TEXTGRAPH_HOST_ARTIFACTS || await mkdtemp(path.join(os.tmpdir(), 'textgraph-vsix-host-'));
await mkdir(artifactRoot, { recursive: true });
await readFile(vsix);
const executable = await downloadAndUnzipVSCode(version);
const modes = process.env.TEXTGRAPH_HOST_MODE ? [process.env.TEXTGRAPH_HOST_MODE] : ['trusted', 'untrusted'];
assert.ok(modes.every(mode => ['trusted', 'untrusted'].includes(mode)), 'TEXTGRAPH_HOST_MODE must be trusted or untrusted');
console.log(`Real VSIX integration: VS Code ${version}; artifacts ${artifactRoot}`);

for (const mode of modes) {
  const runRoot = path.join(artifactRoot, mode);
  const userData = path.join(runRoot, 'user-data');
  const extensions = path.join(runRoot, 'extensions');
  const workspace = path.join(runRoot, 'workspace');
  await mkdir(path.join(userData, 'User'), { recursive: true });
  await mkdir(extensions, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await copyFile(path.join(root, 'test/host/preview.md'), path.join(workspace, 'preview.md'));
  await writeFile(path.join(workspace, 'ordinary.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  await writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({
    'security.workspace.trust.enabled': mode === 'untrusted',
    'security.workspace.trust.startupPrompt': 'never',
    'security.workspace.trust.banner': 'never',
    'security.workspace.trust.emptyWindow': false,
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'window.restoreWindows': 'none',
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'markdown.preview.security.level': 'strict',
  }, null, 2));
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
  await command(cli, [...cliArgs, '--no-sandbox', '--user-data-dir', userData, '--extensions-dir', extensions, '--install-extension', vsix, '--force']);
  const port = await freePort();
  // test-electron's runTests always adds --disable-workspace-trust. Spawn the
  // downloaded real product directly so the restricted profile is genuine.
  await command(executable, [
    workspace, '--user-data-dir', userData, '--extensions-dir', extensions,
    '--extensionDevelopmentPath=' + path.join(root, 'test/host'),
    '--extensionTestsPath=' + path.join(root, 'test/host/index.cjs'),
    '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox',
    '--skip-welcome', '--skip-release-notes', '--disable-updates',
    '--use-inmemory-secretstorage',
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    ...(mode === 'trusted' ? ['--disable-workspace-trust'] : []),
  ], {
    ...process.env,
    TEXTGRAPH_TEST_TRUST: mode,
    TEXTGRAPH_TEST_WORKSPACE: workspace,
    TEXTGRAPH_TEST_EXTENSIONS: extensions,
    TEXTGRAPH_TEST_CDP: 'http://127.0.0.1:' + port,
    TEXTGRAPH_TEST_ARTIFACTS: runRoot,
    TEXTGRAPH_TEST_VSCODE: version,
  });
}
console.log(`VSIX Markdown Preview checks passed. Evidence: ${artifactRoot}`);

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function command(executablePath, args, environment = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { stdio: 'inherit', env: environment });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`VS Code process exited ${code}`)));
  });
}
