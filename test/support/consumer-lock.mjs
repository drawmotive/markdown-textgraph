import assert from "node:assert/strict";

const registry = "https://registry.npmjs.org/";

/** Keep packed-consumer installs on the reviewed public dependency graph. The
 * only local input is the newly packed plugin; its SDK stays registry-owned. */
export function consumerLock(manifest, source, pack, names, compatibility) {
  const available = { ...source.packages, ...compatibility?.packages };
  const dependencies = { [manifest.name]: "file:./" + pack.filename };
  const packages = {};
  const find = (name, owner = "") => {
    for (let directory = owner; ; directory = directory.slice(0, Math.max(0, directory.lastIndexOf("/node_modules/")))) {
      const key = (directory ? directory + "/" : "") + "node_modules/" + name;
      if (available[key]) return key;
      if (!directory) break;
    }
  };
  const include = key => {
    if (packages[key]) return;
    const entry = available[key];
    assert.ok(entry && !entry.link && entry.resolved?.startsWith(registry) && entry.integrity, "Consumer dependency must have a locked public archive: " + key);
    const { dev, devOptional, peer, ...installed } = entry;
    packages[key] = structuredClone(installed);
    for (const [name, optional] of [
      ...Object.keys(entry.dependencies ?? {}).map(name => [name, false]),
      ...Object.keys(entry.optionalDependencies ?? {}).map(name => [name, true]),
      ...Object.keys(entry.peerDependencies ?? {}).filter(name => !entry.peerDependenciesMeta?.[name]?.optional).map(name => [name, false]),
    ]) {
      const dependency = find(name, key);
      assert.ok(dependency || optional, "Consumer lock is missing dependency: " + key + " -> " + name);
      if (dependency) include(dependency);
    }
  };
  for (const name of [...Object.keys(manifest.dependencies ?? {}), ...names]) {
    const key = find(name);
    assert.ok(key, "Consumer lock is missing root dependency: " + name);
    include(key);
    if (names.includes(name)) dependencies[name] = available[key].version;
    else assert.equal(available[key].version, manifest.dependencies[name], "Packed dependency differs from the reviewed lock: " + name);
  }
  packages["node_modules/" + manifest.name] = {
    version: manifest.version, resolved: dependencies[manifest.name], integrity: pack.integrity,
    ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
    ...(manifest.peerDependencies ? { peerDependencies: manifest.peerDependencies } : {}),
    ...(manifest.peerDependenciesMeta ? { peerDependenciesMeta: manifest.peerDependenciesMeta } : {}),
    ...(manifest.engines ? { engines: manifest.engines } : {}),
  };
  packages[""] = { dependencies };
  return { manifest: { private: true, type: "module", dependencies }, lock: { lockfileVersion: 3, requires: true, packages } };
}
