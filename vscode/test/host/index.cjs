const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const vscode = require('vscode');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
let activeBrowser;

// The driver is a separate development extension; the product must be loaded
// from the installed VSIX in this launch's isolated extensions directory.
exports.run = async function run() {
  const evidence = { vscode: vscode.version, node: process.versions.node, trust: vscode.workspace.isTrusted, checks: [] };
  const artifacts = process.env.TEXTGRAPH_TEST_ARTIFACTS;
  const expectedTrust = process.env.TEXTGRAPH_TEST_TRUST === 'trusted';
  let browser;
  let preview;
  try {
    assert.equal(vscode.workspace.isTrusted, expectedTrust, 'Actual Workspace Trust must match requested profile');
    assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'Actual Extension Host must satisfy SDK Node >=22');
    const extension = vscode.extensions.getExtension('drawmotive.textgraph-markdown');
    assert.ok(extension, 'Product must be installed from VSIX');
    const installedRoot = path.resolve(process.env.TEXTGRAPH_TEST_EXTENSIONS);
    assert.ok(path.resolve(extension.extensionPath).startsWith(installedRoot + path.sep), 'Product loaded outside installed VSIX directory: ' + extension.extensionPath);
    evidence.extension = { id: extension.id, version: extension.packageJSON.version, path: extension.extensionPath };
    browser = await retry(() => chromium.connectOverCDP(process.env.TEXTGRAPH_TEST_CDP), 15000, 'connect to actual VS Code Chromium');
    activeBrowser = browser;
    const uri = vscode.Uri.file(path.join(process.env.TEXTGRAPH_TEST_WORKSPACE, 'preview.md'));
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    preview = await findPreview(browser);
    preview = await waitFor(preview, () => document.querySelectorAll('.textgraph-preview').length === 2, 'two TextGraph fences');
    if (!expectedTrust) {
      preview = await waitFor(preview, () => document.querySelectorAll('.textgraph-preview[data-state="untrusted"]').length === 2, 'restricted mode source fallback');
      assert.equal(await preview.locator('.textgraph-preview img').count(), 0);
      assert.match(await preview.locator('.textgraph-preview').first().textContent(), /A -> B/);
      await replaceText(document, original.replace('A -> B', 'A -> RestrictedUpdate'));
      preview = await waitFor(preview, () => document.querySelector('.textgraph-preview')?.textContent.includes('RestrictedUpdate'), 'restricted mode automatic source update');
      assert.equal(await preview.locator('.textgraph-preview img').count(), 0);
      evidence.checks.push('untrusted workspace preserves source without rendering, including unsaved edits');
    } else {
      preview = await waitFor(preview, imagesReady, 'two rendered PNG diagrams', 90000);
      const initial = await getImages(preview);
      verifyPngs(initial);
      assert.notEqual(initial[0], initial[1], 'Different diagrams must produce different images');
      evidence.checks.push('multiple public SDK diagrams decoded as nonempty PNG images');

      await replaceText(document, original.replace('A -> B', 'A -> EditedNode'));
      assert.equal(document.isDirty, true, 'Edit must remain unsaved');
      preview = await waitFor(preview, ({ old }) => {
        const images = [...document.querySelectorAll('.textgraph-preview[data-state="ready"] img')];
        return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0) && images[0].src !== old;
      }, 'automatic refresh after unsaved edit', 90000, { old: initial[0] });
      const edited = await getImages(preview);
      assert.equal(edited[1], initial[1], 'Editing one fence preserves the other diagram');
      evidence.checks.push('unsaved edits automatically replace changed diagram image');

      for (const label of ['RapidOne', 'RapidTwo', 'FinalNode']) {
        await replaceText(document, original.replace('A -> B', 'A -> ' + label));
      }
      preview = await waitFor(preview, ({ sourceHash }) => {
        const containers = [...document.querySelectorAll('.textgraph-preview[data-state="ready"]')];
        const image = containers[0]?.querySelector('img');
        return containers.length === 2 && containers[0].dataset.source === sourceHash && image.complete && image.naturalWidth > 0;
      }, 'rapid edit recovery', 90000, { sourceHash: createHash('sha256').update('A -> FinalNode\n').digest('hex') });
      const rapid = await getImages(preview);
      await replaceText(document, original.replace('A -> B', 'A ->'));
      preview = await waitFor(preview, () => document.querySelectorAll('.textgraph-preview[data-state="error"]').length === 1 && document.querySelectorAll('.textgraph-preview[data-state="ready"] img').length === 1, 'invalid source diagnostics');
      const diagnostic = await preview.locator('.textgraph-preview[data-state="error"]').textContent();
      assert.ok(diagnostic.trim().length > 5, 'Invalid source should explain its diagnostic');
      evidence.diagnostic = diagnostic;
      evidence.checks.push('invalid source displays diagnostic while independent diagram remains rendered');

      await replaceText(document, original.replace('A -> B', 'A -> FinalNode'));
      preview = await waitFor(preview, imagesReady, 'valid source recovers after invalid source', 90000);
      const recovered = await getImages(preview);
      assert.equal(recovered[0], rapid[0], 'Rapid edits and recovery converge to final source image');
      evidence.checks.push('rapid edits converge and valid source recovers after diagnostics');

      await replaceText(document, original.replace('A -> B', 'A -> {}'));
      preview = await waitFor(preview, () => {
        const failure = document.querySelector('.textgraph-preview[data-state="error"]');
        const independent = document.querySelectorAll('.textgraph-preview[data-state="ready"] img');
        return failure?.textContent.includes('TG_RENDER_TIMEOUT') && independent.length === 1 && independent[0].complete && independent[0].naturalWidth > 0;
      }, 'native SDK hang is terminated outside the Extension Host thread', 35000);
      evidence.timeoutDiagnostic = await preview.locator('.textgraph-preview[data-state="error"]').textContent();
      await replaceText(document, original.replace('A -> B', 'A -> AfterTimeout'));
      preview = await waitFor(preview, imagesReady, 'replacement Worker renders after native timeout', 35000);
      verifyPngs(await getImages(preview));
      evidence.checks.push('native SDK hang reports TG_RENDER_TIMEOUT without blocking independent diagram; replacement Worker recovers');

      await replaceText(document, original.replace('A -> B', 'A ->\n<script>globalThis.__textgraphInjected = true</script>'));
      preview = await waitFor(preview, () => document.querySelectorAll('.textgraph-preview[data-state="error"]').length === 1, 'HTML-looking invalid source');
      assert.equal(await preview.evaluate(() => globalThis.__textgraphInjected), undefined);
      assert.equal(await preview.locator('.textgraph-preview script, .textgraph-preview [onerror], .textgraph-preview [onload]').count(), 0);
      await replaceText(document, original);
      preview = await waitFor(preview, imagesReady, 'restore before screenshot', 90000);
      evidence.checks.push('HTML-looking fence content cannot inject script or event handlers');
    }
    const csp = await preview.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'nonce-/);
    assert.doesNotMatch(csp, /unsafe-eval|wasm-unsafe-eval/);
    assert.match(csp, /img-src[^;]*data:/);
    evidence.csp = csp.replace(/nonce-[^']+/g, 'nonce-REDACTED');
    evidence.checks.push('strict built-in Webview CSP retained and data images permitted');
    await verifyOrdinaryMarkdown(preview);
    evidence.checks.push('ordinary headings, emphasis, link, list, JavaScript fence and local image');
    await preview.page().screenshot({ path: path.join(artifacts, 'markdown-preview.png') });
    await replaceText(document, original);
    await document.save();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    preview = await findPreview(browser);
    preview = await waitFor(preview, expectedTrust ? imagesReady : () => document.querySelectorAll('.textgraph-preview[data-state="untrusted"]').length === 2, 'preview reopen lifecycle', 90000);
    evidence.checks.push('closing and reopening Markdown Preview remains functional');
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
    console.log('Verified installed VSIX: ' + JSON.stringify(evidence));
  } catch (error) {
    evidence.error = error.stack || String(error);
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
    if (browser) {
      for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
        await page.screenshot({ path: path.join(artifacts, 'failure-' + index + '.png') }).catch(() => {});
      }
    }
    throw error;
  } finally {
    // Disconnect the CDP client; the extension test host owns product shutdown.
    await browser?.close();
  }
};

