const { Worker } = require('node:worker_threads');
const path = require('node:path');

/** Serial, cancellable ownership of a native VM. A deadline is an operational
 * failure, never a claim that the source is invalid. Worker termination also
 * interrupts native code, unlike a Promise race around an SDK invocation. */
class Renderer {
  constructor({ startWorker = () => new Worker(path.join(__dirname, 'render-worker.mjs')), timeoutMs = 15000, idleMs = 10000 } = {}) {
    this.startWorker = startWorker;
    this.timeoutMs = timeoutMs;
    this.idleMs = idleMs;
    this.queue = [];
    this.terminations = new Set();
  }

  render(source, signal) {
    return new Promise((resolve, reject) => {
      if (this.disposed || signal?.aborted) { reject(new Error('TextGraph rendering cancelled')); return; }
      const job = { source, resolve, reject, signal };
      job.abort = () => {
        if (this.active === job) this.finish(new Error('TextGraph rendering cancelled'), undefined, true);
        else {
          this.queue = this.queue.filter(item => item !== job);
          this.settle(job, new Error('TextGraph rendering cancelled'));
        }
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  settle(job, error, result) {
    job.signal?.removeEventListener('abort', job.abort);
    if (error) job.reject(error); else job.resolve(result);
  }

  stopWorker() {
    const worker = this.worker;
    this.worker = undefined;
    clearTimeout(this.idleTimer);
    if (!worker) return;
    // Wait for the old VM to actually stop before allocating another VM.
    const stopping = worker.terminate().catch(() => {}).finally(() => {
      this.terminations.delete(stopping);
      this.pump();
    });
    this.terminations.add(stopping);
  }

  finish(error, result, terminate = false) {
    const job = this.active;
    if (!job) return;
    this.active = undefined;
    clearTimeout(this.deadline);
    if (terminate) this.stopWorker();
    this.settle(job, error, result);
    this.pump();
  }

  pump() {
    if (this.disposed || this.active || this.terminations.size) return;
    clearTimeout(this.idleTimer);
    if (!this.queue.length) {
      if (this.worker) this.idleTimer = setTimeout(() => this.stopWorker(), this.idleMs);
      this.idleTimer?.unref();
      return;
    }
    this.active = this.queue.shift();
    try {
      if (!this.worker) {
        const worker = this.worker = this.startWorker();
        worker.on('message', message => {
          if (this.worker !== worker) return;
          this.finish(message.error && Object.assign(new Error(message.error.message), { code: message.error.code }), message.result, !!message.error);
        });
        worker.on('error', error => { if (this.worker === worker) this.finish(error, undefined, true); });
        worker.on('exit', code => {
          if (this.worker !== worker) return;
          this.worker = undefined;
          this.finish(new Error(`TextGraph renderer exited (${code})`));
        });
      }
      this.deadline = setTimeout(() => this.finish(Object.assign(new Error('TextGraph rendering exceeded 15 seconds. The renderer was stopped. Edit the diagram to try again.'), { code: 'TG_RENDER_TIMEOUT' }), undefined, true), this.timeoutMs);
      this.worker.postMessage({ source: this.active.source });
    } catch (error) { this.finish(error, undefined, true); }
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.deadline);
    clearTimeout(this.idleTimer);
    if (this.active) { this.settle(this.active, new Error('TextGraph renderer disposed')); this.active = undefined; }
    for (const job of this.queue.splice(0)) this.settle(job, new Error('TextGraph renderer disposed'));
    this.stopWorker();
    await Promise.all(this.terminations);
  }
}

module.exports = { Renderer };
