# Development and support

New releases use the same canonical numeric version for the SDK, npm packages and VSIX. Every numeric version packages and publishes as stable, without --pre-release. Historical schema-one releases retain their original versions for verification.

## Regenerate the introduction example

From the parent workspace, run these operations serially:

```bash
npm run component -- vscode-markdown examples:render
npm run component -- vscode-markdown package
npm run component -- vscode-markdown examples:capture
npm run docs:previews -- sync
npm run docs:previews -- check
```

Rendering checks source and versioned Playground links through the extension's
real Worker. Synchronization replaces its ordinary overview with the canonical
shared bytes. Capture uses the packaged VSIX in an isolated trusted workspace,
opens the canonical Markdown beside built-in Preview, waits for the rendered
image, and captures the top-level VS Code workbench. Title bar, activity bar,
sidebar, tabs and status bar must remain visible. No HTML mockup is used.
Capture uses ordinary development-host mode and a 1600 × 1400 isolated window
so the complete overview fits beside its source. Normal host tests keep their
test runner; the launcher requires the capture driver's canonical-source result.

The host launcher downloads the desktop version declared as the minimum in the extension manifest. For offline use,
VSCODE_EXECUTABLE selects an existing desktop executable. TEXTGRAPH_VSIX selects
an existing package. Linux captures always use isolated Xvfb; ordinary host tests
also use it when DISPLAY is absent. Capture evidence next to
the PNG records host version, dimensions and source/pixel hashes. Visually inspect
readability and host surroundings; missing prerequisites must fail the operation.

## Public description assets

Keep README image and example paths relative to this package. The manifest's
`vsce.baseContentUrl` and `vsce.baseImagesUrl` retain the repository's `vscode/`
directory when VSIX packaging rewrites those paths for Marketplace. `vsce` does
not infer that directory from `repository.directory`. These defaults apply to
standalone, development and coordinated release packaging. The development
archive test checks the rewritten image and source links in the actual VSIX.
Marketplace continues to display the previous description until a new version
is published.

## Requirements

- VS Code **1.105.0 or newer**, desktop or a Node-based remote Extension Host. The TextGraph runtime requires WebAssembly exception references. VS Code 1.105 supplies Node.js 22.19.0 in remote hosts, where this feature is enabled by default. A browser-only host such as vscode.dev without a remote host is unsupported.
- A **trusted workspace** to render. Restricted Mode displays escaped source with a trust notice and does not start the renderer.

| Layer | Supported environment | Verification boundary |
| --- | --- | --- |
| Contributor build and VSIX packaging | Node.js 22; npm 10 on Linux, Windows and macOS | CI targets all three systems with Node 22 |
| Installed extension | VS Code 1.105+ desktop or Node-based remote Extension Host | VS Code supplies its own Node runtime. No separate Node/npm install is required. |
| Markdown preview | VS Code's built-in preview webview | Host tests target the real Extension Host; this is not a Chromium/Firefox/WebKit browser product |

The 2026-10-01 standalone audit ran Linux Node 22.23.2/npm 10.9.8 unit tests.
That audit did not execute real Extension Host tests or Windows/macOS builds.

Independent of the DrawMotive drawing editor. Uses public `@drawmotive/textgraph@0.3.0`, bundled with its runtime and fonts. Rendering is local; no service, API key, separate npm installation, or private C#/WASM build is needed.

## Errors and limits

SDK syntax diagnostics appear beside the source. Editing triggers a new render.
Connections inside a group introduce local nodes, and repeated short references
in that group reuse them. The same name in different groups creates different
nodes. Root short references and decorations resolve only when the name is
unique; ambiguous names report the matching qualified names, such as
`Review.done` and `Delivery.done`. Group names follow the same rule, including
unique trailing paths for nested objects. Group bodies also allow bare members
and nested groups. Connections may style endpoints inline or use qualified
endpoints to refer to existing external objects without moving them. Standalone
node decorations stay at the root. Root arrows may target inline groups such as
`A -> { B -> C }`.

Each render has a 15-second deadline and the Worker is terminated on timeout.
Other diagrams continue in a fresh Worker. A timeout is an operational error,
not a syntax diagnosis.

Each diagram is limited to 64 KiB of source and a maximum width of 2048 pixels. Complex diagrams may hit the deadline. Bundled SDK fonts determine available glyphs; custom font packs are not yet configurable.

## Security and lifecycle

The preview receives PNG data URIs and escaped diagnostic text. No preview JavaScript, browser Worker, external server, or CSP relaxation is needed. Workspace source is SDK input; never executable JavaScript.

Changed or removed diagrams cancel obsolete work. Closing a document releases its cache. The Worker shuts down after ten idle seconds; inactive caches expire after five minutes because the Markdown extension has no public preview-close event. Deactivation terminates outstanding work.

## Install a VSIX

Run **Extensions: Install from VSIX…** and select `textgraph-markdown-0.3.0.vsix`, or:

```sh
code --install-extension textgraph-markdown-0.3.0.vsix
```

## Development

From this repository’s independent `vscode` npm package:

```sh
npm ci --workspaces=false
npm test
npm run build
npm run package
npm run test:host
```

The host test downloads the minimum supported VS Code version, installs the actual VSIX into isolated profiles, and tests built-in Markdown Preview through the real Extension Host and webview. Linux CI uses `xvfb-run -a npm run test:host`. A desktop display also works. Set `VSCODE_VERSION=stable` for the current stable host. No C# project is built.

These commands create a local VSIX without publishing. `npm run release:check`
and publication commands retain coordinated release eligibility checks, which
can defer publication while ordinary builds and packaging remain available. See the repository's
[Contributing](../../CONTRIBUTING.md) and [NOTICE](../../NOTICE).
Vulnerability reports follow [Security reporting](../../SECURITY.md).

See [the project repository](https://github.com/drawmotive/markdown-textgraph) and [the SDK](https://github.com/drawmotive/textgraph).
