const { createHash } = require('node:crypto');

const installed = Symbol('textgraph.preview');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const sourceFigure = (state, source, message) => `<figure class="textgraph-preview" data-state="${state}"><pre><code>${escapeHtml(source)}</code></pre><figcaption>${escapeHtml(message)}</figcaption></figure>\n`;

/** Adapts synchronous Markdown rendering to asynchronous native results. A
 * document render owns exactly the sources it saw; completion only invalidates
 * the preview if that ownership still holds, so old edits cannot win races. */
class Preview {
  constructor({ renderer, refresh, isTrusted, now = Date.now }) {
    this.renderer = renderer;
    this.refresh = refresh;
    this.isTrusted = isTrusted;
    this.now = now;
    this.documents = new Map();
  }

  extendMarkdownIt(md) {
    if (md[installed]) return md;
    md[installed] = true;
    const originalRender = md.renderer.render;
    const originalFence = md.renderer.rules.fence;
    const contexts = [];
    const session = this;
    // VS Code caches parsed tokens. Capture at renderer.render, not a parser
    // core rule, so each preview refresh still reconciles document ownership.
    md.renderer.render = function (tokens, options, env = {}) {
      const key = env.currentDocument?.toString() ?? '<markdown-string>';
      let document = session.documents.get(key);
      if (!document) {
        document = { entries: new Map() };
        session.documents.set(key, document);
      }
      document.lastUsed = session.now();
      const context = { document, seen: new Set() };
      contexts.push(context);
      try { return originalRender.call(this, tokens, options, env); }
      finally {
        contexts.pop();
        for (const [source, entry] of document.entries) {
          if (!context.seen.has(source)) { document.entries.delete(source); entry.abort.abort(); }
        }
        if (!document.entries.size) session.documents.delete(key);
      }
    };
    md.renderer.rules.fence = function (tokens, index, options, env, self) {
      const token = tokens[index];
      const context = contexts.at(-1);
      if (!context || token.info.trim().split(/\s/, 1)[0] !== 'textgraph') {
        return originalFence.call(this, tokens, index, options, env, self);
      }
      // Restricted Mode never parses source in the SDK or starts a native VM.
      if (!session.isTrusted()) return sourceFigure('untrusted', token.content, 'Trust this workspace to render TextGraph diagrams.');
      if (session.disposed) return sourceFigure('error', token.content, 'TextGraph preview is closed.');
      return session.figure(context, token.content, token.map?.[0]);
    };
    return md;
  }

  figure({ document, seen }, source, line) {
    seen.add(source);
    let entry = document.entries.get(source);
    if (!entry) {
      entry = { state: 'loading', abort: new AbortController() };
      document.entries.set(source, entry);
      // Bound individual Markdown input independently of its grammar. The SDK
      // is the only TextGraph parser; no source is rewritten or pre-parsed.
      const work = Buffer.byteLength(source) > 65536
        ? Promise.reject(new Error('TextGraph diagram exceeds the 64 KiB preview input limit.'))
        : this.renderer.render(source, entry.abort.signal);
      work.then(result => {
        if (!result.success) {
          entry.state = 'error';
          entry.message = (result.diagnostics ?? []).map(d => `${d.code}: ${d.message}`).join('\n') || 'TextGraph rendering failed.';
        } else {
          entry.state = 'ready';
          entry.png = result.png;
          entry.width = result.width;
          entry.height = result.height;
        }
      }, error => { entry.state = 'error'; entry.message = `${error.code ? `${error.code}: ` : ''}${error.message}`; }).then(() => {
        if (!this.disposed && document.entries.get(source) === entry && !entry.abort.signal.aborted) this.scheduleRefresh();
      });
    }
    const marker = Number.isInteger(line) ? ` class="code-line textgraph-preview" data-line="${line}"` : ' class="textgraph-preview"';
    if (entry.state === 'ready') {
      const dimensions = Number.isFinite(entry.width) && Number.isFinite(entry.height) ? ` width="${entry.width}" height="${entry.height}"` : '';
      // PNG data URIs are allowed by Markdown Preview's strict CSP. No webview
      // scripts, temporary files, remote requests, or private resource API.
      return `<figure${marker} data-state="ready" data-source="${createHash('sha256').update(source).digest('hex')}"><img src="data:image/png;base64,${escapeHtml(entry.png)}" alt="TextGraph diagram"${dimensions}></figure>\n`;
    }
    return sourceFigure(entry.state, source, entry.message ?? 'Rendering TextGraph…').replace(' class="textgraph-preview"', marker);
  }

  scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      if (!this.disposed) Promise.resolve(this.refresh()).catch(() => {});
    }, 50);
  }

  close(key) {
    const document = this.documents.get(key);
    this.documents.delete(key);
    for (const entry of document?.entries.values() ?? []) entry.abort.abort();
    document?.entries.clear();
  }

  prune() {
    // The Markdown extension exposes no preview-close event. Release retained
    // PNGs for inactive previews even when their source editor remains open.
    for (const [key, document] of this.documents) if (this.now() - document.lastUsed > 300000) this.close(key);
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    for (const key of this.documents.keys()) this.close(key);
    await this.renderer.dispose();
  }
}

module.exports = { Preview };
