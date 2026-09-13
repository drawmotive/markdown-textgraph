import assert from 'node:assert/strict';
import test from 'node:test';
import MarkdownIt from 'markdown-it';
import { Preview } from '../src/preview.cjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 80));
const fence = source => '```textgraph\n' + source + '\n```\n';
function setup(options = {}) {
  const jobs = [];
  let refreshes = 0, disposed = false;
  const renderer = {
    render(source, signal) { return new Promise((resolve, reject) => jobs.push({ source, signal, resolve, reject })); },
    async dispose() { disposed = true; },
  };
  const preview = new Preview({ renderer, refresh: () => refreshes++, isTrusted: () => true, ...options });
  const md = preview.extendMarkdownIt(new MarkdownIt());
  const render = (source, document = 'file:///test.md') => md.render(source, { currentDocument: document });
  return { preview, md, render, jobs, get refreshes() { return refreshes; }, get disposed() { return disposed; } };
}
const png = value => ({ success: true, png: value, width: 20, height: 30 });

test('host rendering stays synchronous, ordinary Markdown delegates, identical fences share work', async () => {
  const s = setup();
  const plain = '# Heading\n\n```js\nconst x = 1\n```\n';
  assert.equal(s.render(plain), new MarkdownIt().render(plain));
  assert.equal(s.jobs.length, 0);
  const html = s.render(fence('A -> B') + fence('A -> B') + fence('C -> D'));
  assert.equal(typeof html, 'string');
  assert.equal((html.match(/data-state="loading"/g) ?? []).length, 3);
  assert.equal(s.jobs.length, 2);
  s.jobs[0].resolve(png('AA==')); s.jobs[1].resolve(png('BB=='));
  await tick();
  assert.equal(s.refreshes, 1);
  assert.equal((s.render(fence('A -> B') + fence('A -> B') + fence('C -> D')).match(/<img /g) ?? []).length, 3);
  await s.preview.dispose();
});

test('cached host tokens reconcile edits; stale completion cannot refresh or replace a new source', async () => {
  const s = setup();
  s.render(fence('Old'));
  const tokens = s.md.parse(fence('New'), {});
  const renderCached = () => s.md.renderer.render(tokens, s.md.options, { currentDocument: 'file:///test.md' });
  renderCached();
  assert.equal(s.jobs[0].signal.aborted, true);
  s.jobs[0].resolve(png('OLD'));
  await tick();
  assert.equal(s.refreshes, 0);
  s.jobs[1].resolve(png('NEW'));
  await tick();
  assert.match(renderCached(), /base64,NEW/);
  assert.equal(s.jobs.length, 2);
  await s.preview.dispose();
});

test('documents are independent and removing fences cancels their outstanding renders', async () => {
  const s = setup();
  s.render(fence('A'), 'file:///a.md');
  s.render(fence('A'), 'file:///b.md');
  s.render('No diagram', 'file:///a.md');
  assert.equal(s.jobs[0].signal.aborted, true);
  assert.equal(s.jobs[1].signal.aborted, false);
  assert.equal(s.preview.documents.size, 1);
  s.preview.close('file:///b.md');
  assert.equal(s.jobs[1].signal.aborted, true);
  assert.equal(s.preview.documents.size, 0);
  await s.preview.dispose();
});

test('SDK diagnostics and unexpected runtime errors remain escaped and recover after edit', async () => {
  const s = setup();
  const source = '<script>boom</script> ->';
  s.render(fence(source));
  s.jobs[0].resolve({ success: false, diagnostics: [{ code: 'PARSE', message: '<img src=x onerror=alert(1)>' }] });
  await tick();
  const error = s.render(fence(source));
  assert.match(error, /data-state="error"/);
  assert.match(error, /&lt;script&gt;/);
  assert.match(error, /&lt;img/);
  assert.doesNotMatch(error, /<script|<img/);
  s.render(fence('Runtime'));
  s.jobs[1].reject(Object.assign(new Error('native <failure>'), { code: 'TG_RENDER_TIMEOUT' }));
  await tick();
  assert.match(s.render(fence('Runtime')), /TG_RENDER_TIMEOUT: native &lt;failure&gt;/);
  assert.equal(s.jobs.length, 2, 'refresh does not silently retry failures');
  s.render(fence('Fixed')); s.jobs[2].resolve(png('RECOVERED'));
  await tick();
  assert.match(s.render(fence('Fixed')), /base64,RECOVERED/);
  await s.preview.dispose();
});

test('untrusted workspace never calls the SDK, and trust grant enables rendering', async () => {
  let trusted = false;
  const s = setup({ isTrusted: () => trusted });
  assert.match(s.render(fence('A -> {}')), /data-state="untrusted"/);
  assert.equal(s.jobs.length, 0);
  trusted = true;
  assert.match(s.render(fence('A -> B')), /data-state="loading"/);
  assert.equal(s.jobs.length, 1);
  await s.preview.dispose();
});

test('disposal and inactivity clear ownership and prevent late refresh', async () => {
  let time = 0;
  const s = setup({ now: () => time });
  s.render(fence('A'));
  time = 300001; s.preview.prune();
  assert.equal(s.jobs[0].signal.aborted, true);
  s.render(fence('B'));
  await s.preview.dispose();
  s.jobs[0].resolve(png('A')); s.jobs[1].resolve(png('B'));
  await tick();
  assert.equal(s.disposed, true);
  assert.equal(s.refreshes, 0);
  assert.equal(s.preview.documents.size, 0);
});

test('large input is bounded without parsing or modifying TextGraph syntax', async () => {
  const s = setup();
  const source = 'a'.repeat(65537);
  s.render(fence(source));
  await tick();
  assert.equal(s.jobs.length, 0);
  assert.match(s.render(fence(source)), /64 KiB/);
  await s.preview.dispose();
});
