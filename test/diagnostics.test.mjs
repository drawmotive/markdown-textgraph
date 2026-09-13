import assert from 'node:assert/strict';
import test from 'node:test';
import MarkdownIt from 'markdown-it';
import { createMarkdownSession } from '../src/markdown.js';
import { createRenderer } from './support/renderer.mjs';

const fence = String.fromCharCode(96).repeat(3);

function fenced(source) {
  return fence + 'textgraph\n' + source + '\n' + fence;
}

function diagnostic(overrides = {}) {
  return {
    code: 'TG_PARSE_ERROR', severity: 'error', stage: 'parse',
    message: 'Invalid diagram', location: { line: 0, column: 0 }, ...overrides,
  };
}

function failingRenderer(diagnostics) {
  return createRenderer(async () => ({ success: false, diagnostics }));
}

test('maps zero-based SDK position to a verified document line', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic({ message: '<script>bad()</script>' })]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  const html = await session.render(md, '# Title\n\n' + fenced('A ->'), { path: 'guide.md' });
  assert.deepEqual(reported[0].documentLocation, { line: 3, column: 0 });
  assert.equal(reported[0].file, 'guide.md');
  assert.equal(reported[0].blockIndex, 0);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  await session.dispose();
});

test('verifies CRLF, blockquote, list, and UTF-16 source positions', async () => {
  const cases = [
    ['CRLF', 'heading\r\n\r\n' + fence + 'textgraph\r\nA -> B\r\n' + fence, { line: 0, column: 1 }, { line: 3, column: 1 }],
    ['blockquote prefix', '> ' + fence + 'textgraph\n> A -> B\n> ' + fence, { line: 0, column: 1 }, { line: 1, column: 3 }],
    ['list indentation', '- item\n\n  ' + fence + 'textgraph\n  A -> B\n  ' + fence, { line: 0, column: 1 }, { line: 3, column: 3 }],
    ['UTF-16 column', fenced('😀 bad'), { line: 0, column: 2 }, { line: 1, column: 2 }],
  ];
  for (const [name, source, location, expected] of cases) {
    const reported = [];
    const fake = failingRenderer([diagnostic({ location })]);
    const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
    const md = new MarkdownIt().use(session.markdownIt);
    await session.render(md, source);
    assert.deepEqual(reported[0].documentLocation, expected, name);
    await session.dispose();
  }
});

test('keeps a verified physical line but omits a column after tab expansion', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic({ location: { line: 0, column: 1 } })]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  const source = '- item\n\n  ' + fence + 'textgraph\n\tA -> B\n  ' + fence;
  await session.render(md, source);
  assert.deepEqual(reported[0].documentLocation, { line: 3 });
  await session.dispose();
});

test('reports only source locations that can be verified', async () => {
  const diagnostics = [
    diagnostic({ message: 'unknown', location: undefined }),
    diagnostic({ message: 'known line', location: { line: 0 } }),
    diagnostic({ message: 'outside block', location: { line: 4, column: 0 } }),
  ];
  const reported = [];
  const fake = failingRenderer(diagnostics);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  await session.render(md, fenced('A ->'));
  assert.equal(reported[0].documentLocation, undefined);
  assert.deepEqual(reported[1].documentLocation, { line: 1 });
  assert.equal(reported[2].documentLocation, undefined);
  await session.dispose();
});

test('does not map a diagnostic into the closing fence of an empty block', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  await session.render(md, fenced(''));
  assert.equal(reported[0].documentLocation, undefined);
  await session.dispose();
});

test('does not map compact closed or unclosed empty fences', async () => {
  for (const source of [fence + 'textgraph\n' + fence, fence + 'textgraph']) {
    const reported = [];
    const fake = failingRenderer([diagnostic()]);
    const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
    const md = new MarkdownIt().use(session.markdownIt);
    await session.render(md, source);
    assert.equal(reported[0].documentLocation, undefined);
    await session.dispose();
  }
});

test('omits document position when host preprocessing breaks source provenance', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt();
  md.renderAsync = async function renderAsync(_source, env) { return this.render(fenced('included source'), env); };
  md.use(session.markdownIt);
  await md.renderAsync('<!-- @include: ./diagram.md -->', { path: 'page.md' });
  assert.equal(reported[0].documentLocation, undefined);
  assert.equal(reported[0].file, 'page.md');
  await session.dispose();
});

test('omits document position when an opaque host prepends parser input', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt();
  md.renderAsync = async function renderAsync(source, env) {
    return this.render('padding\n' + source, env);
  };
  md.use(session.markdownIt);
  await md.renderAsync(fenced('A ->'), { path: 'page.md' });
  assert.equal(reported[0].documentLocation, undefined);
  await session.dispose();
});

test('omits document position when includes are present even if expanded bytes match', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt();
  md.renderAsync = async function renderAsync(source, env) {
    env.src = source;
    env.content = source;
    env.includes = ['/diagram.md'];
    return this.render(source, env);
  };
  md.use(session.markdownIt);
  await md.renderAsync(fenced('A ->'), { path: 'page.md' });
  assert.equal(reported[0].documentLocation, undefined);
  await session.dispose();
});

