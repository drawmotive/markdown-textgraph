const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');

// Keep the public SDK's generated module/asset paths intact. No workspace SDK
// resolution, private build, browser bundle, or download at activation time.
module.exports = {
  target: 'node22',
  entry: './src/extension.cjs',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'extension.cjs', libraryTarget: 'commonjs2', clean: true },
  externals: { vscode: 'commonjs vscode' },
  optimization: { minimize: false },
  node: { __dirname: false },
  plugins: [new CopyPlugin({ patterns: [
    { from: 'src/render-worker.mjs', to: 'render-worker.mjs' },
    { from: 'node_modules/@drawmotive/textgraph', to: 'node_modules/@drawmotive/textgraph' },
  ] })],
};
