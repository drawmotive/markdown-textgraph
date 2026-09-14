export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Density affects sharpness; native display dimensions retain size after a raster cap. */
export function renderPngFigure(result, { scale = 1, src = 'data:image/png;base64,' + result.png } = {}) {
  const displayWidth = result.displayWidth ?? result.width / scale;
  const displayHeight = result.displayHeight ?? result.height / scale;
  const width = Number.isFinite(displayWidth) ? ' width="' + escapeHtml(displayWidth) + '"' : '';
  const height = Number.isFinite(displayHeight) ? ' height="' + escapeHtml(displayHeight) + '"' : '';
  return '<figure v-pre class="textgraph"><img style="max-width:100%;height:auto" src="' + escapeHtml(src) + '" alt="TextGraph diagram"' + width + height + '></figure>';
}

export function renderErrorFigure(source, diagnostics) {
  const items = diagnostics.map(diagnostic =>
    '<li data-code="' + escapeHtml(diagnostic.code) + '">' + escapeHtml(diagnostic.message) + '</li>',
  ).join('');
  return '<figure v-pre class="textgraph textgraph-error">' +
    '<pre><code>' + escapeHtml(source) + '</code></pre>' +
    '<figcaption><ul>' + items + '</ul></figcaption></figure>';
}
