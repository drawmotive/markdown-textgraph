import { defineConfig } from "vitepress";
import { withTextGraph } from "@drawmotive/markdown-it-textgraph/vitepress";

export default defineConfig(withTextGraph({
  title: "TextGraph Markdown",
  themeConfig: { search: { provider: "local" } },
}));
