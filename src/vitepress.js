import { createMarkdownSession, isTextGraphRenderFailure } from "./markdown.js";
import { createWorkerRenderer } from "./worker/client.js";
import { createPngAssets } from "./vitepress-assets.js";

/** Compose host hooks without taking ownership of VitePress parsing or page transforms. */
export function withTextGraph(config = {}, options = {}) {
  let command = "serve";
  let session;
  let closed = false;
  const assets = createPngAssets(config);
  const getSession = () => {
    if (closed) throw new Error("TextGraph VitePress session is closed");
    return session ??= createMarkdownSession(createWorkerRenderer(options), {
      ...options,
      // VitePress creates Markdown before our configResolved hook chooses the command.
      get errorMode() { return options.errorMode ?? (command === "build" ? "throw" : "inline"); },
    }, result => assets.add(result));
  };
  const dispose = async () => {
    closed = true;
    try { await session?.dispose(); } finally { assets.clear(); }
  };
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
            catch (error) {
              if (isTextGraphRenderFailure(error)) return cleanupFailure(error);
              // A corrected frontmatter/include/highlighter error can render again in dev.
              throw error;
            }
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
          enforce: "pre",
          resolveId: assets.resolveId,
          load: assets.load,
          configResolved(resolved) {
            command = resolved.command;
            assets.setBase(resolved.base ?? config.base ?? "/");
          },
          configureServer(server) { server.middlewares.use(assets.middleware); },
          generateBundle() { assets.emit(this); },
          async closeServer() { await dispose(); },
          async buildEnd(error) {
            if (error) { try { await dispose(); } catch { /* Preserve the build error. */ } }
          },
          // Vite 8.2 closes dev environments here (closeServer arrived in 8.3).
          // Successful production bundles still precede SSR/search.
          async closeBundle(error) {
            if (command === "serve") await dispose();
            else if (error) { try { await dispose(); } catch { /* Preserve the build error. */ } }
          },
        },
      ],
    },
    async buildEnd(...args) {
      // SSR and local search may render diagrams after the client bundle finishes.
      try {
        await assets.write(args[0]?.outDir);
        await config.buildEnd?.(...args);
      }
      finally { await dispose(); }
    },
  };
}
