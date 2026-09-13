const vscode = require('vscode');
const { Renderer } = require('./renderer.cjs');
const { Preview } = require('./preview.cjs');
let preview;

/** Desktop/remote Extension Host owns rendering; Markdown owns the webview. */
function activate(context) {
  preview = new Preview({
    renderer: new Renderer(),
    refresh: () => vscode.commands.executeCommand('markdown.preview.refresh'),
    isTrusted: () => vscode.workspace.isTrusted,
  });
  const pruneTimer = setInterval(() => preview.prune(), 60000);
  pruneTimer.unref();
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => preview.close(document.uri.toString())),
    vscode.workspace.onDidGrantWorkspaceTrust(() => preview.scheduleRefresh()),
    { dispose: () => clearInterval(pruneTimer) },
  );
  return { extendMarkdownIt: md => preview.extendMarkdownIt(md) };
}

async function deactivate() { await preview?.dispose(); }
module.exports = { activate, deactivate };
