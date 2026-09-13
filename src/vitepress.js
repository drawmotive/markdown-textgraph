import { createTextGraphMarkdown } from "./index.js";

/** Compose host hooks without taking ownership of VitePress parsing or page transforms. */
export function withTextGraph(config = {}, options = {}) {
  let command = "serve";
  let session;
  let closed = false;
  const getSession = () => {
    if (closed) throw new Error("TextGraph VitePress session is closed");
    return session ??= createTextGraphMarkdown({
      ...options,
      // VitePress creates Markdown before our configResolved hook chooses the command.
      get errorMode() { return options.errorMode ?? (command === "build" ? "throw" : "inline"); },
    });
  };
  const dispose = () => { closed = true; return session?.dispose() ?? Promise.resolve(); };
  const cleanupFailure = async error => {
    try { await dispose(); } catch { /* Preserve the original host/SDK failure. */ }
    throw error;
  };
  return {
    ...config,
    markdown: {
      ...config.markdown,
      async config(md) {
        try {
          await config.markdown?.config?.(md);
          md.use(getSession().markdownIt);
          const renderAsync = md.renderAsync.bind(md);
          md.renderAsync = async (...args) => {
            try { return await renderAsync(...args); }
            catch (error) { return cleanupFailure(error); }
          };
        } catch (error) { return cleanupFailure(error); }
      },
    },
    vite: {
      ...config.vite,
      plugins: [
        ...(config.vite?.plugins ?? []),
        {
          name: "textgraph-markdown",
          configResolved(resolved) { command = resolved.command; },
          async closeServer() { await dispose(); },
          async buildEnd(error) {
            if (error) { try { await dispose(); } catch { /* Preserve the build error. */ } }
          },
          // Successful bundles precede SSR/search; only failures are terminal here.
          async closeBundle(error) {
            if (error) { try { await dispose(); } catch { /* Preserve the build error. */ } }
          },
        },
      ],
    },
    async buildEnd(...args) {
      try { await config.buildEnd?.(...args); }
      finally { await dispose(); }
    },
  };
}
