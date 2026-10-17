const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

/** Evidence hashes the input displayed by the host, after proving it is canonical. */
function captureSourceHash(markdown, source) {
  const fences = [...markdown.matchAll(/^```textgraph\r?\n([\s\S]*?)^```[ \t]*\r?$/gm)];
  assert.equal(fences.length, 1, 'Capture Markdown must contain one TextGraph fence');
  assert.equal(fences[0][1], source, 'Capture Markdown must show the canonical source');
  return createHash('sha256').update(fences[0][1]).digest('hex');
}

/** Runs in the actual preview frame; an earlier decoded image is not readiness. */
function capturePreviewReady({ sourceHash }) {
  const figures = [...document.querySelectorAll('.textgraph-preview')];
  const image = figures[0]?.querySelector('img');
  return figures.length === 1 && figures[0].dataset.state === 'ready'
    && figures[0].dataset.source === sourceHash && image?.complete === true && image.naturalWidth > 1;
}

module.exports = { captureSourceHash, capturePreviewReady };
