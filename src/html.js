export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPngFigure(result) {
  const width = Number.isFinite(result.width) ? ' width="' + escapeHtml(result.width) + '"' : '';
  const height = Number.isFinite(result.height) ? ' height="' + escapeHtml(result.height) + '"' : '';
  return '<figure v-pre class="textgraph"><img style="max-width:100%;height:auto" src="data:image/png;base64,' + escapeHtml(result.png) + '" alt="TextGraph diagram"' + width + height + '></figure>';
}

export function renderErrorFigure(source, diagnostics) {
  const items = diagnostics.map(diagnostic =>
    '<li data-code="' + escapeHtml(diagnostic.code) + '">' + escapeHtml(diagnostic.message) + '</li>',
  ).join('');
  return '<figure v-pre class="textgraph textgraph-error">' +
    '<pre><code>' + escapeHtml(source) + '</code></pre>' +
    '<figcaption><ul>' + items + '</ul></figcaption></figure>';
}
