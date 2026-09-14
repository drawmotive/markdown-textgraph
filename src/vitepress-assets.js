import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** One host session owns immutable PNGs across Markdown, SSR, and search passes. */
export function createPngAssets({ base = "/", assetsDir = "assets" } = {}) {
  const directory = assetsDir.replaceAll("\\", "/").replace(/^\.?\/|\/$/g, "");
  if (!directory || directory.split("/").some(part => part === ".." || part === "." || !part)) {
    throw new Error("TextGraph assetsDir must be inside the build output");
  }
  const assets = new Map();
  let urlBase = base;
  const urlPath = file => file.split("/").map(encodeURIComponent).join("/");
  const urlFor = file => new URL(urlBase.replace(/\/$/, "") + "/" + urlPath(file), "http://textgraph.local").pathname;
  const fileFor = url => [...assets.keys()].find(file => url === urlFor(file) || url === "/" + urlPath(file));
  const modulePrefix = "\0textgraph-png:";
  return {
    setBase(value) { urlBase = value; },
    add(result) {
      const bytes = Buffer.from(result.png, "base64");
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
      const file = `${directory}/textgraph-${hash}.png`;
      const previous = assets.get(file);
      if (previous && !previous.equals(bytes)) throw new Error("TextGraph PNG filename collision");
      assets.set(file, bytes);
      return urlFor(file);
    },
    middleware(request, response, next) {
      const pathname = request.url?.split("?", 1)[0];
      // Vite strips the configured base before custom middleware in some hosts.
      const file = fileFor(pathname);
      if (!file || !["GET", "HEAD"].includes(request.method)) return next();
      const bytes = assets.get(file);
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Content-Length", bytes.length);
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.end(request.method === "HEAD" ? undefined : bytes);
    },
    // Vue may turn absolute img URLs into imports. Resolve only registered PNGs
    // to URL modules so the host never reads nonexistent source-tree files.
    resolveId(id) {
      const file = fileFor(id);
      if (file) return modulePrefix + file;
    },
    load(id) {
      if (id.startsWith(modulePrefix)) return `export default ${JSON.stringify(urlFor(id.slice(modulePrefix.length)))};`;
    },
    emit(context) {
      for (const [fileName, source] of assets) context.emitFile({ type: "asset", fileName, source });
    },
    async write(outDir) {
      if (!outDir || assets.size === 0) return;
      await mkdir(path.join(outDir, directory), { recursive: true });
      for (const [file, bytes] of assets) await writeFile(path.join(outDir, file), bytes);
    },
    clear() { assets.clear(); },
  };
}
