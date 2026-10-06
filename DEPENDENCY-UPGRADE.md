# Dependency refresh — 2026-10-06

Third-party direct dependencies use the current stable npm releases, with
compatible transitive updates recorded in both independent lockfiles. The
plugin now verifies Markdown 15, Preact 11 and TypeScript 7; the extension
uses VSCE 4, test-electron 3 and webpack-cli 7.

Deliberate exceptions:

- VitePress remains `2.0.0-alpha.19`. Its 2.x integration is intentional; the
  stable `latest` tag is `1.6.4`, which would downgrade the existing host.
- `@types/node` remains on the latest Node 22 line (`22.20.5`) to describe the
  supported runtime rather than expose APIs available only in Node 26.
- Exact `@drawmotive` versions and registry native assets retain their
  coordinated release identity and integrity.

Markdown 15 includes its own declarations. The plugin infers the instance
type from the default constructor, retaining compatibility with existing
Markdown 14.1 typings that have no named instance type export.
VitePress's alpha declaration surface still describes Markdown 14.
The build checks the core with Markdown 15's types and the VitePress adapter
with Markdown 14's types in separate strict projects. Library checking is
enabled in both. The packed-consumer test also compiles the core strictly
using the declared dependencies and TypeScript 7's optional native compiler,
and a separate packed consumer checks Markdown 14.3.2 with 14.1.2 typings.
The host declaration paths are resolved from installed packages so npm
workspace hoisting does not change the checks.

Verified on Linux x64 / Node 22.23.2: clean installs and zero-vulnerability
audits for both lockfiles, 70 plugin tests, both strict declaration projects,
four Chromium checks, 15 extension tests, production build, VSIX packaging,
and trusted/untrusted VS Code 1.101 host checks. A temporary parent-hoisted
install also passed the declaration build. The host used direct Xvfb because
this environment lacks the `xauth` prerequisite for `xvfb-run`.

Run `npm ci`, `npm test`, `npm run build` and `npm run test:browser` at the
plugin root. Run `npm ci`, `npm test`, `npm run build`, `npm run package` and
`xvfb-run -a npm run test:host` from `vscode/` on headless Linux.
