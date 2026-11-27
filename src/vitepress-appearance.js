/** Static pairs follow VitePress's html.dark before hydration as well as after it. */
export const appearanceStyles = '.textgraph img.textgraph-dark{display:none}.dark .textgraph img.textgraph-light{display:none}.dark .textgraph img.textgraph-dark{display:block}';

const sourceAccents = [
  ["punctuation", "#69536e", "#c5b2ca"],
  ["entity.name.type.node", "#166546", "#91d7ad"],
  ["keyword.operator.arrow", "#1158a8", "#8cc3ff"],
  ["keyword.other.style", "#7439a3", "#d2a7ff"],
];

/** Give TextGraph scopes distinct colors in VitePress's default themes. */
export async function registerTextGraphThemeAccents(shiki) {
  for (const name of shiki.getLoadedThemes()) {
    if (name !== "github-light" && name !== "github-dark") continue;
    const theme = shiki.getTheme(name);
    await shiki.loadTheme({
      ...theme,
      settings: [...theme.settings, ...sourceAccents.map(([scope, light, dark]) => ({
        scope: ["source.textgraph " + scope, "meta.embedded.block.textgraph " + scope],
        settings: { foreground: name === "github-dark" ? dark : light },
      }))],
    });
  }
}

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
