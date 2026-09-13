# TextGraph Markdown 0.2.0 verification

The exact `textgraph-markdown-0.2.0.vsix` recorded in SHA256SUMS contains public npm `@drawmotive/textgraph@0.2.0`, resolved with registry integrity `sha512-f+rfaCJ+2SMwAUeMdKopZuUvtEIPoOwbxsLIlp/PKoJjsza6pF8htGxA2W9SZorASJeN/1fKm1aclJtBhT1B4A==`. Packaging validates the complete VSIX payload against the installed SDK and checked build.

- All 11 extension tests pass, including native PNG rendering, inline groups, syntax recovery, cancellation and timeout isolation.
- The actual VSIX is installed into isolated profiles on VS Code 1.101.0 (Node 22.15.1) and stable 1.137.0 (Node 24.18.1). Trusted and restricted profiles pass on both hosts.
- `A -> {}` and `A -> {{x}}` render successfully, while the independent diagram remains unchanged. This replaces historical alpha-SDK-failure expectations.
- Preview checks retain strict CSP, ordinary Markdown, unsaved updates, rapid-edit convergence, diagnostics, and close/reopen behavior. JSON evidence and screenshots are adjacent.

Tests ran on Ubuntu/WSL with an isolated Xvfb display. Browser and X11 dependencies were extracted under `/tmp`; the session-local Xvfb locates the extracted xkbcomp binary. No system installation or production runtime change was needed. Current CI runners use Ubuntu only.
