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
const capture = process.argv.includes('--capture');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const vsix = process.env.TEXTGRAPH_VSIX || path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const artifactRoot = process.env.TEXTGRAPH_HOST_ARTIFACTS || await mkdtemp(path.join(os.tmpdir(), 'textgraph-vsix-host-'));
await mkdir(artifactRoot, { recursive: true });
await readFile(vsix);
const executable = process.env.VSCODE_EXECUTABLE || await downloadAndUnzipVSCode(version);
const modes = capture ? ['trusted'] : process.env.TEXTGRAPH_HOST_MODE ? [process.env.TEXTGRAPH_HOST_MODE] : ['trusted', 'untrusted'];
assert.ok(modes.every(mode => ['trusted', 'untrusted'].includes(mode)), 'TEXTGRAPH_HOST_MODE must be trusted or untrusted');
console.log(`Real VSIX integration: VS Code ${version}; artifacts ${artifactRoot}`);

for (const mode of modes) {
  const runRoot = path.join(artifactRoot, mode);
  const userData = path.join(runRoot, 'user-data');
  const extensions = path.join(runRoot, 'extensions');
  const workspace = path.join(runRoot, 'workspace');
  const runtime = path.join(runRoot, 'runtime');
  await mkdir(path.join(userData, 'User'), { recursive: true });
  await mkdir(extensions, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(runtime, { mode: 0o700 });
  await copyFile(path.join(root, capture ? 'examples/online-order.md' : 'test/host/preview.md'), path.join(workspace, capture ? 'online-order.md' : 'preview.md'));
  if (!capture) await writeFile(path.join(workspace, 'ordinary.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  await writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({
    'security.workspace.trust.enabled': mode === 'untrusted',
    'security.workspace.trust.startupPrompt': 'never',
    'security.workspace.trust.banner': 'never',
    'security.workspace.trust.emptyWindow': false,
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'git.openRepositoryInParentFolders': 'never',
    'window.restoreWindows': 'none',
    'window.titleBarStyle': 'custom', 'window.newWindowDimensions': 'maximized',
    'workbench.statusBar.visible': true, 'workbench.activityBar.location': 'default',
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'markdown.preview.security.level': 'strict',
  }, null, 2));
  if (capture) {
    // Seed actual development-host bounds in this fresh profile; Xvfb has no WM.
    await mkdir(path.join(userData, 'User/globalStorage'), { recursive: true });
    await writeFile(path.join(userData, 'User/globalStorage/storage.json'), JSON.stringify({ windowsState: {
      lastPluginDevelopmentHostWindow: { uiState: { mode: 1, x: 0, y: 0, width: 1600, height: 1400 } }, openedWindows: [],
    } }));
  }
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
  const environment = { ...process.env, XDG_RUNTIME_DIR: runtime };
  await command(cli, [...cliArgs, '--no-sandbox', '--user-data-dir', userData, '--extensions-dir', extensions, '--install-extension', vsix, '--force'], environment);
  const port = await freePort();
  // test-electron's runTests always adds --disable-workspace-trust. Spawn the
  // downloaded real product directly so the restricted profile is genuine.
  const launchArgs = [
    workspace, '--user-data-dir', userData, '--extensions-dir', extensions,
    '--extensionDevelopmentPath=' + path.join(root, 'test/host'),
    ...(capture ? [] : ['--extensionTestsPath=' + path.join(root, 'test/host/index.cjs')]),
    '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox',
    '--skip-welcome', '--skip-release-notes', '--disable-updates',
    '--use-inmemory-secretstorage',
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    ...(mode === 'trusted' ? ['--disable-workspace-trust'] : []),
  ];
  const headlessLinux = process.platform === 'linux' && (capture || !process.env.DISPLAY);
  await command(headlessLinux ? 'xvfb-run' : executable, headlessLinux ? ['-a', '-s', '-screen 0 1600x' + (capture ? '1400' : '1200') + 'x24 -nolisten unix', executable, ...launchArgs] : launchArgs, {
    ...environment,
    TEXTGRAPH_EXAMPLE_CAPTURE: capture ? root : '',
    TEXTGRAPH_TEST_TRUST: mode,
    TEXTGRAPH_TEST_WORKSPACE: workspace,
    TEXTGRAPH_TEST_EXTENSIONS: extensions,
    TEXTGRAPH_TEST_CDP: 'http://127.0.0.1:' + port,
    TEXTGRAPH_TEST_ARTIFACTS: runRoot,
    TEXTGRAPH_TEST_VSCODE: version,
  });
  const result = JSON.parse(await readFile(path.join(runRoot, 'result.json'), 'utf8'));
  assert.ok(!result.error, result.error);
  if (capture) assert.equal(result.checks.length, 1, 'Capture driver must verify the canonical example');
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
    const windows = process.platform === 'win32';
    const child = spawn(executablePath, args, {
      stdio: 'inherit',
      env: { ...environment, DONT_PROMPT_WSL_INSTALL: '1' },
      shell: windows,
      detached: !windows,
    });
    let stopping = false;
    let finished = false;
    const exited = new Promise(done => child.once('exit', done));
    const cleanup = () => {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    };
    const finish = error => {
      if (finished) return;
      finished = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const stop = async reason => {
      if (stopping || finished) return;
      stopping = true;
      clearTimeout(timer);
      // A VS Code launch owns several child processes. Kill the launch group,
      // then await its leader, so failed tests cannot leave a hidden host alive.
      try {
        if (windows && child.pid) {
          await new Promise(done => {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            killer.once('error', done);
            killer.once('exit', done);
          });
        } else if (child.pid) {
          const signalGroup = signal => {
            try { process.kill(-child.pid, signal); }
            catch (error) { if (error.code !== 'ESRCH') throw error; }
          };
          signalGroup('SIGTERM');
          await new Promise(done => setTimeout(done, 1500));
          signalGroup('SIGKILL');
        }
        await Promise.race([exited, new Promise(done => setTimeout(done, 1500))]);
        finish(new Error(reason));
      } catch (error) { finish(new Error(reason, { cause: error })); }
    };
    const interrupt = () => { void stop('VS Code host test interrupted'); };
    const timer = setTimeout(() => { void stop('VS Code installation or host test exceeded five minutes'); }, 300000);
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    child.once('error', finish);
    child.once('exit', code => {
      if (!stopping) finish(code === 0 ? undefined : new Error('VS Code process exited ' + code));
    });
  });
}
