import assert from 'node:assert/strict';
import test from 'node:test';
import MarkdownIt from 'markdown-it';
import { createMarkdownSession } from '../src/markdown.js';
import { createRenderer, deferred } from './support/renderer.mjs';

test('HTML preserves logical size when raster width is clamped', async () => {
  const fake = createRenderer(() => ({ success: true, png: 'cG5n', width: 200, height: 100,
    displayWidth: 800, displayHeight: 400, diagnostics: [] }));
  const session = createMarkdownSession(fake.renderer, { render: { scale: 2 } });
  const md = new MarkdownIt().use(session.markdownIt);
  try {
    const html = await session.render(md, '~~~textgraph\nA -> B\n~~~');
    assert.match(html, /width="800" height="400"/);
  } finally { await session.dispose(); }
});

test('HTML defaults to scale one when legacy SDK results omit logical dimensions', async () => {
  const fake = createRenderer(() => ({ success: true, png: 'cG5n', width: 800, height: 400, diagnostics: [] }));
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  try {
    const html = await session.render(md, '~~~textgraph\nA -> B\n~~~');
    assert.match(html, /width="800" height="400"/);
  } finally { await session.dispose(); }
});

test('async render resolves TextGraph blocks while sync render delegates every fence', async () => {
  const fake = createRenderer();
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt();
  md.use(session.markdownIt);
  const source = [
    '```textgraph',
    'A -> B',
    '```',
    '',
    '~~~textgraph ignored-info',
    'B -> C',
    '~~~',
    '',
    '```js',
    'x()',
    '```',
  ].join('\n');

  const synchronous = md.render(source);
  assert.match(synchronous, /language-textgraph/);
  assert.match(synchronous, /language-js/);
  assert.deepEqual(fake.calls, []);

  const html = await session.render(md, source);
  assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 2);
  assert.match(html, /language-js/);
  assert.deepEqual(fake.calls, ['A -> B\n', 'B -> C\n']);
  await session.dispose();
});

test('recognizes nested and empty exact lowercase TextGraph fences only', async () => {
  const fake = createRenderer();
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt();
  md.use(session.markdownIt);
  const source = [
    '> ```textgraph',
    '> Q -> R',
    '> ```',
    '',
    '- item',
    '',
    '  ```textgraph',
    '  L -> M',
    '  ```',
    '',
    '```textgraph',
    '```',
    '',
    '```textgraphx',
    'ignored',
    '```',
    '',
    '```TextGraph',
    'ignored too',
    '```',
  ].join('\n');

  const html = await session.render(md, source);

  assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 3);
  assert.deepEqual(fake.calls, ['Q -> R\n', 'L -> M\n', '']);
  assert.match(html, /language-textgraphx/);
  assert.match(html, /language-TextGraph/);
  await session.dispose();
});

test('renders duplicate source once per call and replaces each block marker', async () => {
  const fake = createRenderer();
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const source = '```textgraph\nA -> B\n```\n\n```textgraph\nA -> B\n```';

  const html = await session.render(md, source);

  assert.deepEqual(fake.calls, ['A -> B\n']);
  assert.equal((html.match(/<figure/g) ?? []).length, 2);
  assert.doesNotMatch(html, /textgraph-placeholder/);
  await session.dispose();
});

test('isolates overlapping renders with different env objects', async () => {
  const gates = new Map();
  const fake = createRenderer(async source => {
    const gate = deferred();
    gates.set(source, gate);
    await gate.promise;
    return {
      success: true,
      png: Buffer.from(source).toString('base64'),
      width: 1,
      height: 1,
      diagnostics: [],
    };
  });
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);

  const first = session.render(md, '```textgraph\nfirst\n```', { path: 'first.md' });
  const second = session.render(md, '```textgraph\nsecond\n```', { path: 'second.md' });
  await new Promise(resolve => setImmediate(resolve));
  gates.get('second\n').resolve();
  gates.get('first\n').resolve();
  const [firstHtml, secondHtml] = await Promise.all([first, second]);

  assert.match(firstHtml, new RegExp(Buffer.from('first\n').toString('base64')));
  assert.doesNotMatch(firstHtml, new RegExp(Buffer.from('second\n').toString('base64')));
  assert.match(secondHtml, new RegExp(Buffer.from('second\n').toString('base64')));
  await session.dispose();
});

