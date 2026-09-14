const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');

/** Both channels bundle the same extension and preserve the SDK module paths.
 * Only the development validator may select a different SDK/runtime pair. */
function createWebpackConfig(root, { sdkRoot = path.join(root, 'node_modules/@drawmotive/textgraph'), generatedRoot, outputRoot = path.join(root, 'dist') } = {}) {
  const sdkTarget = 'node_modules/@drawmotive/textgraph';
  const sdkPatterns = generatedRoot ? [
    ...['package.json', 'src', 'schemas', 'LICENSE', 'README.md'].map(file => ({ from: path.join(sdkRoot, file), to: `${sdkTarget}/${file}`, noErrorOnMissing: ['schemas', 'LICENSE', 'README.md'].includes(file) })),
    ...['wasm', 'wasm-manifest.json', 'wasm-manifest.js'].map(file => ({ from: path.join(generatedRoot, file), to: `${sdkTarget}/generated/${file}` })),
  ] : [{ from: sdkRoot, to: sdkTarget }];
  return {
    context: root,
    target: 'node22',
    entry: './src/extension.cjs',
    output: { path: outputRoot, filename: 'extension.cjs', libraryTarget: 'commonjs2', clean: true },
    externals: { vscode: 'commonjs vscode' },
    optimization: { minimize: false },
    node: { __dirname: false },
    plugins: [new CopyPlugin({ patterns: [
      { from: 'src/render-worker.mjs', to: 'render-worker.mjs' },
      ...sdkPatterns,
    ] })],
  };
}

module.exports = { createWebpackConfig };
