# TextGraph for Markdown

Render `textgraph` fenced code blocks as static PNG diagrams in markdown-it and VitePress. Rendering runs in a Node Worker through the public `@drawmotive/textgraph` package. Visitors receive images without downloading a diagram runtime.

This package is prepared locally for its first release; npm publication is pending. The SDK dependency is the published `0.1.0-alpha.1`, pinned in the independent lockfile.

## Requirements

- Node.js 22.12.0 or later.
- markdown-it 14.x; VitePress support is tested against 2.0.0-alpha.19.
- A content security policy permitting `img-src data:`. Images are embedded as data URLs, which increases page size.

## markdown-it

Once published, install `@drawmotive/markdown-it-textgraph` and `markdown-it`. Before publication, install the tarball produced by `npm pack` instead.

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

The example can run with `npx vitepress dev examples/vitepress` or `npx vitepress build examples/vitepress`. No browser runtime or external PNG directory is needed for either `/` or a nested base path.

## Options and diagnostics

Both factories accept:

- `render`: SDK `scale`, `padding` and `maxWidth` options.
- `languagePacks`: SDK language packs containing font URLs or byte arrays and optional fallback families. Inputs are copied when the session is created.
- `errorMode`: `inline` or `throw`. Plain markdown-it defaults to `inline`.
- `onDiagnostic`: receives `{ file?, blockIndex, diagnostic, documentLocation? }`, including warnings from successful diagrams.

Structured positions are zero-based, with UTF-16 columns. Original-file locations are included only when the parser source can be matched to the supplied document. Frontmatter offsets are verified; included or custom-preprocessed text may have only block-local SDK positions. Error blocks escape source and messages, and disable Vue interpolation.

Custom fonts can be injected using the SDK public language-pack structure. The separately planned `@drawmotive/textgraph-fonts-zh-cn` package is not yet available on the public registry; it is not a required dependency.

The pinned SDK has a known issue with closed brace-delimited connection targets such as `A -> {}`: native rendering can run away. This plugin does not provide cancellation of native work or rewrite diagram syntax. An upstream SDK release is needed to resolve that case.

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
