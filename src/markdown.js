import { randomUUID } from 'node:crypto';
import { createBuildError, createMarkdownDiagnostic } from './diagnostics.js';
import { createFenceRule, createSourceCaptureRule } from './fence.js';
import { renderErrorFigure, renderPngFigure } from './html.js';

const INSTALLATION = Symbol.for('@drawmotive/markdown-it-textgraph/installation');
const RENDER_WRAPPER = Symbol.for('@drawmotive/markdown-it-textgraph/render-wrapper');
const CONTEXT = Symbol('@drawmotive/markdown-it-textgraph/context');

export function createMarkdownSession(renderer, options = {}) {
  let state = 'active';
  let activeWork = 0;
  let drainResolve;
  let disposePromise;
  const installed = new WeakSet();

  function acceptWork(operation) {
    if (state !== 'active') {
      return Promise.reject(new Error('TextGraph Markdown session is disposing or disposed'));
    }
    activeWork += 1;
    return Promise.resolve().then(operation).finally(() => {
      activeWork -= 1;
      if (activeWork === 0 && drainResolve) {
        drainResolve();
        drainResolve = undefined;
      }
    });
  }

  async function renderWithContext(env, documentSource, hostRender) {
    if (env[CONTEXT]) {
      throw new Error('The same Markdown env is already being rendered by TextGraph');
    }
    const context = { marker: randomUUID(), tasks: [] };
    Object.defineProperty(env, CONTEXT, { configurable: true, value: context });
    try {
      let html = await hostRender();
      if (context.tasks.length === 0) return html;
      const renders = new Map();
      for (const task of context.tasks) {
        if (!renders.has(task.source)) {
          renders.set(task.source, Promise.resolve().then(() => renderer.renderPng(task.source)));
        }
      }
      const entries = [...renders];
      // A session owns the renderer lifecycle, so every accepted renderer call
      // must settle before this document releases its disposal barrier.
      const settled = await Promise.allSettled(entries.map(([, pending]) => pending));
      const firstFailure = settled.find(result => result.status === 'rejected');
      if (firstFailure) throw firstFailure.reason;
      const results = new Map(entries.map(([source], index) => [source, settled[index].value]));
      let buildError;
      for (const task of context.tasks) {
        const result = results.get(task.source);
        for (const diagnostic of result.diagnostics ?? []) {
          options.onDiagnostic?.(createMarkdownDiagnostic(task, diagnostic, documentSource, env));
        }
        if (!result.success && options.errorMode === 'throw') {
          buildError ??= createBuildError(task, result.diagnostics ?? [], documentSource, env);
        }
        const replacement = result.success
          ? renderPngFigure(result)
          : renderErrorFigure(task.source, result.diagnostics ?? []);
        html = html.replace(task.marker, () => replacement);
      }
      if (buildError) throw buildError;
      return html;
    } finally {
      delete env[CONTEXT];
    }
  }

  function markdownIt(md) {
    const owner = md[INSTALLATION];
    if (owner && owner !== session) {
      throw new Error('markdown-it already has a different TextGraph session installed');
    }
    if (owner === session || installed.has(md)) return;
    // The first session installed on a parser owns its fence and async-render
    // wrappers. Replacing either would mix task contexts between sessions.
    const originalFence = md.renderer.rules.fence.bind(md.renderer.rules);
    md.core.ruler.after('block', 'textgraph_source_context', createSourceCaptureRule(env => env?.[CONTEXT]));
    md.renderer.rules.fence = createFenceRule(originalFence, env => env?.[CONTEXT]);
    md[INSTALLATION] = session;
    installed.add(md);
    if (typeof md.renderAsync === 'function') {
      const originalRenderAsync = md.renderAsync.bind(md);
      const wrappedRenderAsync = function wrappedRenderAsync(source, suppliedEnv) {
        const env = suppliedEnv ?? {};
        return acceptWork(() => renderWithContext(env, source, () => originalRenderAsync(source, env)));
      };
      wrappedRenderAsync[RENDER_WRAPPER] = session;
      md.renderAsync = wrappedRenderAsync;
    }
  }

  function render(md, source, suppliedEnv) {
    const env = suppliedEnv ?? {};
    if (md.renderAsync?.[RENDER_WRAPPER] === session) return md.renderAsync(source, env);
    return acceptWork(() => renderWithContext(env, source, () => md.render(source, env)));
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    state = 'disposing';
    disposePromise = (async () => {
      if (activeWork > 0) {
        await new Promise(resolve => { drainResolve = resolve; });
      }
      try {
        await renderer.dispose();
      } finally {
        state = 'disposed';
      }
    })();
    return disposePromise;
  }

  const session = { markdownIt, render, dispose };
  return session;
}
