# npm release

Publish only through `.github/workflows/release.yml` in GitHub Actions. The workflow uses Ubuntu, runs the Node 22.12/24 and browser checks, retains a single tarball and SHA-512 receipt, then publishes those exact bytes with provenance. The generated `.release/target.json` owns the coordinated version.

The coordinated target is `0.2.2-alpha.1`, published to `alpha` while preserving stable `latest=0.2.1`. Prepare package and lock metadata from public TextGraph SDK `0.2.2-alpha.1` with superproject `npm run release:prepare -- markdown`, finalize the changelog, and run the package checks. Never substitute a local SDK for the public dependency.

After verification and authorized integration, create `markdown-v0.2.2-alpha.1` on the verified release commit and push that tag to start publication. Manual dispatch must select the same release tag; dispatching from main is rejected. Retry a failed publication job with its retained artifact. An identical already-published version is verified without another upload.

## First publication credentials

Version `0.2.0` is already published. The bootstrap instructions below apply only to a package that has not yet been published: configure an npm publishing credential with access to the `@drawmotive` scope as the `NPM_TOKEN` GitHub Actions secret in `drawmotive/markdown-textgraph`, preferably in the `npm` environment. No local npm login or local publication is required. The credential must satisfy npm automation and 2FA requirements.

After the first publication, configure this npm trusted publisher:

- Organization: `drawmotive`
- Repository: `markdown-textgraph`
- Workflow filename: `release.yml`
- Environment: `npm`
- Allowed action: direct `npm publish`

Subsequent releases use OIDC. Remove the bootstrap token once the trusted publisher is configured. See https://docs.npmjs.com/trusted-publishers/ .

The VS Code extension has its separate Actions workflow and Marketplace credential; see `vscode/RELEASE.md`.
