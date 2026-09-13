import type { UserConfig } from "vitepress";
import type { TextGraphMarkdownOptions } from "./index.js";

/** Adds static TextGraph PNGs while preserving existing VitePress hooks. */
export declare function withTextGraph<T extends UserConfig>(config: T, options?: TextGraphMarkdownOptions): T;