test('rejects overlapping use of the same env and restores it after failures', async () => {
  const gate = deferred();
  const fake = createRenderer(async () => {
    await gate.promise;
    return { success: true, png: 'cG5n', width: 1, height: 1, diagnostics: [] };
  });
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const env = { path: 'same.md' };
  const first = session.render(md, '```textgraph\nfirst\n```', env);

  await assert.rejects(
    session.render(md, '```textgraph\nsecond\n```', env),
    /already being rendered/,
  );
  gate.resolve();
  await first;

  md.renderAsync = async () => {
    throw new Error('host failed');
  };
  const failingSession = createMarkdownSession(createRenderer().renderer);
  const failingMd = new MarkdownIt();
  failingMd.renderAsync = md.renderAsync;
  failingMd.use(failingSession.markdownIt);
  await assert.rejects(failingMd.renderAsync('text', env), /host failed/);
  await assert.rejects(failingMd.renderAsync('text', env), /host failed/);

  await session.dispose();
  await failingSession.dispose();
});

test('wraps an existing renderAsync once and preserves host env mutations', async () => {
  const fake = createRenderer();
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt();
  let hostCalls = 0;
  md.renderAsync = async function renderAsync(source, env) {
    hostCalls += 1;
    env.hostMetadata = `render-${hostCalls}`;
    await Promise.resolve();
    return this.render(source, env);
  };
  md.use(session.markdownIt);
  md.use(session.markdownIt);
  const env = {};

  const direct = await md.renderAsync('```textgraph\nA -> B\n```', env);
  const throughSession = await session.render(md, '```textgraph\nC -> D\n```', env);

  assert.match(direct, /data:image\/png;base64,/);
  assert.match(throughSession, /data:image\/png;base64,/);
  assert.equal(hostCalls, 2);
  assert.equal(env.hostMetadata, 'render-2');
  assert.deepEqual(fake.calls, ['A -> B\n', 'C -> D\n']);
  await session.dispose();
});

test('keeps private render context out of env copies made by host plugins', async () => {
  const fake = createRenderer();
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt();
  md.renderAsync = async function renderAsync(source, env) {
    this.render('~~~textgraph\nexcerpt\n~~~', { ...env });
    return this.render(source, env);
  };
  md.use(session.markdownIt);

  const html = await md.renderAsync('~~~textgraph\npage\n~~~', {});

  assert.match(html, /data:image\/png;base64,/);
  assert.deepEqual(fake.calls, ['page\n']);
  await session.dispose();
});

test('prevents a second session from replacing an installed fence adapter', async () => {
  const first = createMarkdownSession(createRenderer().renderer);
  const second = createMarkdownSession(createRenderer().renderer);
  const md = new MarkdownIt().use(first.markdownIt);

  assert.throws(() => md.use(second.markdownIt), /different TextGraph session/);

  await first.dispose();
  await second.dispose();
});

test('dispose is idempotent, drains accepted work, and rejects new work', async () => {
  const gate = deferred();
  const fake = createRenderer(async () => {
    await gate.promise;
    return { success: true, png: 'cG5n', width: 1, height: 1, diagnostics: [] };
  });
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const render = session.render(md, '```textgraph\nA -> B\n```');
  const firstDispose = session.dispose();
  const secondDispose = session.dispose();

  assert.strictEqual(firstDispose, secondDispose);
  await assert.rejects(session.render(md, 'plain'), /disposing or disposed/);
  assert.equal(fake.disposeCount, 0);
  gate.resolve();
  await render;
  await firstDispose;
  assert.equal(fake.disposeCount, 1);
});

test('waits for every accepted renderer job before disposal when one job fails', async () => {
  const secondGate = deferred();
  const firstFailure = new Error('first failed');
  const fake = createRenderer(async source => {
    if (source === 'first\n') throw firstFailure;
    await secondGate.promise;
    return { success: true, png: 'cG5n', width: 1, height: 1, diagnostics: [] };
  });
  const session = createMarkdownSession(fake.renderer);
  const md = new MarkdownIt().use(session.markdownIt);
  const render = session.render(md, [
    '~~~textgraph', 'first', '~~~', '',
    '~~~textgraph', 'second', '~~~',
  ].join('\n'));
  const rejection = assert.rejects(render, error => error === firstFailure);
  await new Promise(resolve => setImmediate(resolve));
  const disposal = session.dispose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.disposeCount, 0);
  secondGate.resolve();
  await rejection;
  await disposal;
  assert.equal(fake.disposeCount, 1);
});
