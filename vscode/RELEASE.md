# Release process

Release version/channel come from the superproject release.json, projected into .release/target.json. Do not bump this package independently. Run npm run release:check before packaging; unprepared dependencies block release. The current artifact remains historical until preparation succeeds.

Extension: `drawmotive.textgraph-markdown`. Independently versioned in `vscode/package.json`; npm Markdown plugin publication is not required.

## Prepare and verify

1. Update the superproject release.json, run release:sync, then prepare this component from its published public dependencies. Update the changelog on the task branch.
2. In `vscode`, run `npm ci --workspaces=false`, `npm test`, and `npm run package`. Webpack copies the installed public npm SDK with its module/asset paths intact. No private build tooling runs.
3. Run `npm run test:host` and `VSCODE_VERSION=stable npm run test:host`. Both install the VSIX into isolated extension directories. Linux CI uses Xvfb.
4. Inspect `npx vsce ls --no-dependencies` and record the SHA-256. Publish the tested VSIX unchanged.

## Marketplace

Use existing publisher **drawmotive**. A credential owner needs publisher access and a Marketplace **Manage** PAT. Store it in local `VSCE_PAT` or the **drawmotive/markdown-textgraph** repository Actions secret `VSCE_PAT`. Never put credentials in arguments, source, logs, or the VSIX. Secrets in `vscode-drawmotive` are not automatically available here.

```sh
npx vsce verify-pat drawmotive
npm run publish:vsix
```

An authorized Azure CLI identity can instead use `--azure-credential`; authentication alone does not grant publisher permissions.

The **VS Code extension** workflow packages and tests on minimum/stable hosts, uploads the VSIX, and publishes only when its explicit `publish` input is true. It does not bump versions, create tags, push commits, or publish npm packages. The workflow must exist on the selected remote branch before dispatch.

If publisher access is unavailable, deliver the tested VSIX and checksum; do not report Marketplace publication as complete. Test Windows/macOS and remote environments separately before claiming verification there.

## Host contract

- [Markdown extension guide](https://code.visualstudio.com/api/extension-guides/markdown-extension): `markdown.markdownItPlugins` and `extendMarkdownIt`.
- [VS Code 1.101 renderer](https://github.com/microsoft/vscode/blob/1.101.0/extensions/markdown-language-features/src/markdownEngine.ts): synchronous `engine.renderer.render`; `env.currentDocument` identifies ownership.
- [Refresh command](https://github.com/microsoft/vscode/blob/1.101.0/extensions/markdown-language-features/src/commands/refreshPreview.ts): `markdown.preview.refresh` clears the host cache and refreshes previews.
- [Preview CSP](https://github.com/microsoft/vscode/blob/1.101.0/extensions/markdown-language-features/src/preview/documentRenderer.ts): strict mode permits PNG `data:` images, without arbitrary browser Worker/SDK execution.
- [VS Code 1.101 release notes](https://code.visualstudio.com/updates/v1_101): Node 22.15.1, Electron 35, and Node 22 in remote hosts establish the minimum for SDK `node >=22`.

The existing async markdown-it/VitePress adapter awaits diagrams. This synchronous adapter returns placeholders/cache results and refreshes after completion; the adapters intentionally own different lifecycles.

## Local development

Use the superproject development command to rebuild native code and select the
local SDK before building this extension. It provides the temporary dependency
links and these absolute paths:

- `DRAWMOTIVE_TEXTGRAPH_SDK`: the local SDK source package.
- `DRAWMOTIVE_TEXTGRAPH_RUNTIME`: one generated native runtime directory.
- `DRAWMOTIVE_DEV_OUTPUT`: an output directory inside ignored `.local`.

`npm run build:dev` writes a runnable extension to `$DRAWMOTIVE_DEV_OUTPUT/extension`.
`npm run package:dev` also writes `textgraph-markdown-<version>-development.vsix`
in that output directory. It validates SDK resolution, the native development
marker, every asset hash, and the selected fonts before packaging. Public npm
dependency versions and lockfiles stay unchanged. Both channels use the same
webpack extension build.

The development VSIX contains the selected SDK, runtime, and fonts. Install it
manually with **Extensions: Install from VSIX**; no development environment
variables are required in the installed extension. It uses the normal extension
identity and therefore replaces another installed version of this extension.
For an isolated automated installation, set `TEXTGRAPH_VSIX` to its absolute path
and run `npm run test:host`, then `VSCODE_VERSION=stable npm run test:host`. Linux
headless runs require Xvfb.

The archive and its display name identify it as a development build. The staged
manifest is private and has no publication scripts. Development commands do not
change the existing `build`, `package`, or publication release gates; use the
normal release workflow to produce a distributable artifact.
