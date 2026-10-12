# Development and support

## Regenerate the introduction example

After installing this package's locked dependencies, run `npm run examples:render`.
From the parent DrawMotive workspace, use
`npm run component -- vscode-markdown examples:render`. Playwright's Chromium
must be installed to capture the source-and-diagram image.

The command reads `examples/online-order.textgraph`, checks that the Markdown
example, README snippet, and playground link agree, and renders through the
extension's own Worker with its normal deadline. The generated diagram and
combined introduction image are saved under `media/`.

## Requirements

- VS Code **1.101.0 or newer**, desktop or a Node-based remote Extension Host. VS Code 1.101 introduced Node 22 in both desktop and remote hosts. A browser-only host such as vscode.dev without a remote host is unsupported.
- A **trusted workspace** to render. Restricted Mode displays escaped source with a trust notice and does not start the renderer.

| Layer | Supported environment | Verification boundary |
| --- | --- | --- |
| Contributor build and VSIX packaging | Node.js 22; npm 10 on Linux, Windows and macOS | CI targets all three systems with Node 22 |
| Installed extension | VS Code 1.101+ desktop or Node-based remote Extension Host | VS Code supplies its own Node runtime; a separate Node/npm install is not required |
| Markdown preview | VS Code's built-in preview webview | Host tests target the real Extension Host; this is not a Chromium/Firefox/WebKit browser product |

The 2026-10-01 standalone audit ran Linux Node 22.23.2/npm 10.9.8 unit tests.
That audit did not execute real Extension Host tests or Windows/macOS builds.

Independent of the DrawMotive drawing editor. Uses public `@drawmotive/textgraph@0.2.2-alpha.6`, bundled with its runtime and fonts. Rendering is local; no service, API key, separate npm installation, or private C#/WASM build is needed.

## Errors and limits

SDK syntax diagnostics appear beside the source. Editing triggers a new render. Node names are global; connections inside a group introduce its members, and repeated references reuse those members. Group bodies also allow bare members and nested groups. Connections may style endpoints inline. Connections between groups and separate node decorations stay at the root. Root arrows may target inline groups such as `A -> { B -> C }`. Each render has a 15-second deadline and the Worker is terminated on timeout. Other diagrams continue in a fresh Worker. A timeout is an operational error, not a syntax diagnosis.

Each diagram is limited to 64 KiB of source and a maximum width of 2048 pixels. Complex diagrams may hit the deadline. Bundled SDK fonts determine available glyphs; custom font packs are not yet configurable.

## Security and lifecycle

The preview receives PNG data URIs and escaped diagnostic text. No preview JavaScript, browser Worker, external server, or CSP relaxation is needed. Workspace source is SDK input; never executable JavaScript.

Changed or removed diagrams cancel obsolete work. Closing a document releases its cache. The Worker shuts down after ten idle seconds; inactive caches expire after five minutes because the Markdown extension has no public preview-close event. Deactivation terminates outstanding work.

## Install a VSIX

Run **Extensions: Install from VSIX…** and select `textgraph-markdown-0.2.1.vsix`, or:

```sh
code --install-extension textgraph-markdown-0.2.1.vsix
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

The host test downloads VS Code 1.101.0, installs the actual VSIX into isolated profiles, and tests built-in Markdown Preview through the real Extension Host and webview. Linux CI uses `xvfb-run -a npm run test:host`; a desktop display also works. Set `VSCODE_VERSION=stable` for the current stable host. No C# project is built.

These commands create a local VSIX without publishing. `npm run release:check`
and publication commands retain coordinated release eligibility checks, which
can defer publication while ordinary builds and packaging remain available. See the repository's
[Contributing](../../CONTRIBUTING.md) and [NOTICE](../../NOTICE).
Vulnerability reports follow [Security reporting](../../SECURITY.md).

See [the project repository](https://github.com/drawmotive/markdown-textgraph) and [the SDK](https://github.com/drawmotive/textgraph).
