/** Static pairs follow VitePress's html.dark before hydration as well as after it. */
export const appearanceStyles = '.textgraph img.textgraph-dark{display:none}.dark .textgraph img.textgraph-light{display:none}.dark .textgraph img.textgraph-dark{display:block}';

/** One Worker/SDK owns both native renders; ordinary Markdown stays single-image. */
export function createThemedRenderer(renderer) {
  return {
    async renderPng(source) {
      const light = await renderer.renderPng(source, { dark: false });
      if (!light.success) return light;
      const dark = await renderer.renderPng(source, { dark: true });
      return dark.success ? { ...light, darkResult: dark } : dark;
    },
    dispose: () => renderer.dispose(),
  };
}
