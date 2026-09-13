const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = file => JSON.parse(fs.readFileSync(file, "utf8"));

/** Verify the archive itself before giving it to vsce. A release-ready working
 * tree and a version-shaped filename do not establish what an old VSIX contains. */
async function verifyVsix(filename, root, { validateCurrent } = {}) {
  root = fs.realpathSync(root);
  const requireComponent = createRequire(path.join(root, "package.json"));
  const validate = validateCurrent ?? (directory => requireComponent(path.join(directory, ".release/check.cjs")).checkComponent(directory, { ready: true, installed: true }));
  const errors = await validate(root);
  if (!Array.isArray(errors) || errors.length) throw new Error("Current component is not release-ready: " + (errors?.join?.("; ") ?? "invalid gate result"));
  const target = json(path.join(root, ".release/target.json"));
  const pkg = json(path.join(root, "package.json"));
  if (pkg.name !== target.name || pkg.version !== target.version || typeof pkg.publisher !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(pkg.publisher)) throw new Error("Current package identity does not match the release target.");
  const expected = new Map([["extension/package.json", { file: path.join(root, "package.json") }]]);
  for (const directory of ["dist", "media"]) {
    const files = fileTree(path.join(root, directory));
    if (!files.size) throw new Error(`Current ${directory} directory is empty; build the extension before validating its VSIX.`);
    for (const [relative, file] of files) expected.set(`extension/${directory}/${relative}`, { file });
  }
  // Webpack output can itself be stale. Bind every bundled public SDK file to
  // the checked installation instead of trusting matching archive/dist copies.
  const sdkPrefix = "dist/node_modules/@drawmotive/textgraph/";
  const sdk = fileTree(path.join(root, "node_modules/@drawmotive/textgraph"));
  for (const [relative, file] of sdk) {
    const key = `extension/${sdkPrefix}${relative}`;
    const bundled = expected.get(key);
    if (!bundled) throw new Error(`Built extension is missing public SDK file ${relative}; rebuild from the checked installation.`);
    if (hash(fs.readFileSync(bundled.file)) !== hash(fs.readFileSync(file))) throw new Error(`Built extension contains a stale public SDK file ${relative}; rebuild before packaging.`);
  }
  for (const key of expected.keys()) if (key.startsWith("extension/" + sdkPrefix) && !sdk.has(key.slice(("extension/" + sdkPrefix).length))) throw new Error("Built extension contains unrecognized public SDK files; rebuild its dist directory.");
  for (const entry of expected.values()) {
    const bytes = fs.readFileSync(entry.file);
    entry.size = bytes.length; entry.hash = hash(bytes);
  }
  let xml;
  const seen = new Set();
  const yauzl = requireComponent("yauzl");
  await new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError) { reject(new Error("Cannot read VSIX archive: " + openError.message)); return; }
      let failed = false;
      const fail = error => { if (!failed) { failed = true; zip.close(); reject(error); } };
      zip.on("error", fail);
      zip.on("end", () => { if (!failed) resolve(); });
      zip.on("entry", entry => {
        const name = entry.fileName;
        if (seen.has(name)) { fail(new Error("VSIX contains duplicate entry " + name)); return; }
        seen.add(name);
        if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) { fail(new Error("VSIX contains unsafe entry " + name)); return; }
        if (name.endsWith("/")) { zip.readEntry(); return; }
        const wanted = expected.get(name);
        const manifest = name === "extension.vsixmanifest";
        if (!wanted && !manifest) {
          if (name.startsWith("extension/dist/") || name.startsWith("extension/media/")) { fail(new Error("VSIX contains unexpected runtime/resource entry " + name)); return; }
          zip.readEntry(); return;
        }
        if ((wanted && wanted.size !== entry.uncompressedSize) || (manifest && entry.uncompressedSize > 1048576)) { fail(new Error("VSIX entry size differs from the checked build: " + name)); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) { fail(streamError); return; }
          const digest = createHash("sha256");
          const chunks = [];
          let size = 0;
          stream.on("error", fail);
          stream.on("data", bytes => {
            size += bytes.length;
            if (size > entry.uncompressedSize) { stream.destroy(); fail(new Error("VSIX entry exceeds its declared size: " + name)); return; }
            digest.update(bytes); if (manifest) chunks.push(bytes);
          });
          stream.on("end", () => {
            if (failed) return;
            if (size !== entry.uncompressedSize || (wanted && digest.digest("hex") !== wanted.hash)) { fail(new Error("VSIX bytes differ from the checked build: " + name)); return; }
            if (manifest) xml = Buffer.concat(chunks).toString("utf8");
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
  for (const name of expected.keys()) if (!seen.has(name)) throw new Error("VSIX is missing checked runtime/resource entry " + name);
  if (!xml) throw new Error("VSIX is missing extension.vsixmanifest.");
  // Parse the small packaging identity/property subset without evaluating XML
  // entities or accepting duplicate authorities. vsce owns the full schema.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("VSIX manifest contains unsupported XML declarations.");
  xml = xml.replace(/<!--[^]*?-->/g, "");
  const identities = [...xml.matchAll(/<Identity\b([^>]*)\/?\s*>/g)].map(match => attributes(match[1]));
  if (identities.length !== 1 || identities[0].Id !== pkg.name || identities[0].Version !== target.version || identities[0].Publisher !== pkg.publisher) throw new Error("VSIX manifest identity/version does not match the release target; a renamed old archive is not a release.");
  const flags = [...xml.matchAll(/<Property\b([^>]*)\/?\s*>/g)].map(match => attributes(match[1])).filter(item => item.Id === "Microsoft.VisualStudio.Code.PreRelease");
  if (flags.length > 1 || flags.some(flag => !["true", "false"].includes(flag.Value))) throw new Error("VSIX manifest contains ambiguous prerelease metadata.");
  const preRelease = flags[0]?.Value === "true";
  if (preRelease !== (target.channel !== "stable")) throw new Error("VSIX prerelease channel does not match the release target; package using the intended channel.");
  return { name: pkg.name, version: target.version, publisher: pkg.publisher, preRelease };
}

function fileTree(root) {
  const result = new Map();
  if (!fs.existsSync(root)) throw new Error("Required release directory is missing: " + root);
  const canonical = fs.realpathSync(root);
  if (canonical !== root) throw new Error("Release files must not use symlink directories: " + root);
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name, file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Release files must not use symlinks: " + relative);
      if (entry.isDirectory()) visit(file, relative + "/");
      else if (entry.isFile()) result.set(relative, file);
      else throw new Error("Release path is not a regular file: " + relative);
    }
  }
  visit(root, "");
  return result;
}

function attributes(source) {
  const result = {};
  const matcher = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])([^]*?)\2/g;
  for (const match of source.matchAll(matcher)) {
    if (Object.hasOwn(result, match[1])) throw new Error("VSIX identity/property attributes must be unique.");
    const entities = { amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39) };
    result[match[1]] = match[3].replace(/&([^;]+);/g, (entity, name) => {
      if (!Object.hasOwn(entities, name)) throw new Error("VSIX manifest uses an unsupported XML entity.");
      return entities[name];
    });
  }
  return result;
}

module.exports = { verifyVsix };
