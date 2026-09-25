# TextGraph for Markdown

> **[Report all TextGraph issues on GitHub →](https://github.com/drawmotive/textgraph/issues)**
> Bugs, feature requests, and documentation issues for Markdown, VitePress, VS Code, and the SDK all belong in this shared tracker.

For VS Code’s built-in Markdown Preview, see the independent [TextGraph extension](vscode/README.md). Its VSIX bundles the public SDK and does not depend on this npm plugin being published.

Render `textgraph` fenced code blocks as static PNG diagrams in markdown-it and VitePress. Rendering runs in a Node Worker through the public `@drawmotive/textgraph` package. Visitors receive images without downloading a diagram runtime.

Release `0.2.2-alpha.2` uses the published TextGraph SDK `0.2.2-alpha.2`, pinned in the independent lockfile.

## Requirements

- Node.js 22.12.0 or later.
- markdown-it 14.x; VitePress support is tested against 2.0.0-alpha.19.
- Plain markdown-it embeds images and needs a content security policy permitting `img-src data:`. VitePress uses independent images served by the site and can use `img-src 'self'`.

## markdown-it

Install `@drawmotive/markdown-it-textgraph@0.2.2-alpha.2` and `markdown-it`.

```javascript
import MarkdownIt from "markdown-it";
import { createTextGraphMarkdown } from "@drawmotive/markdown-it-textgraph";

const md = new MarkdownIt();
const diagrams = createTextGraphMarkdown();
md.use(diagrams.markdownIt);
try {
  const html = await diagrams.render(md, "```textgraph\nA -> B\n```");
  console.log(html);
} finally {
  await diagrams.dispose();
}
```

Use the asynchronous `render` entry to obtain diagrams. Direct `md.render()` stays synchronous and retains the original code block. Documents without diagrams do not start a Worker. Each session reuses its Worker; call `dispose()` after the last document to release it.

The language token must be lowercase `textgraph`; additional fence metadata is ignored. Backtick and tilde fences, lists, and blockquotes are supported. Identical blocks within one document share rendering work. Separate documents can render concurrently with separate `env` objects; overlapping calls using the same `env` are rejected.

## VitePress

```typescript
import { defineConfig } from "vitepress";
import { withTextGraph } from "@drawmotive/markdown-it-textgraph/vitepress";

export default defineConfig(withTextGraph({
  title: "Documentation",
  themeConfig: { search: { provider: "local" } },
}));
```

Add a diagram:

````markdown
```textgraph
A -> B
```
````

The adapter preserves existing Markdown hooks, includes, asynchronous highlighting, search and build hooks. Development displays invalid diagrams inline; production builds fail on invalid diagrams by default. Use `{ errorMode: "inline" }` as the second argument to opt into visible error blocks for a site containing draft syntax. SDK or Worker failures always reject rendering.

The example can run with `npx vitepress dev examples/vitepress` or `npx vitepress build examples/vitepress`. VitePress serves independent PNGs during development and writes them to its build assets directory. URLs respect the configured `base` and `assetsDir`; no browser runtime or manually managed image directory is needed.

Files are named `textgraph-<hash>.png`, using the first 20 hexadecimal characters of the final PNG's SHA-256. Identical PNGs share one file across pages, and changed pixels or rendering metadata produce a new URL. Generated files belong to the build output, not the Markdown source tree. Plain markdown-it keeps base64 images for self-contained HTML.

## Options and diagnostics

Both factories accept:

- `render`: SDK `scale`, `padding` and `maxWidth` options. Web rendering defaults to scale `1`; images display at logical diagram dimensions and shrink to fit their container. Set `scale: 2` explicitly for higher raster density. `scale` controls raster density; it does not enlarge the diagram.
- `languagePacks`: SDK language packs containing font URLs or byte arrays and optional fallback families. Inputs are copied when the session is created.
- `errorMode`: `inline` or `throw`. Plain markdown-it defaults to `inline`.
- `onDiagnostic`: receives `{ file?, blockIndex, diagnostic, documentLocation? }`, including warnings from successful diagrams.

Structured positions are zero-based, with UTF-16 columns. Original-file locations are included only when the parser source can be matched to the supplied document. Frontmatter offsets are verified; included or custom-preprocessed text may have only block-local SDK positions. Error blocks escape source and messages, and disable Vue interpolation.

SDK `0.2.2-alpha.2` returns logical display dimensions even when `maxWidth` caps raster resolution. SDK `0.2.0` lacks that metadata: the adapter divides pixel dimensions by the requested scale, so a clamped image also displays smaller with that older SDK. DPI metadata does not control HTML image size.

Custom fonts can be injected using the SDK public language-pack structure. The shared optional `@drawmotive/textgraph-fonts` package is not yet available on the public registry; it is not a required dependency.

SDK `0.2.0` renders inline group targets such as `A -> {}` and `A -> {{x}}`. Unmatched closing braces return syntax diagnostics.

## Development

```bash
npm ci
npm test
npm run build
npm run test:browser
npm pack
```

Tests use the registry SDK, real PNG decoding, Worker shutdown, VitePress static builds and browser verification. TypeScript declarations are checked without building C# or copying WASM. The root entry does not require VitePress types; the `/vitepress` entry does.

MIT licensed.
