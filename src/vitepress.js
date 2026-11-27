import textGraphGrammar from "../vscode/syntaxes/textgraph.tmLanguage.json" with { type: "json" };
import markdownInjection from "../vscode/syntaxes/textgraph-markdown.tmLanguage.json" with { type: "json" };
import { createMarkdownSession, isTextGraphRenderFailure } from "./markdown.js";
import { createWorkerRenderer } from "./worker/client.js";
import { createPngAssets } from "./vitepress-assets.js";
import { appearanceStyles, createThemedRenderer, registerTextGraphThemeAccents } from "./vitepress-appearance.js";

/** Compose host hooks without taking ownership of VitePress parsing or page transforms. */
export function withTextGraph(config = {}, options = {}) {
  let command = "serve";
  let session;
  let closed = false;
  const assets = createPngAssets(config);
  const getSession = () => {
    if (closed) throw new Error("TextGraph VitePress session is closed");
    return session ??= createMarkdownSession(createThemedRenderer(createWorkerRenderer(options)), {
      ...options,
      // VitePress creates Markdown before our configResolved hook chooses the command.
      get errorMode() { return options.errorMode ?? (command === "build" ? "throw" : "inline"); },
    }, result => ({ src: assets.add(result), darkSrc: assets.add(result.darkResult), darkResult: result.darkResult }));
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
    head: [...(config.head ?? []), ['style', {}, appearanceStyles]],
    markdown: {
      ...config.markdown,
      languages: [
        ...(config.markdown?.languages ?? []),
        // Shiki owns highlighted source. The textgraph fence still renders a diagram.
        { ...textGraphGrammar, aliases: ["textgraph-source"] },
        // Run the fence rules directly. Lazy Shiki loads can rebuild Markdown and drop injected grammars.
        { name: "textgraph-markdown", scopeName: markdownInjection.scopeName, patterns: markdownInjection.patterns },
      ],
      async shikiSetup(shiki) {
        await registerTextGraphThemeAccents(shiki);
        await config.markdown?.shikiSetup?.(shiki);
      },
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