async function verifyOrdinaryMarkdown(frame) {
  assert.equal(await frame.locator('h1').textContent(), 'Ordinary Markdown survives');
  assert.equal(await frame.locator('strong').textContent(), 'bold');
  assert.equal(await frame.locator('a[href="https://example.com"]').count(), 1);
  assert.equal(await frame.locator('li').count(), 2);
  assert.match(await frame.locator('pre code.language-javascript').textContent(), /ordinaryCode = 42/);
  await waitFor(frame, () => {
    const image = document.querySelector('img[alt="Ordinary local image"]');
    return image?.complete && image.naturalWidth > 0;
  }, 'normal Markdown local image');
}

async function getImages(frame) {
  return frame.locator('.textgraph-preview[data-state="ready"] img').evaluateAll(images => images.map(image => image.src));
}

function verifyPngs(images) {
  for (const image of images) {
    assert.match(image, /^data:image\/png;base64,/);
    const decoded = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
    assert.ok(decoded.width > 1 && decoded.height > 1);
    assert.ok(new Set(decoded.data).size > 2, 'PNG must contain actual diagram pixels');
  }
}

function imagesReady() {
  const containers = [...document.querySelectorAll('.textgraph-preview')];
  return containers.length === 2 && containers.every(container => {
    const image = container.querySelector('img');
    return container.dataset.state === 'ready' && image?.complete && image.naturalWidth > 0;
  });
}

async function replaceText(document, text) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  assert.equal(await vscode.workspace.applyEdit(edit), true);
}

async function findPreview(browser) {
  return retry(async () => {
    for (const page of browser.contexts().flatMap(context => context.pages())) {
      for (const frame of page.frames()) {
        if (await frame.locator('.markdown-body').count().catch(() => 0)) return frame;
      }
    }
    throw new Error('No real Markdown Preview webview frame found');
  }, 30000, 'find Markdown Preview');
}

async function waitFor(frame, predicate, label, timeout = 30000, argument) {
  const end = Date.now() + timeout;
  let last;
  // The official refresh command reloads the webview, replacing its inner frame.
  // Reacquire it rather than accidentally asserting against detached HTML.
  while (Date.now() < end) {
    try {
      if (frame.isDetached()) frame = await findPreview(activeBrowser);
      if (await frame.evaluate(predicate, argument)) return frame;
    } catch (error) {
      last = error;
      if (frame.isDetached()) frame = await findPreview(activeBrowser);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const states = await frame.locator('.textgraph-preview').evaluateAll(elements => elements.map(element => ({ state: element.dataset.state, text: element.textContent }))).catch(() => []);
  throw new Error(label + ': timed out; ' + (last?.message || '') + '; preview states=' + JSON.stringify(states));
}

async function retry(action, timeout, label) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { return await action(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label + ': ' + last?.message, { cause: last });
}