test('maps through verified frontmatter stripping and prefers realPath file identity', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt();
  md.renderAsync = async function renderAsync(source, env) {
    env.src = source;
    env.content = source.slice(source.indexOf('---\n', 4) + 4);
    return this.render(env.content, env);
  };
  md.use(session.markdownIt);
  const source = '---\ntitle: Guide\n---\n' + fenced('A ->');
  await md.renderAsync(source, { path: 'generated.md', realPath: 'guide.md' });

  assert.equal(reported[0].file, 'guide.md');
  assert.deepEqual(reported[0].documentLocation, { line: 4, column: 0 });
  await session.dispose();
});

test('reads the error mode when a render result is processed', async () => {
  let mode = 'inline';
  const fake = failingRenderer([diagnostic()]);
  const options = { get errorMode() { return mode; } };
  const session = createMarkdownSession(fake.renderer, options);
  const md = new MarkdownIt().use(session.markdownIt);

  assert.match(await session.render(md, fenced('first')), /textgraph-error/);
  mode = 'throw';
  await assert.rejects(session.render(md, fenced('second')), /TextGraph block 1 failed/);
  await session.dispose();
});

test('maps diagnostics separately for duplicate blocks rendered once', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  await session.render(md, fenced('A ->') + '\n\n' + fenced('A ->'), { path: 'duplicates.md' });
  assert.deepEqual(fake.calls, ['A ->\n']);
  assert.deepEqual(reported.map(item => item.blockIndex), [0, 1]);
  assert.deepEqual(reported.map(item => item.documentLocation), [{ line: 1, column: 0 }, { line: 5, column: 0 }]);
  await session.dispose();
});

test('inline errors escape source, diagnostics, and attributes inside a v-pre region', async () => {
  const unsafe = diagnostic({
    code: '" onmouseover="alert(1)',
    message: "<img src=x onerror=alert(1)> {{constructor}} 'quoted'",
  });
  const fake = failingRenderer([unsafe]);
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const html = await session.render(md, fenced('<script>{{danger}}</script> & "quote"'));
  assert.match(html, /<figure v-pre class="textgraph textgraph-error">/);
  assert.match(html, /&lt;script&gt;\{\{danger\}\}&lt;\/script&gt; &amp; &quot;quote&quot;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; \{\{constructor\}\} &#39;quoted&#39;/);
  assert.match(html, /data-code="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /<script>|<img/);
  await session.dispose();
});

test('inserts dollar replacement patterns as literal escaped error content', async () => {
  const replacementPatterns = 'cost $& | $' + String.fromCharCode(96) + " | $' | $$";
  const fake = failingRenderer([diagnostic({ message: replacementPatterns })]);
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const html = await session.render(md, fenced(replacementPatterns));
  const escaped = 'cost $&amp; | $' + String.fromCharCode(96) + ' | $&#39; | $$';
  assert.equal(html.includes('<code>' + escaped + '\n</code>'), true);
  assert.equal(html.includes('>' + escaped + '</li>'), true);
  assert.doesNotMatch(html, /textgraph-placeholder/);
  await session.dispose();
});

test('throw mode rejects ordinary diagram failures with file, block, and diagnostics', async () => {
  const parseError = diagnostic({ code: 'TG_PARSE_ERROR', message: 'Expected node' });
  const fake = failingRenderer([parseError]);
  const session = createMarkdownSession(fake.renderer, { errorMode: 'throw' });
  const md = new MarkdownIt().use(session.markdownIt);
  await assert.rejects(session.render(md, fenced('A ->'), { path: 'broken.md' }), error => {
    assert.match(error.message, /broken\.md/);
    assert.match(error.message, /block 1/);
    assert.match(error.message, /TG_PARSE_ERROR: Expected node/);
    assert.deepEqual(error.diagnostics, [parseError]);
    return true;
  });
  await session.dispose();
});

test('throw mode reports every duplicate block before throwing the first build error', async () => {
  const reported = [];
  const fake = failingRenderer([diagnostic()]);
  const session = createMarkdownSession(fake.renderer, {
    errorMode: 'throw',
    onDiagnostic: value => reported.push(value),
  });
  const md = new MarkdownIt().use(session.markdownIt);
  await assert.rejects(session.render(md, fenced('A ->') + '\n\n' + fenced('A ->')));
  assert.deepEqual(fake.calls, ['A ->\n']);
  assert.deepEqual(reported.map(item => item.blockIndex), [0, 1]);
  await session.dispose();
});

test('reports warnings from successful renders and still emits the image', async () => {
  const warning = diagnostic({ code: 'TG_PARSE_WARNING', severity: 'warning', message: 'Deprecated syntax' });
  const reported = [];
  const fake = createRenderer(async () => ({ success: true, png: 'cG5n', width: 4, height: 2, diagnostics: [warning] }));
  const session = createMarkdownSession(fake.renderer, { onDiagnostic: value => reported.push(value) });
  const md = new MarkdownIt().use(session.markdownIt);
  const html = await session.render(md, fenced('A -> B'));
  assert.match(html, /data:image\/png;base64,cG5n/);
  assert.equal(reported[0].diagnostic, warning);
  await session.dispose();
});

test('propagates renderer faults with their original code and identity', async () => {
  const failure = Object.assign(new Error('runtime unavailable'), { code: 'TG_RUNTIME_ERROR' });
  const fake = createRenderer(async () => { throw failure; });
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  await assert.rejects(session.render(md, fenced('A -> B')), error => error === failure && error.code === 'TG_RUNTIME_ERROR');
  await session.dispose();
});
