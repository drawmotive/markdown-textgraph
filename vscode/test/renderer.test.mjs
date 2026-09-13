import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { PNG } from 'pngjs';
import { Renderer } from '../src/renderer.cjs';

class FakeWorker extends EventEmitter {
  requests = [];
  terminated = false;
  postMessage(message) { this.requests.push(message); }
  async terminate() { this.terminated = true; this.emit('exit', 1); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('one native VM serializes jobs and recovers after timeout by terminating the old VM', async () => {
  const workers = [];
  const r = new Renderer({ startWorker: () => { const w = new FakeWorker(); workers.push(w); return w; }, timeoutMs: 40 });
  const first = assert.rejects(r.render('hang'), { code: 'TG_RENDER_TIMEOUT' });
  const second = r.render('valid');
  assert.equal(workers.length, 1);
  assert.equal(workers[0].requests.length, 1);
  await first; await tick();
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  workers[0].emit('message', { result: 'stale' });
  workers[1].emit('message', { result: 'fresh' });
  assert.equal(await second, 'fresh');
  await r.dispose();
});

test('abort cancels queued work, terminates active work, and disposal rejects new jobs', async () => {
  const w = new FakeWorker();
  const r = new Renderer({ startWorker: () => w });
  const a = new AbortController(), b = new AbortController();
  const first = assert.rejects(r.render('A', a.signal), /cancelled/);
  const second = assert.rejects(r.render('B', b.signal), /cancelled/);
  b.abort(); a.abort();
  await Promise.all([first, second]);
  assert.equal(w.requests.length, 1);
  assert.equal(w.terminated, true);
  await r.dispose();
  await assert.rejects(r.render('C'), /cancelled/);
});

test('idle native VM is released and worker crashes reject the active request', async () => {
  const workers = [];
  const r = new Renderer({ startWorker: () => { const w = new FakeWorker(); workers.push(w); return w; }, idleMs: 1 });
  const first = r.render('A'); workers[0].emit('message', { result: true });
  await first; await tick();
  assert.equal(workers[0].terminated, true);
  const second = assert.rejects(r.render('B'), /crashed/);
  workers[1].emit('error', new Error('crashed'));
  await second;
  await r.dispose();
});

test('public npm SDK renders inline groups and recovers after syntax diagnostics', { timeout: 60000 }, async () => {
  const r = new Renderer({ startWorker: () => new Worker(new URL('../src/render-worker.mjs', import.meta.url)), timeoutMs: 8000 });
  try {
    const first = await r.render('A -> B');
    assert.equal(first.success, true);
    const image = PNG.sync.read(Buffer.from(first.png, 'base64'));
    assert.ok(image.width > 0 && new Set(image.data).size > 2);
    assert.equal((await r.render('A ->')).success, false);
    for (const source of ['A -> {}', 'A -> {{x}}']) {
      const group = await r.render(source);
      assert.equal(group.success, true, JSON.stringify(group.diagnostics));
      const png = PNG.sync.read(Buffer.from(group.png, 'base64'));
      assert.ok(png.width > 0 && new Set(png.data).size > 2);
    }
    assert.equal((await r.render('A -> {}}')).success, false);
    const recovered = await r.render('C -> D');
    assert.equal(recovered.success, true);
    assert.notEqual(recovered.png, first.png);
  } finally { await r.dispose(); }
});
