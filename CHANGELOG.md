# Changelog

## 0.2.2-alpha.1 — 2026-09-25

- Pin TextGraph SDK 0.2.2-alpha.1 for on-demand Chinese, Japanese and emoji rendering.
- Publish previews to the alpha npm channel while preserving stable latest.

## 0.2.1

- Default Markdown and VitePress PNG rendering to scale 1, matching the SDK; explicit higher scales remain supported.
- Emit content-addressed VitePress PNG assets and use logical display dimensions when the SDK provides them.
- Use the exact public TextGraph SDK 0.2.1 dependency.

## 0.2.0

- First public Markdown and VitePress integration release.
- Render diagrams with the exact public TextGraph SDK 0.2.0 dependency.
- Support inline-group rendering and recover after invalid-brace diagnostics.
