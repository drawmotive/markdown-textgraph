export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Density affects sharpness; native logical dimensions survive a raster cap. */
function renderPngImage(result, { scale, src, className = '' }) {
  const displayWidth = result.displayWidth ?? result.width / scale;
  const displayHeight = result.displayHeight ?? result.height / scale;
  const width = Number.isFinite(displayWidth) ? ' width="' + escapeHtml(displayWidth) + '"' : '';
  const height = Number.isFinite(displayHeight) ? ' height="' + escapeHtml(displayHeight) + '"' : '';
  const classes = className ? ' class="' + className + '"' : '';
  return '<img' + classes + ' style="max-width:100%;height:auto" src="' + escapeHtml(src) +
    '" alt="TextGraph diagram"' + width + height + '>';
}

/** A host can supply a native pair; plain Markdown keeps one self-contained image. */
export function renderPngFigure(result, { scale = 1, src = 'data:image/png;base64,' + result.png, darkSrc, darkResult } = {}) {
  const light = renderPngImage(result, { scale, src, className: darkSrc ? 'textgraph-light' : '' });
  const dark = darkSrc ? renderPngImage(darkResult, { scale, src: darkSrc, className: 'textgraph-dark' }) : '';
  return '<figure v-pre class="textgraph">' + light + dark + '</figure>';
}

export function renderErrorFigure(source, diagnostics) {
  const items = diagnostics.map(diagnostic =>
    '<li data-code="' + escapeHtml(diagnostic.code) + '">' + escapeHtml(diagnostic.message) + '</li>',
  ).join('');
  return '<figure v-pre class="textgraph textgraph-error">' +
    '<pre><code>' + escapeHtml(source) + '</code></pre>' +
    '<figcaption><ul>' + items + '</ul></figcaption></figure>';
}
