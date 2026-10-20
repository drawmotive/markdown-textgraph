# npm release

Publish only through `.github/workflows/release.yml` in GitHub Actions. The workflow uses Ubuntu and publishes an exact retained tarball with provenance. The superproject `release.json` owns the coordinated version and projects it into `.release/target.json`.

The current stable target is `0.3.0`, published to `latest` with public TextGraph SDK `0.3.0`. Numeric patches `1` through `9` are previews published to `alpha`; patch `0` is stable. Prepare package and lock metadata with superproject `npm run release:prepare -- markdown`, finalize the changelog, and run the package checks. Never substitute a local SDK for the public dependency.

The coordinated `npm run release:automate -- --publish` command retains the tested archive and evidence, creates or verifies the immutable `markdown-v0.3.0` tag for this release, and explicitly dispatches the publisher with `artifact_tag`, `archive_file`, and `artifact_integrity`. A tag push alone does not start publication. The retained-artifact job verifies the source commit and reviewed SHA-512 before publishing without rebuilding. Retry a failed publication with the same retained artifact. An identical already-published version is verified without another upload.

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
