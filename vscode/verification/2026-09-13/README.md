# VS Code TextGraph verification — 2026-09-13

Artifact: `textgraph-markdown-0.1.0.vsix`, `drawmotive.textgraph-markdown@0.1.0`, 136 archive entries, approximately 7.12 MB. See `SHA256SUMS` for the tested artifact checksum.

## Runtime and architecture evidence

The public registry reports `@drawmotive/textgraph@0.1.0-alpha.1` for both latest and alpha, Node >=22. The independent lockfile pins its registry tarball and integrity. All 125 SDK files in the VSIX match the installed public npm package byte-for-byte. The npm Markdown plugin is not required; no local SDK workspace, private C#/WASM build, or runtime download is used.

VS Code invokes `engine.renderer.render` synchronously, so the existing asynchronous VitePress adapter cannot supply completed diagrams at that boundary. Its preview CSP forbids arbitrary browser Worker/WASM execution. The independent extension runs a serial SDK Worker in the Node Extension Host, returns synchronous placeholder/cache HTML, and calls `markdown.preview.refresh` when current work completes. PNG data URIs are permitted by the unchanged strict CSP.

Minimum VS Code 1.101.0 has actual Extension Host Node 22.15.1. Current stable on this date is VS Code 1.137.0, actual Extension Host Node 24.18.1. Links to upstream source and release notes are in ../../RELEASE.md.

## Tests

- 11 native Node tests pass: synchronous delegation, repeated blocks, token-cache refresh, document isolation, obsolete-result rejection, errors and escaping, trust, lifecycle, input bound, serial native ownership, timeout, abort, idle release, crash, real PNG pixels, and post-timeout recovery.
- Real downloaded Microsoft VS Code 1.101.0 and 1.137.0 each install the actual VSIX into isolated extension directories. A separate test extension drives the built-in Markdown Preview; the product is never loaded from its development folder.
- Both trusted and untrusted profiles pass; JSON files record actual trust, Node version, installed product path, CSP, and checks.
- Trusted checks cover multiple PNGs, unsaved edits, rapid-edit convergence, independent errors, recovery, HTML-looking source, strict CSP, ordinary heading/list/link/emphasis/code/local image, and preview close/reopen.
- Restricted Mode shows escaped source, supports automatic updates, and produces no diagram images. Unit tests also prove no renderer call occurs before trust.
- `npm audit` reports zero vulnerabilities after using current copy-webpack-plugin 14.

The environment is Linux x64/WSL with WSLg. Its missing native-keymap dependency logs host keyboard-layout warnings; the real host and preview tests complete with exit code zero. Windows, macOS, SSH/container hosts, and browser-only hosts were not verified. The manifest does not advertise a browser entry point.

## Upstream limitation

Direct public SDK controls: `A -> B` succeeds (224×320 PNG), `A ->` returns `TG_PARSE_ERROR`. Both `A -> {}` and `A -> {{x}}` remain in native rendering past 10 seconds and require termination of the isolated probe process. In Node 22.14.0, terminating the Worker interrupts these cases in 12–130 ms; fresh Workers then render successfully.

Causal boundary: unchanged Markdown fence content reaches the public SDK, where the malformed-input render fails to return. Cancellation belongs to the adapter’s execution boundary because the public SDK exposes no native cancellation contract. The generic deadline terminates the VM and reports an operational error; it neither diagnoses nor repairs syntax. The upstream SDK still needs a fix and public release. No copied parser or syntax-specific branch was introduced.

## Marketplace status

Existing publisher `drawmotive` is used by the public editor extension. No local VSCE PAT is configured. The Azure CLI identity is authenticated but `npx vsce verify-pat --azure-credential drawmotive` fails with Access Denied on publisher permission lookup. The separate vscode-drawmotive repository has a VSCE_PAT secret, which GitHub does not expose for reading or reuse; markdown-textgraph has no repository/environment secret. Organization secret visibility is unavailable.

Missing publication condition: a Marketplace Manage credential authorized for publisher drawmotive (local VSCE_PAT or this repository’s Actions secret), or the appropriate publisher role for the Azure identity. No secret value was logged. The tested VSIX is installable; Marketplace publication is not complete. The release workflow and instructions are ready on the task branch. No push, merge, remote release, or branch cleanup was performed.
