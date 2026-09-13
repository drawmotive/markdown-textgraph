import { defineConfig } from "vitepress";
import { withTextGraph } from "@drawmotive/markdown-it-textgraph/vitepress";

defineConfig(withTextGraph({ title: "Docs", themeConfig: { search: { provider: "local" } } }, { errorMode: "throw" }));
